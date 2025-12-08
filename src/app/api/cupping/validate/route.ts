import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/cupping/validate?session_id=xxx
 * Check if current user can validate a cupping session
 *
 * Returns validation status and permission info
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
    const sessionId = searchParams.get('session_id')
    const sampleId = searchParams.get('sample_id')

    if (!sessionId && !sampleId) {
      return NextResponse.json({
        error: 'Either session_id or sample_id is required'
      }, { status: 400 })
    }

    // Get user profile
    // Note: is_master_cupper may not be in TypeScript types yet (new migration 123)
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, is_q_grader, is_master_cupper, is_global_admin, laboratory_id, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Determine if user can cup
    const isCupper = profile.is_q_grader ||
                     profile.is_master_cupper ||
                     ['lab_personnel', 'lab_manager', 'lab_admin', 'cupper'].includes(profile.qc_role)

    // If sample_id provided, find the session containing this sample
    let session: any = null
    if (sampleId && !sessionId) {
      const { data: sessions, error: sessionError } = await (supabase as any)
        .from('cupping_sessions')
        .select('*')
        .contains('sample_ids', [sampleId])
        .in('status', ['active', 'review'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (sessionError) {
        console.error('Error finding session:', sessionError)
        return NextResponse.json({ error: 'Failed to find session' }, { status: 500 })
      }

      session = sessions?.[0]
    } else if (sessionId) {
      // Get the specific session
      const { data: sessionData, error: sessionError } = await (supabase as any)
        .from('cupping_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        console.error('Error fetching session:', sessionError)
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      session = sessionData
    }

    if (!session) {
      return NextResponse.json({
        can_validate: false,
        reason: 'No active session found for this sample',
        session: null
      })
    }

    // Check if user is assigned to this session
    const isAssigned = (session.cupper_ids as string[])?.includes(user.id)

    // Check if user is a master cupper
    const isMasterCupper = profile.is_master_cupper === true

    // Check if any master cupper is assigned to the session
    // Note: is_master_cupper may not be in TypeScript types yet (new migration 123)
    const { data: assignedProfiles, error: assignedError } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper')
      .in('id', session.cupper_ids || [])

    const hasMasterCupperAssigned = (assignedProfiles as any[])?.some(p => p.is_master_cupper === true) || false

    // Count completed cuppers (those who have submitted scores for ALL samples)
    const sampleIds = session.sample_ids || []

    // First try to get scores by session_id
    let { data: scores, error: scoresError } = await supabase
      .from('cupping_scores')
      .select('cupper_id, sample_id')
      .eq('session_id', session.id)

    if (scoresError) {
      console.error('Error fetching scores by session_id:', scoresError)
    }

    // If no scores found by session_id, fallback to checking by sample_ids
    // This handles legacy scores saved without session_id
    if (!scores || scores.length === 0) {
      console.log('[VALIDATE] No scores found by session_id, trying sample_ids fallback')
      const { data: sampleScores, error: sampleScoresError } = await supabase
        .from('cupping_scores')
        .select('cupper_id, sample_id')
        .in('sample_id', sampleIds)

      if (sampleScoresError) {
        console.error('Error fetching scores by sample_ids:', sampleScoresError)
      } else {
        scores = sampleScores
      }
    }

    console.log(`[VALIDATE] Found ${scores?.length || 0} scores for session ${session.id}`)

    // Count how many samples each cupper has scored
    const cupperSampleCounts = new Map<string, number>()
    for (const score of scores || []) {
      if (!score.cupper_id) continue
      const count = cupperSampleCounts.get(score.cupper_id) || 0
      cupperSampleCounts.set(score.cupper_id, count + 1)
    }

    // Count cuppers who have scored ALL samples
    const totalSamples = sampleIds.length || 1
    let completedCupperCount = 0
    for (const [cupperId, count] of cupperSampleCounts) {
      if (count >= totalSamples) {
        completedCupperCount++
      }
    }

    // Determine minimum cuppers required
    // Key rule: If only 1 cupper is assigned to the session, automatically allow single cupper validation
    // This handles emergency/holiday situations where a single cupper needs to complete the workflow
    // Use Set to count unique cuppers (in case same cupper was added multiple times)
    const rawCupperIds = (session.cupper_ids as string[]) || []
    const uniqueCupperIds = new Set(rawCupperIds)
    const assignedCupperCount = uniqueCupperIds.size
    const isSingleCupperSession = assignedCupperCount === 1

    console.log(`[VALIDATE] Session ${session.id}: raw cupper_ids=${JSON.stringify(rawCupperIds)}, unique count=${assignedCupperCount}`)

    const minCuppersRequired = (session.allow_single_cupper || isSingleCupperSession)
      ? 1
      : (session.min_cuppers_required || 2)

    console.log(`[VALIDATE] Completed cuppers: ${completedCupperCount}/${minCuppersRequired}, totalSamples: ${totalSamples}, isSingleCupperSession: ${isSingleCupperSession}`)

    const hasEnoughCuppers = completedCupperCount >= minCuppersRequired

    // Check if user has completed their scores
    const userSampleCount = cupperSampleCounts.get(user.id) || 0
    const userHasCompleted = userSampleCount >= totalSamples

    // Determine if user can validate
    let canValidate = false
    let reason = ''

    if (profile.is_global_admin) {
      // Global admins can always validate (if enough cuppers have completed)
      canValidate = hasEnoughCuppers
      reason = hasEnoughCuppers
        ? 'Global admin permission'
        : `Waiting for ${assignedCupperCount === 1 ? 'cupper' : 'more cuppers'} (${completedCupperCount}/${assignedCupperCount})`
    } else if (!hasEnoughCuppers) {
      // Not enough cuppers have completed
      canValidate = false
      reason = `Waiting for ${assignedCupperCount === 1 ? 'cupper' : 'more cuppers'} (${completedCupperCount}/${assignedCupperCount})`
    } else if (hasMasterCupperAssigned) {
      // If a master cupper is assigned, only master cuppers can validate
      if (isMasterCupper && (isAssigned || profile.laboratory_id === session.laboratory_id)) {
        canValidate = true
        reason = 'Master cupper permission'
      } else {
        canValidate = false
        reason = 'Only the assigned master cupper can validate this session'
      }
    } else {
      // No master cupper assigned - any assigned cupper who has completed can validate
      if (isAssigned && userHasCompleted) {
        canValidate = true
        reason = 'Cupper permission (no master cupper assigned)'
      } else if (!isAssigned) {
        canValidate = false
        reason = 'You are not assigned to this cupping session'
      } else {
        canValidate = false
        reason = 'Complete your scores first before validating'
      }
    }

    return NextResponse.json({
      can_validate: canValidate,
      reason,
      session: {
        id: session.id,
        status: session.status,
        sample_ids: session.sample_ids,
        cupper_ids: session.cupper_ids,
        min_cuppers_required: minCuppersRequired,
        allow_single_cupper: session.allow_single_cupper || false,
        is_single_cupper_session: isSingleCupperSession
      },
      user_profile: {
        id: profile.id,
        is_cupper: isCupper,
        is_q_grader: profile.is_q_grader,
        is_master_cupper: profile.is_master_cupper,
        is_global_admin: profile.is_global_admin,
        is_assigned: isAssigned,
        has_completed: userHasCompleted
      },
      stats: {
        total_samples: totalSamples,
        completed_cuppers: completedCupperCount,
        assigned_cuppers: assignedCupperCount,
        min_cuppers_required: minCuppersRequired,
        has_master_cupper_assigned: hasMasterCupperAssigned,
        is_single_cupper_exception: isSingleCupperSession && !session.allow_single_cupper
      }
    })
  } catch (error) {
    console.error('Error in GET /api/cupping/validate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/cupping/validate
 * Validate scores for a cupping session
 *
 * Body: { session_id: string, sample_id?: string, notes?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { session_id, sample_id, notes } = body

    if (!session_id) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    // First check if user can validate
    const checkUrl = new URL('/api/cupping/validate', request.url)
    checkUrl.searchParams.set('session_id', session_id)

    const checkResponse = await fetch(checkUrl.toString(), {
      headers: {
        cookie: request.headers.get('cookie') || ''
      }
    })

    const checkData = await checkResponse.json()

    if (!checkData.can_validate) {
      return NextResponse.json({
        error: 'Validation not allowed',
        reason: checkData.reason
      }, { status: 403 })
    }

    // Update the session to mark as validated
    const { data: updatedSession, error: updateError } = await (supabase as any)
      .from('cupping_sessions')
      .update({
        validated_by: user.id,
        validated_at: new Date().toISOString(),
        validation_notes: notes || null,
        status: 'review'
      })
      .eq('id', session_id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating session:', updateError)
      return NextResponse.json({ error: 'Failed to validate session' }, { status: 500 })
    }

    // Log the validation action to audit trail
    try {
      await (supabase as any)
        .from('cupping_audit_log')
        .insert({
          session_id,
          sample_id: sample_id || null,
          action: 'validated',
          performed_by: user.id,
          details: {
            notes,
            validated_at: new Date().toISOString()
          },
          laboratory_id: updatedSession.laboratory_id
        })
    } catch (auditError) {
      console.error('Error logging audit:', auditError)
      // Don't fail the request for audit logging errors
    }

    return NextResponse.json({
      success: true,
      session: updatedSession,
      message: 'Session validated successfully'
    })
  } catch (error) {
    console.error('Error in POST /api/cupping/validate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
