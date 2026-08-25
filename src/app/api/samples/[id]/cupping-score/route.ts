import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { computeContentLock } from '@/lib/sample-edit-permissions'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'

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
 * POST /api/samples/[id]/cupping-score
 * Save cupping scores for a sample
 */
export async function POST(
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

    const { id: sampleId } = await params
    const body = await request.json()

    const { attributes, defects, cupping_comments, flavor_descriptor } = body

    if (!attributes || !Array.isArray(attributes)) {
      return NextResponse.json({ error: 'Invalid attributes data' }, { status: 400 })
    }

    if (!defects || typeof defects !== 'object') {
      return NextResponse.json({ error: 'Invalid defects data' }, { status: 400 })
    }

    // Cupping scores / defects freeze once the content lock applies (7 days
    // after certificate generation, or after OCR scan lock).
    const { data: lockSample } = await supabaseAdmin
      .from('samples')
      .select('id, locked, scanned_at, certificate_generated_at')
      .eq('id', sampleId)
      .single()
    if (lockSample) {
      const scoreLock = computeContentLock(lockSample)
      if (scoreLock.contentLocked) {
        return NextResponse.json(
          { error: `Cupping scores are locked and cannot be edited. ${scoreLock.message}` },
          { status: 423 }
        )
      }
    }

    // Find the active COMMODITY cupping session that contains this sample, so
    // the score is linked to the session validation will read back.
    //
    // A CVA session must never win here. It holds a different protocol, and a
    // commodity row inserted against it collides with
    // uniq_cupping_scores_session_sample_cupper — which is what surfaced as
    // "Failed to save cupping score" on any lot cupped on both surfaces.
    const { data: activeSessions } = await excludeCvaSessions(
      supabaseAdmin
        .from('cupping_sessions')
        .select('id')
        .contains('sample_ids', [sampleId])
        .in('status', ['active', 'review'])
    )
      .order('created_at', { ascending: false })
      .limit(1)

    const sessionId = activeSessions?.[0]?.id || null
    console.log(`[CUPPING SCORE] Saving score for sample ${sampleId}, session ${sessionId}`)

    // Convert attributes array to scores object
    const scoresObject: Record<string, number | string> = {}
    attributes.forEach((attr: { attribute: string; value: number | null }) => {
      if (attr.value !== null) {
        scoresObject[attr.attribute] = attr.value
      }
    })
    // Store flavor descriptor alongside scores
    if (flavor_descriptor) {
      scoresObject['Flavor_descriptor'] = flavor_descriptor
    }

    // Prepare cupping score data
    const cuppingScoreData = {
      sample_id: sampleId,
      cupper_id: user.id,
      session_id: sessionId, // Link to active session for validation tracking
      scores: scoresObject,
      defects: defects // Store the full defects structure (with taints and faults arrays)
    }

    // Resolve the row to write WITHOUT .single(). A cupper who has scored this
    // sample on both surfaces owns more than one row, and .single() errors on
    // that — the old code read the error as "nothing exists yet" and inserted a
    // duplicate. Scope to this session's own commodity row instead, and adopt a
    // legacy session-less row when this session has none, so the table converges
    // on one row per (session, sample, cupper) rather than accumulating orphans.
    const findRows = async (scope: 'session' | 'legacy') => {
      const base = excludeCvaScores(
        supabaseAdmin
          .from('cupping_scores')
          .select('id')
          .eq('sample_id', sampleId)
          .eq('cupper_id', user.id)
      )
      const scoped = scope === 'legacy'
        ? base.is('session_id', null)
        : base.eq('session_id', sessionId)
      const { data } = await scoped.order('updated_at', { ascending: false, nullsFirst: false })
      return (data ?? []) as { id: string }[]
    }

    const writeTo = async (rows: { id: string }[]) => {
      const { data, error } = await supabaseAdmin
        .from('cupping_scores')
        .update(cuppingScoreData)
        .eq('id', rows[0].id)
        .select()
        .single()
      if (error) throw error
      // Prune whatever duplicated earlier so the next save has one row to find.
      if (rows.length > 1) {
        await supabaseAdmin.from('cupping_scores').delete().in('id', rows.slice(1).map((r) => r.id))
      }
      return data
    }

    let rows = sessionId ? await findRows('session') : []
    if (rows.length === 0) rows = await findRows('legacy')

    let result

    try {
      if (rows.length > 0) {
        result = await writeTo(rows)
      } else {
        const { data, error } = await supabaseAdmin
          .from('cupping_scores')
          .insert(cuppingScoreData)
          .select()
          .single()

        if (error) {
          // A concurrent save (or the unique index) won the race — update
          // whatever row exists now rather than surfacing a 500.
          const raced = sessionId ? await findRows('session') : await findRows('legacy')
          if (raced.length === 0) throw error
          result = await writeTo(raced)
        } else {
          result = data
        }
      }
    } catch (writeError: any) {
      console.error('Error saving cupping score:', writeError)
      return NextResponse.json(
        { error: 'Failed to save cupping score', details: writeError?.message || String(writeError) },
        { status: 500 }
      )
    }

    // Save cupping_comments to quality_assessments if provided
    if (cupping_comments !== undefined) {
      const { data: existingQA } = await supabaseAdmin
        .from('quality_assessments')
        .select('id')
        .eq('sample_id', sampleId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existingQA) {
        await supabaseAdmin
          .from('quality_assessments')
          .update({ cupping_comments: cupping_comments || null })
          .eq('id', existingQA.id)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cupping score saved successfully',
      cupping_score: result
    })
  } catch (error: any) {
    console.error('Error saving cupping score:', error)
    return NextResponse.json(
      {
        error: 'Failed to save cupping score',
        details: error.message || String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/samples/[id]/cupping-score
 * Get cupping scores for a sample
 * PRIVACY: Only returns the current user's own score to prevent cuppers seeing each other's scores
 * Use /api/cupping/scores/aggregate for aggregated view (validation/review only)
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

    const { id: sampleId } = await params

    // PRIVACY FIX: Only fetch the current user's cupping score, not all cuppers' scores
    // This prevents cuppers from seeing each other's scores during cupping
    // CVA rows are excluded: their `scores` is a whole CvaAssessment blob, and
    // the commodity table would hydrate its attribute grid from it.
    const { data: scores, error } = await excludeCvaScores(
      supabaseAdmin
        .from('cupping_scores')
        .select(`
          *,
          cupper:cupper_id(id, full_name, email)
        `)
        .eq('sample_id', sampleId)
        .eq('cupper_id', user.id) // Only return current user's score
    )

    if (error) {
      console.error('Error fetching cupping scores:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cupping scores' },
        { status: 500 }
      )
    }

    return NextResponse.json({ scores: scores || [] })
  } catch (error: any) {
    console.error('Error fetching cupping scores:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch cupping scores',
        details: error.message || String(error)
      },
      { status: 500 }
    )
  }
}
