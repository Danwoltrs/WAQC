import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { notifications } from '@/lib/notifications'

/**
 * POST /api/notifications/samples-assigned
 * Creates a cupping session and sends notifications to assigned cuppers
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

    // Create or update cupping session
    let finalSessionId = session_id

    if (!finalSessionId) {
      // Create a new cupping session with the assigned cuppers and samples
      // Cast to any to bypass TypeScript strict checking for optional columns
      const { data: newSession, error: sessionError } = await (supabase as any)
        .from('cupping_sessions')
        .insert({
          sample_ids: sample_ids,
          cupper_ids: cupper_ids,
          status: 'active',
          session_type: 'regular',
          session_date: new Date().toISOString(),
          laboratory_id: profile?.laboratory_id,
          created_by: user.id,
          min_cuppers_required: Math.min(cupper_ids.length, 2), // Require at least 2 or all assigned
          allow_single_cupper: cupper_ids.length === 1, // Allow single cupper if only 1 assigned
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
      // Update existing session to add cuppers and samples
      const { data: existingSession } = await (supabase as any)
        .from('cupping_sessions')
        .select('cupper_ids, sample_ids')
        .eq('id', session_id)
        .single()

      if (existingSession) {
        const mergedCupperIds = [...new Set([...(existingSession.cupper_ids || []), ...cupper_ids])]
        const mergedSampleIds = [...new Set([...(existingSession.sample_ids || []), ...sample_ids])]

        await (supabase as any)
          .from('cupping_sessions')
          .update({
            cupper_ids: mergedCupperIds,
            sample_ids: mergedSampleIds,
          })
          .eq('id', session_id)

        console.log(`Updated cupping session: ${session_id}`)
      }
    }

    // Send notification to each assigned cupper
    console.log(`Sending notifications to ${cupper_ids.length} cupper(s)`)
    const results = await Promise.all(
      cupper_ids.map(cupperId =>
        notifications.samplesAssigned(cupperId, sample_ids.length, sample_ids, finalSessionId)
      )
    )

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`Sent ${successCount}/${cupper_ids.length} notifications successfully`)

    if (failureCount > 0) {
      return NextResponse.json({
        message: `Partially successful: ${successCount} sent, ${failureCount} failed`,
        sent: successCount,
        failed: failureCount,
        session_id: finalSessionId
      }, { status: 207 })
    }

    return NextResponse.json({
      message: `Successfully sent ${successCount} notification${successCount !== 1 ? 's' : ''}`,
      sent: successCount,
      session_id: finalSessionId
    })
  } catch (error) {
    console.error('Error in POST /api/notifications/samples-assigned:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
