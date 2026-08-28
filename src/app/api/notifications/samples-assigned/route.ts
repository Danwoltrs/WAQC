import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { notifications } from '@/lib/notifications'
import { isLabUnit } from '@/lib/sample-group'

/**
 * POST /api/notifications/samples-assigned
 * Creates a cupping session and sends notifications to assigned cuppers
 * Also moves samples to 'analysis' workflow stage
 * Body: { cupper_ids: string[], sample_ids: string[], session_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's laboratory_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('laboratory_id')
      .eq('id', user.id)
      .single()

    const body = await request.json()
    const { cupper_ids, sample_ids, session_id } = body

    if (!cupper_ids || !Array.isArray(cupper_ids) || cupper_ids.length === 0) {
      return NextResponse.json({ error: 'cupper_ids array is required' }, { status: 400 })
    }

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    console.log(`Creating cupping session for ${cupper_ids.length} cupper(s) and ${sample_ids.length} sample(s)`)

    // The workflow_stage update on `samples` is RLS-restricted: only users whose
    // qc_role is lab_personnel / lab_quality_manager / global_quality_admin /
    // global_admin AND who match the row's lab can UPDATE. When the env is
    // missing, the update silently affects 0 rows, the cupping session row gets
    // created, but the sample stays at "received". Hard-require the service
    // role key so cupper assignment can't half-succeed.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY missing - refusing to assign cuppers (would leave samples stuck at "received")')
      return NextResponse.json({
        error: 'Server misconfigured',
        details: 'SUPABASE_SERVICE_ROLE_KEY is not set. Cupper assignment requires service-role access to advance the workflow stage. Set the env var and redeploy.',
      }, { status: 500 })
    }

    const dbClient: any = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Cup once, results shared: a contract sibling has no cupping of its own,
    // so it never enters a session. Refuse rather than silently remapping to
    // the lab unit — the caller picked the wrong row and should know which.
    const { data: memberRows, error: memberError } = await dbClient
      .from('samples')
      .select('id, lab_source_sample_id')
      .in('id', sample_ids)

    if (memberError) {
      console.error('Failed to read sample lab-unit pointers:', memberError)
      return NextResponse.json({
        error: 'Failed to read samples',
        details: memberError.message,
      }, { status: 500 })
    }

    const siblingIds = ((memberRows || []) as Array<{ id: string; lab_source_sample_id: string | null }>)
      .filter((r) => !isLabUnit(r))
      .map((r) => r.id)
    if (siblingIds.length > 0) {
      return NextResponse.json({
        error: 'Contract siblings are not cupped; assign the lab unit',
        sibling_ids: siblingIds,
      }, { status: 400 })
    }

    // Track which cuppers are newly added (for notifications)
    let newCupperIds: string[] = cupper_ids
    let finalSessionId = session_id

    // Check if there's already an active session containing ANY of these samples
    // This prevents duplicate sessions for the same samples
    const { data: existingSessions, error: sessionQueryError } = await dbClient
      .from('cupping_sessions')
      .select('id, cupper_ids, sample_ids')
      .eq('status', 'active')
      .eq('laboratory_id', profile?.laboratory_id)

    if (sessionQueryError) {
      console.error('Error querying existing sessions:', sessionQueryError)
    }

    // Find a session that has overlapping samples
    const matchingSession = existingSessions?.find((session: any) => {
      const sessionSamples = (session.sample_ids as string[]) || []
      return sample_ids.some((id: string) => sessionSamples.includes(id))
    })

    if (matchingSession && !session_id) {
      // Found existing session - REPLACE cuppers with new selection (user's choice is definitive)
      finalSessionId = matchingSession.id
      const existingCupperIds = (matchingSession.cupper_ids as string[]) || []

      // Find truly new cuppers (not already in the session) for notifications
      newCupperIds = cupper_ids.filter(id => !existingCupperIds.includes(id))

      // Merge samples (may be adding new samples) but REPLACE cuppers
      const existingSampleIds = (matchingSession.sample_ids as string[]) || []
      const mergedSampleIds = [...new Set([...existingSampleIds, ...sample_ids])]

      const { error: updateError } = await dbClient
        .from('cupping_sessions')
        .update({
          cupper_ids: cupper_ids,
          participants: cupper_ids,
          sample_ids: mergedSampleIds,
          min_cuppers_required: Math.min(cupper_ids.length, 2),
          allow_single_cupper: cupper_ids.length === 1,
        })
        .eq('id', finalSessionId)

      if (updateError) {
        console.error('Failed to update cupping session:', updateError)
        return NextResponse.json({
          error: 'Failed to update cupping session',
          details: updateError.message
        }, { status: 500 })
      }

      console.log(`Updated existing cupping session: ${finalSessionId} (replaced cuppers: ${cupper_ids.length}, added ${newCupperIds.length} new)`)
    } else if (!finalSessionId) {
      // Create a new cupping session with the assigned cuppers and samples
      const { data: newSession, error: sessionError } = await dbClient
        .from('cupping_sessions')
        .insert({
          sample_ids: sample_ids,
          cupper_ids: cupper_ids,
          participants: cupper_ids, // Required NOT NULL field - same as cupper_ids
          status: 'active',
          session_type: 'regular',
          session_date: new Date().toISOString(),
          laboratory_id: profile?.laboratory_id,
          created_by: user.id,
          min_cuppers_required: Math.min(cupper_ids.length, 2),
          allow_single_cupper: cupper_ids.length === 1,
        })
        .select('id')
        .single()

      if (sessionError) {
        console.error('Failed to create cupping session:', sessionError)
        return NextResponse.json({
          error: 'Failed to create cupping session',
          details: sessionError.message
        }, { status: 500 })
      }

      finalSessionId = newSession.id
      console.log(`Created cupping session: ${finalSessionId}`)
    } else {
      // Update existing session by session_id
      const { data: existingSession } = await dbClient
        .from('cupping_sessions')
        .select('cupper_ids, sample_ids')
        .eq('id', session_id)
        .single()

      if (existingSession) {
        const existingCupperIds = (existingSession.cupper_ids as string[]) || []
        newCupperIds = cupper_ids.filter(id => !existingCupperIds.includes(id))

        const mergedCupperIds = [...new Set([...existingCupperIds, ...cupper_ids])]
        const mergedSampleIds = [...new Set([...(existingSession.sample_ids || []), ...sample_ids])]

        await dbClient
          .from('cupping_sessions')
          .update({
            cupper_ids: mergedCupperIds,
            participants: mergedCupperIds,
            sample_ids: mergedSampleIds,
            min_cuppers_required: Math.min(mergedCupperIds.length, 2),
            allow_single_cupper: mergedCupperIds.length === 1,
          })
          .eq('id', session_id)

        console.log(`Updated cupping session: ${session_id}`)
      }
    }

    // CRITICAL: Move samples to 'analysis' workflow stage so they appear in /cupping page.
    // Skip rows already past 'received' (re-assigning cuppers to an in-progress
    // sample shouldn't reset its stage). Anything still on 'received' must
    // advance, otherwise the assignment half-succeeded and the user sees the
    // sample stuck on the tracker.
    console.log(`Advancing ${sample_ids.length} samples to analysis stage...`)

    const { data: receivedRows, error: receivedFetchError } = await dbClient
      .from('samples')
      .select('id, workflow_stage')
      .in('id', sample_ids)

    if (receivedFetchError) {
      console.error('Failed to fetch sample workflow_stages:', receivedFetchError)
      return NextResponse.json({
        error: 'Failed to read sample workflow stages',
        details: receivedFetchError.message,
      }, { status: 500 })
    }

    const labUnitsToAdvance = (receivedRows || [])
      .filter((r: any) => r.workflow_stage === 'received' || r.workflow_stage == null)
      .map((r: any) => r.id as string)

    // Stage and status are shared by the whole contract group — a sibling
    // carries its lab unit's — so the advance covers the siblings too.
    let idsToAdvance = labUnitsToAdvance
    if (labUnitsToAdvance.length > 0) {
      const { data: siblingRows, error: siblingFetchError } = await dbClient
        .from('samples')
        .select('id')
        .in('lab_source_sample_id', labUnitsToAdvance)
      if (siblingFetchError) {
        console.error('Failed to fetch contract siblings:', siblingFetchError)
        return NextResponse.json({
          error: 'Failed to read contract siblings',
          details: siblingFetchError.message,
        }, { status: 500 })
      }
      idsToAdvance = [...labUnitsToAdvance, ...(siblingRows || []).map((r: any) => r.id as string)]
    }

    if (idsToAdvance.length > 0) {
      const { data: updatedSamples, error: sampleUpdateError } = await dbClient
        .from('samples')
        .update({ workflow_stage: 'analysis', status: 'in_progress' })
        .in('id', idsToAdvance)
        .select('id, workflow_stage')

      if (sampleUpdateError) {
        console.error('Failed to update sample workflow_stage:', sampleUpdateError)
        return NextResponse.json({
          error: 'Failed to advance sample workflow stage',
          details: sampleUpdateError.message,
        }, { status: 500 })
      }

      const advancedCount = (updatedSamples || []).filter((s: any) => s.workflow_stage === 'analysis').length
      if (advancedCount !== idsToAdvance.length) {
        console.error(`Partial workflow_stage update: ${advancedCount} of ${idsToAdvance.length}`)
        return NextResponse.json({
          error: 'Workflow stage update partially failed',
          details: `Expected to advance ${idsToAdvance.length} samples to analysis, only ${advancedCount} were updated.`,
          advanced: advancedCount,
          expected: idsToAdvance.length,
        }, { status: 500 })
      }
      console.log(`Advanced ${advancedCount} samples to analysis stage`)
    } else {
      console.log('No samples needed stage advance (all already past received)')
    }

    // Create/update quality_assessments to mark samples ready for grading and cupping
    for (const sampleId of sample_ids) {
      const { error: assessmentError } = await dbClient
        .from('quality_assessments')
        .upsert({
          sample_id: sampleId,
          green_bean_data: { ready_for_grading: true },
          roast_data: { ready_for_cupping: true },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'sample_id',
        })

      if (assessmentError) {
        console.warn(`Failed to update quality_assessment for sample ${sampleId}:`, assessmentError)
      }
    }

    // Send notification only to NEW cuppers (not already assigned)
    const cuppersToNotify = newCupperIds.length > 0 ? newCupperIds : []
    console.log(`Sending notifications to ${cuppersToNotify.length} new cupper(s)`)

    const results = await Promise.all(
      cuppersToNotify.map(cupperId =>
        notifications.samplesAssigned(cupperId, sample_ids.length, sample_ids, finalSessionId)
      )
    )

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`Sent ${successCount}/${cuppersToNotify.length} notifications successfully`)

    // Handle case where no new cuppers to notify (re-assignment)
    if (cuppersToNotify.length === 0) {
      return NextResponse.json({
        message: `Cuppers already assigned. Session updated with ${sample_ids.length} sample(s).`,
        sent: 0,
        session_id: finalSessionId,
        samples_updated: sample_ids.length
      })
    }

    if (failureCount > 0) {
      return NextResponse.json({
        message: `Partially successful: ${successCount} sent, ${failureCount} failed`,
        sent: successCount,
        failed: failureCount,
        session_id: finalSessionId,
        samples_updated: sample_ids.length
      }, { status: 207 })
    }

    return NextResponse.json({
      message: `Successfully sent ${successCount} notification${successCount !== 1 ? 's' : ''} and updated ${sample_ids.length} sample(s)`,
      sent: successCount,
      session_id: finalSessionId,
      samples_updated: sample_ids.length
    })
  } catch (error) {
    console.error('Error in POST /api/notifications/samples-assigned:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
