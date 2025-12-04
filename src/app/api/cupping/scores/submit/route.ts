import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getPendingSamplesForCupper } from '@/lib/queries/cupping-assignments'

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
    const { scores, entryMethod = 'manual' } = body as { scores: ValidatedCardData[], entryMethod?: 'manual' | 'ocr' }

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return NextResponse.json(
        { error: 'No scores provided' },
        { status: 400 }
      )
    }

    console.log(`Submitting ${scores.length} validated cupping cards from user ${user.id} via ${entryMethod}`)

    // Process each validated card
    const results = []

    for (const card of scores) {
      // Verify sample exists and is not deleted
      const { data: sample, error: sampleError } = await supabase
        .from('samples')
        .select('id, tracking_number')
        .eq('id', card.sample_id)
        .is('deleted_at', null)
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
      const skippedCuppers: string[] = []
      const existingDigitalCuppers: string[] = []

      for (const cupperScore of card.cupper_scores) {
        // HYBRID MODE: Skip cuppers with blank/empty scores (they'll enter digitally)
        const hasScores = cupperScore.scores && Object.keys(cupperScore.scores).length > 0
        const hasValidScores = hasScores && Object.values(cupperScore.scores).some(v => v !== null && v !== undefined && !isNaN(v))

        if (!hasValidScores) {
          console.log(`Skipping cupper "${cupperScore.cupper_name}" - no scores on paper (will use digital entry)`)
          skippedCuppers.push(cupperScore.cupper_name)
          continue
        }

        // Try to find cupper by name if cupper_id is not a valid UUID
        let cupperId = cupperScore.cupper_id

        // Check if cupper_id is a valid UUID (not a placeholder like "gemini_0" or "row_0")
        const isValidUUID = cupperId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cupperId)

        if (!isValidUUID && cupperScore.cupper_name) {
          // Search with wildcard to match first name against full name
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('full_name', `${cupperScore.cupper_name}%`)
            .limit(1)
            .single()

          if (profile) {
            cupperId = profile.id
            console.log(`Matched cupper "${cupperScore.cupper_name}" to profile ${profile.id}`)
          } else {
            console.log(`Could not find profile for cupper "${cupperScore.cupper_name}"`)
            cupperId = undefined // Clear the placeholder ID
          }
        }

        // HYBRID MODE: Check if cupper already has digital scores for this sample
        if (cupperId) {
          const { data: existingScores } = await supabase
            .from('cupping_scores')
            .select('id')
            .eq('sample_id', card.sample_id)
            .eq('cupper_id', cupperId)
            .limit(1)

          if (existingScores && existingScores.length > 0) {
            console.log(`Cupper "${cupperScore.cupper_name}" already has scores for this sample - skipping OCR`)
            existingDigitalCuppers.push(cupperScore.cupper_name)
            continue
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
          entry_method: entryMethod, // Track whether this was OCR or manual entry
          notes: cupperId
            ? null
            : `OCR extracted - Cupper name: ${cupperScore.cupper_name}`,
        })
      }

      // Log hybrid mode summary
      if (skippedCuppers.length > 0) {
        console.log(`Hybrid mode: Skipped ${skippedCuppers.length} cupper(s) with blank paper: ${skippedCuppers.join(', ')}`)
      }
      if (existingDigitalCuppers.length > 0) {
        console.log(`Hybrid mode: ${existingDigitalCuppers.length} cupper(s) already have digital scores: ${existingDigitalCuppers.join(', ')}`)
      }

      // Handle case where no scores to insert (all cuppers skipped)
      if (scoreInserts.length === 0) {
        console.log(`No OCR scores to insert for sample ${card.tracking_number} - all cuppers skipped or have digital scores`)
        results.push({
          sample_id: card.sample_id,
          tracking_number: card.tracking_number,
          success: true,
          session_id: sessionId,
          scores_created: 0,
          skipped_blank: skippedCuppers,
          skipped_existing: existingDigitalCuppers,
          message: 'No paper scores to import - cuppers will enter digitally',
        })
        continue
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

        // Lock sample after OCR scan validation
        if (entryMethod === 'ocr') {
          const { error: lockError } = await supabaseAdmin
            .from('samples')
            .update({
              scanned_at: new Date().toISOString(),
              locked: true
            })
            .eq('id', card.sample_id)

          if (lockError) {
            console.error(`Failed to lock sample ${card.sample_id}:`, lockError)
          } else {
            console.log(`Sample ${card.tracking_number} locked after OCR scan`)
          }
        }

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

    // Clear notifications for cuppers who have completed all assigned samples
    // Collect unique cupper IDs from all successfully submitted scores
    const cupperIdsToCheck = new Set<string>()
    for (const card of scores) {
      for (const cupperScore of card.cupper_scores) {
        if (cupperScore.cupper_id) {
          cupperIdsToCheck.add(cupperScore.cupper_id)
        }
      }
    }

    // Check each cupper to see if they've completed all their assigned samples
    for (const cupperId of cupperIdsToCheck) {
      const pendingSamples = await getPendingSamplesForCupper(supabase, cupperId)

      if (pendingSamples.pending_count === 0) {
        // Clear all sample assignment notifications for this cupper
        console.log(`Cupper ${cupperId} has completed all assigned samples. Clearing notifications...`)

        const { error: notifError } = await (supabase as any)
          .from('notifications')
          .update({ read: true })
          .eq('user_id', cupperId)
          .eq('read', false)
          .contains('metadata', { type: 'sample_assignment' })

        if (notifError) {
          console.error(`Failed to clear notifications for cupper ${cupperId}:`, notifError)
        } else {
          console.log(`Successfully cleared sample assignment notifications for cupper ${cupperId}`)
        }
      } else {
        console.log(`Cupper ${cupperId} still has ${pendingSamples.pending_count} pending sample(s)`)
      }
    }

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
