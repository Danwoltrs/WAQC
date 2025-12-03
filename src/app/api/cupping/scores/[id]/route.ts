import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Create admin client with service role key (bypasses RLS)
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
 * GET /api/cupping/scores/[id]
 * Get a specific cupping score by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: scoreId } = await params

    const { data: score, error } = await supabaseAdmin
      .from('cupping_scores')
      .select(`
        *,
        cupper:cupper_id(id, full_name, email),
        sample:sample_id(id, tracking_number)
      `)
      .eq('id', scoreId)
      .single()

    if (error) {
      console.error('Error fetching score:', error)
      return NextResponse.json({ error: 'Score not found' }, { status: 404 })
    }

    return NextResponse.json({ score })
  } catch (error: any) {
    console.error('Error in GET /api/cupping/scores/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/cupping/scores/[id]
 * Update a cupping score - only allowed for master cuppers or if no master cupper is assigned
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: scoreId } = await params
    const body = await request.json()
    const { scores, attribute, value } = body

    // Get the score to find the session
    const { data: existingScore, error: scoreError } = await supabaseAdmin
      .from('cupping_scores')
      .select('*, session:session_id(*)')
      .eq('id', scoreId)
      .single()

    if (scoreError || !existingScore) {
      return NextResponse.json({ error: 'Score not found' }, { status: 404 })
    }

    // Get user profile for permission check
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper, is_global_admin, is_q_grader, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Permission check
    const canEdit = await checkEditPermission(profile, existingScore, user.id)
    if (!canEdit.allowed) {
      return NextResponse.json({ error: canEdit.reason }, { status: 403 })
    }

    // Update the score
    let updatedScores = existingScore.scores || {}

    if (scores) {
      // Full scores object provided
      updatedScores = scores
    } else if (attribute && value !== undefined) {
      // Single attribute update
      updatedScores[attribute] = value
    } else {
      return NextResponse.json({ error: 'No score data provided' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('cupping_scores')
      .update({
        scores: updatedScores,
        updated_at: new Date().toISOString()
      })
      .eq('id', scoreId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating score:', updateError)
      return NextResponse.json({ error: 'Failed to update score' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      score: updated,
      edited_by: user.id
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/cupping/scores/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function checkEditPermission(
  profile: any,
  score: any,
  userId: string
): Promise<{ allowed: boolean; reason: string }> {
  // Global admins can always edit
  if (profile.is_global_admin) {
    return { allowed: true, reason: 'Global admin permission' }
  }

  // Users can edit their own scores
  if (score.cupper_id === userId) {
    return { allowed: true, reason: 'Own score' }
  }

  // If session exists, check master cupper status
  const session = score.session
  if (session) {
    // Check if any master cupper is assigned to the session
    const { data: assignedProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, is_master_cupper')
      .in('id', session.cupper_ids || [])

    const hasMasterCupperAssigned = assignedProfiles?.some(p => p.is_master_cupper) || false

    if (hasMasterCupperAssigned) {
      // Only master cuppers can edit
      if (profile.is_master_cupper) {
        return { allowed: true, reason: 'Master cupper permission' }
      } else {
        return { allowed: false, reason: 'Only master cuppers can edit scores in this session' }
      }
    } else {
      // No master cupper assigned - check if user is assigned to session
      const isAssigned = session.cupper_ids?.includes(userId)
      if (isAssigned) {
        return { allowed: true, reason: 'Assigned cupper (no master cupper in session)' }
      }
    }
  }

  // Fallback: master cuppers can edit, Q-graders can edit
  if (profile.is_master_cupper || profile.is_q_grader) {
    return { allowed: true, reason: 'Q-grader/Master cupper permission' }
  }

  return { allowed: false, reason: 'You do not have permission to edit this score' }
}
