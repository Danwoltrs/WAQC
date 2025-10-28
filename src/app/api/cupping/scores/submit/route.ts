import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface ValidatedCupperScore {
  cupper_name: string
  cupper_id?: string
  scores: Record<string, number>
  validated: boolean
}

interface ValidatedCardData {
  sample_id: string
  tracking_number: string
  cupper_scores: ValidatedCupperScore[]
  defects: {
    taints: string[]
    faults: string[]
  }
  confidence: number
  session_id?: string
}

/**
 * POST /api/cupping/scores/submit
 * Submit validated cupping scores to the database
 * Body: { scores: ValidatedCardData[] }
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
    const { scores } = body as { scores: ValidatedCardData[] }

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return NextResponse.json(
        { error: 'No scores provided' },
        { status: 400 }
      )
    }

    console.log(`Submitting ${scores.length} validated cupping cards from user ${user.id}`)

    // Process each validated card
    const results = []

    for (const card of scores) {
      // Verify sample exists
      const { data: sample, error: sampleError } = await supabase
        .from('samples')
        .select('id, tracking_number')
        .eq('id', card.sample_id)
        .single()

      if (sampleError || !sample) {
        console.error(`Sample not found: ${card.sample_id}`)
        results.push({
          sample_id: card.sample_id,
          success: false,
          error: 'Sample not found',
        })
        continue
      }

      // Create or get cupping session
      let sessionId = card.session_id

      if (!sessionId) {
        // Create a new session for this OCR submission
        const { data: newSession, error: sessionError } = await supabase
          .from('cupping_sessions')
          .insert({
            created_by: user.id,
            participants: [user.id], // OCR submitter is participant
            sample_ids: [card.sample_id],
            session_type: 'handwritten', // OCR from handwritten cards
            status: 'completed',
          })
          .select('id')
          .single()

        if (sessionError || !newSession) {
          console.error('Failed to create cupping session:', sessionError)
          results.push({
            sample_id: card.sample_id,
            success: false,
            error: 'Failed to create cupping session',
          })
          continue
        }

        sessionId = newSession.id
      }

      // Submit each cupper's scores
      const scoreInserts = []

      for (const cupperScore of card.cupper_scores) {
        // Try to find cupper by name if cupper_id not provided
        let cupperId = cupperScore.cupper_id

        if (!cupperId && cupperScore.cupper_name) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('full_name', cupperScore.cupper_name)
            .limit(1)
            .single()

          if (profile) {
            cupperId = profile.id
          }
        }

        // Build defects JSON
        const defects = {
          taints: card.defects.taints,
          faults: card.defects.faults,
          ocr_confidence: card.confidence,
        }

        // Insert cupping score
        scoreInserts.push({
          session_id: sessionId,
          sample_id: card.sample_id,
          cupper_id: cupperId || null,
          scores: cupperScore.scores,
          defects,
          notes: cupperId
            ? null
            : `OCR extracted - Cupper name: ${cupperScore.cupper_name}`,
        })
      }

      // Insert all scores for this card
      const { data: insertedScores, error: insertError } = await supabase
        .from('cupping_scores')
        .insert(scoreInserts)
        .select('id')

      if (insertError) {
        console.error('Failed to insert cupping scores:', insertError)
        results.push({
          sample_id: card.sample_id,
          tracking_number: card.tracking_number,
          success: false,
          error: 'Failed to insert scores',
          details: insertError.message,
        })
      } else {
        console.log(
          `Successfully inserted ${insertedScores.length} cupping scores for sample ${card.tracking_number}`
        )
        results.push({
          sample_id: card.sample_id,
          tracking_number: card.tracking_number,
          success: true,
          session_id: sessionId,
          scores_created: insertedScores.length,
        })
      }
    }

    // Check if all submissions were successful
    const allSuccessful = results.every((r) => r.success)
    const successCount = results.filter((r) => r.success).length

    return NextResponse.json({
      success: allSuccessful,
      message: allSuccessful
        ? `Successfully submitted scores for ${successCount} sample${successCount !== 1 ? 's' : ''}`
        : `Partially successful: ${successCount} of ${results.length} samples`,
      results,
    })
  } catch (error: any) {
    console.error('Error submitting cupping scores:', error)
    return NextResponse.json(
      {
        error: 'Failed to submit cupping scores',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
