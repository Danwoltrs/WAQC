import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create admin client with service role key (bypasses RLS)
// This is needed because RLS on cupping_sessions has complex JSONB checks
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * GET /api/cupping/my-samples
 * Get samples assigned to the current user through cupping sessions
 *
 * Only returns samples where:
 * 1. User is in cupping_sessions.cupper_ids
 * 2. Session status is 'active' or 'review'
 * 3. Sample is in 'analysis' or 'review' workflow stage
 *    (review samples may still need grading before certificate can be generated)
 *
 * Query params:
 * - include_completed: 'true' to also include samples where user has already submitted scores
 * - session_status: 'active' | 'review' | 'all' (default: 'all' active + review)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const includeCompleted = searchParams.get('include_completed') === 'true'
    const sessionStatus = searchParams.get('session_status') || 'all'

    // Get user profile to check if they are a cupper
    // Note: is_cupper and is_master_cupper may not be in TypeScript types yet (new migration)
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, is_q_grader, is_master_cupper, laboratory_id, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // A user can cup if they are:
    // 1. A Q grader
    // 2. A master cupper
    // 3. Have a cupper-related qc_role (lab_personnel, lab_manager, lab_admin, cupper)
    const canCup = profile.is_q_grader ||
                   profile.is_master_cupper ||
                   ['lab_personnel', 'lab_manager', 'lab_admin', 'cupper'].includes(profile.qc_role)

    // For now, we don't restrict access based on cupper status
    // The key restriction is whether they are assigned to a cupping session
    // If someone is assigned to a session, they can see those samples regardless of role

    // Build status filter
    let statusFilter: string[]
    if (sessionStatus === 'active') {
      statusFilter = ['active']
    } else if (sessionStatus === 'review') {
      statusFilter = ['review']
    } else {
      statusFilter = ['active', 'review']
    }

    // Get cupping sessions where this user is assigned
    // Use admin client to bypass RLS - we filter by user.id in the contains query
    // Use .filter() with 'cs' for JSONB array contains (avoids incorrect format from .contains())
    const { data: sessions, error: sessionsError } = await (supabaseAdmin as any)
      .from('cupping_sessions')
      .select(`
        id,
        sample_ids,
        cupper_ids,
        status,
        session_type,
        session_date,
        laboratory_id,
        min_cuppers_required,
        allow_single_cupper,
        cupper_completion,
        discrepancy_detected,
        validated_by,
        validated_at,
        finalized_by,
        finalized_at
      `)
      .in('status', statusFilter)
      .filter('cupper_ids', 'cs', JSON.stringify([user.id]))

    if (sessionsError) {
      console.error('Error fetching cupping sessions:', sessionsError)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        samples: [],
        sessions: [],
        message: 'No active cupping sessions assigned'
      })
    }

    // Collect all sample IDs from sessions
    const allSampleIds = new Set<string>()
    const sampleSessionMap = new Map<string, string[]>() // sample_id -> session_ids

    for (const session of sessions) {
      if (session.sample_ids && Array.isArray(session.sample_ids)) {
        for (const sampleId of session.sample_ids) {
          allSampleIds.add(sampleId)
          if (!sampleSessionMap.has(sampleId)) {
            sampleSessionMap.set(sampleId, [])
          }
          sampleSessionMap.get(sampleId)!.push(session.id)
        }
      }
    }

    if (allSampleIds.size === 0) {
      return NextResponse.json({
        samples: [],
        sessions,
        message: 'No samples in assigned sessions'
      })
    }

    // Get sample details for all assigned samples
    // Use admin client to bypass RLS - samples have lab-specific access rules
    // Include samples in 'analysis' stage OR 'review' stage (review samples may still need grading)
    // Exclude soft-deleted samples (deleted_at is set on soft delete)
    const { data: samples, error: samplesError } = await (supabaseAdmin as any)
      .from('samples')
      .select(`
        id,
        tracking_number,
        client_id,
        origin,
        sample_type,
        ico_number,
        container_nr,
        workflow_stage,
        status,
        quality_spec_id,
        created_at,
        client:clients!samples_client_id_fkey(id, company, fantasy_name),
        quality_spec:client_qualities(
          id,
          custom_name,
          template_id,
          cups_per_sample,
          custom_parameters,
          template:quality_templates(id, name_en, parameters)
        )
      `)
      .in('id', Array.from(allSampleIds))
      .in('workflow_stage', ['analysis', 'review'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Get existing scores for this user to determine which samples are already scored
    const { data: existingScores, error: scoresError } = await supabase
      .from('cupping_scores')
      .select('sample_id, session_id, id')
      .eq('cupper_id', user.id)
      .in('sample_id', Array.from(allSampleIds))

    if (scoresError) {
      console.error('Error fetching existing scores:', scoresError)
    }

    // Build a set of scored sample IDs
    const scoredSampleIds = new Set(existingScores?.map(s => s.sample_id) || [])

    // Add scoring status to each sample
    const samplesWithStatus = (samples || []).map((sample: any) => ({
      ...sample,
      session_ids: sampleSessionMap.get(sample.id) || [],
      has_user_score: scoredSampleIds.has(sample.id),
      cupper_id: user.id // Include current user's ID for reference
    }))

    // Filter out completed samples if not requested
    const filteredSamples = includeCompleted
      ? samplesWithStatus
      : samplesWithStatus.filter((s: any) => !s.has_user_score)

    return NextResponse.json({
      samples: filteredSamples,
      sessions,
      user_profile: {
        id: profile.id,
        is_cupper: canCup,
        is_q_grader: profile.is_q_grader || false,
        is_master_cupper: profile.is_master_cupper || false,
        laboratory_id: profile.laboratory_id,
        qc_role: profile.qc_role
      },
      stats: {
        total_assigned: samples?.length || 0,
        pending: filteredSamples.filter((s: any) => !s.has_user_score).length,
        scored: scoredSampleIds.size
      }
    })
  } catch (error) {
    console.error('Error in GET /api/cupping/my-samples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
