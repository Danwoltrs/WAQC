import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPendingSamplesForCupper } from '@/lib/queries/cupping-assignments'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'

interface AttributeScore {
  attribute: string
  value: number | null
}

interface Defect {
  id: string
  name: string
  cups_affected: number
  intensity: number
  is_taint: boolean
}

/**
 * POST /api/cupping/scores/save-digital
 * Save cupping scores from digital cupping interface
 * Body: { sample_id: string, scores: AttributeScore[], defects: Defect[] }
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
    const { sample_id, scores, defects } = body as {
      sample_id: string
      scores: AttributeScore[]
      defects: Defect[]
    }

    if (!sample_id) {
      return NextResponse.json({ error: 'sample_id is required' }, { status: 400 })
    }

    if (!scores || !Array.isArray(scores)) {
      return NextResponse.json({ error: 'scores array is required' }, { status: 400 })
    }

    console.log(`Saving digital cupping scores for sample ${sample_id} by user ${user.id}`)

    // Verify sample exists and is not deleted
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, tracking_number')
      .eq('id', sample_id)
      .is('deleted_at', null)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Create or get existing cupping session
    // Check if there's already a session for this sample by this user
    const { data: existingSession } = await supabase
      .from('cupping_sessions')
      .select('id')
      .contains('sample_ids', [sample_id])
      .eq('created_by', user.id)
      .eq('session_type', 'digital')
      .single()

    let sessionId: string

    if (existingSession) {
      sessionId = existingSession.id
      console.log(`Using existing cupping session: ${sessionId}`)
    } else {
      // Create new digital cupping session
      const { data: newSession, error: sessionError } = await supabase
        .from('cupping_sessions')
        .insert({
          created_by: user.id,
          participants: [user.id],
          sample_ids: [sample_id],
          session_type: 'digital',
          status: 'active',
        })
        .select('id')
        .single()

      if (sessionError || !newSession) {
        console.error('Failed to create cupping session:', sessionError)
        return NextResponse.json(
          { error: 'Failed to create cupping session' },
          { status: 500 }
        )
      }

      sessionId = newSession.id
      console.log(`Created new cupping session: ${sessionId}`)
    }

    // Convert scores array to object for storage
    const scoresObject: Record<string, number> = {}
    scores.forEach(score => {
      if (score.value !== null) {
        scoresObject[score.attribute] = score.value
      }
    })

    // Build defects object
    const defectsData = {
      taints: defects.filter(d => d.is_taint).map(d => ({
        name: d.name,
        cups_affected: d.cups_affected,
        intensity: d.intensity,
      })),
      faults: defects.filter(d => !d.is_taint).map(d => ({
        name: d.name,
        cups_affected: d.cups_affected,
        intensity: d.intensity,
      })),
    }

    // Check if this user already has a score for this session/sample
    const { data: existingScore } = await supabase
      .from('cupping_scores')
      .select('id')
      .eq('session_id', sessionId)
      .eq('sample_id', sample_id)
      .eq('cupper_id', user.id)
      .single()

    if (existingScore) {
      // Update existing score
      const { error: updateError } = await supabase
        .from('cupping_scores')
        .update({
          scores: scoresObject,
          defects: defectsData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingScore.id)

      if (updateError) {
        console.error('Failed to update cupping score:', updateError)
        return NextResponse.json(
          { error: 'Failed to update cupping score' },
          { status: 500 }
        )
      }

      console.log(`Updated existing cupping score: ${existingScore.id}`)

      // Check if cupper has completed all assigned samples
      const pendingSamples = await getPendingSamplesForCupper(supabase, user.id)

      if (pendingSamples.pending_count === 0) {
        // Clear all sample assignment notifications for this cupper
        console.log(`Cupper ${user.id} has completed all assigned samples. Clearing notifications...`)

        const { error: notifError } = await (supabase as any)
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false)
          .contains('metadata', { type: 'sample_assignment' })

        if (notifError) {
          console.error('Failed to clear notifications:', notifError)
        } else {
          console.log('Successfully cleared sample assignment notifications')
        }
      } else {
        console.log(`Cupper ${user.id} still has ${pendingSamples.pending_count} pending sample(s)`)
      }

      // Invalidate cached certificate PDF since cupping scores changed
      invalidateCertificatePdf(supabase, sample_id).catch(() => {})

      return NextResponse.json({
        success: true,
        message: 'Cupping scores updated successfully',
        session_id: sessionId,
        score_id: existingScore.id,
      })
    } else {
      // Insert new score
      const { data: insertedScore, error: insertError } = await supabase
        .from('cupping_scores')
        .insert({
          session_id: sessionId,
          sample_id,
          cupper_id: user.id,
          scores: scoresObject,
          defects: defectsData,
        })
        .select('id')
        .single()

      if (insertError || !insertedScore) {
        console.error('Failed to insert cupping score:', insertError)
        return NextResponse.json(
          { error: 'Failed to save cupping score' },
          { status: 500 }
        )
      }

      console.log(`Created new cupping score: ${insertedScore.id}`)

      // Check if cupper has completed all assigned samples
      const pendingSamples = await getPendingSamplesForCupper(supabase, user.id)

      if (pendingSamples.pending_count === 0) {
        // Clear all sample assignment notifications for this cupper
        console.log(`Cupper ${user.id} has completed all assigned samples. Clearing notifications...`)

        const { error: notifError } = await (supabase as any)
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false)
          .contains('metadata', { type: 'sample_assignment' })

        if (notifError) {
          console.error('Failed to clear notifications:', notifError)
        } else {
          console.log('Successfully cleared sample assignment notifications')
        }
      } else {
        console.log(`Cupper ${user.id} still has ${pendingSamples.pending_count} pending sample(s)`)
      }

      // Invalidate cached certificate PDF since cupping scores changed
      invalidateCertificatePdf(supabase, sample_id).catch(() => {})

      return NextResponse.json({
        success: true,
        message: 'Cupping scores saved successfully',
        session_id: sessionId,
        score_id: insertedScore.id,
      })
    }
  } catch (error: any) {
    console.error('Error saving digital cupping scores:', error)
    return NextResponse.json(
      {
        error: 'Failed to save cupping scores',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
