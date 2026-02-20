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

    const { attributes, defects, cupping_comments } = body

    if (!attributes || !Array.isArray(attributes)) {
      return NextResponse.json({ error: 'Invalid attributes data' }, { status: 400 })
    }

    if (!defects || typeof defects !== 'object') {
      return NextResponse.json({ error: 'Invalid defects data' }, { status: 400 })
    }

    // Find the active cupping session that contains this sample
    // This ensures scores are linked to the correct session for validation
    const { data: activeSessions } = await supabaseAdmin
      .from('cupping_sessions')
      .select('id')
      .contains('sample_ids', [sampleId])
      .in('status', ['active', 'review'])
      .order('created_at', { ascending: false })
      .limit(1)

    const sessionId = activeSessions?.[0]?.id || null
    console.log(`[CUPPING SCORE] Saving score for sample ${sampleId}, session ${sessionId}`)

    // Check if cupping score already exists for this sample and cupper (using admin client)
    const { data: existingScore } = await supabaseAdmin
      .from('cupping_scores')
      .select('id')
      .eq('sample_id', sampleId)
      .eq('cupper_id', user.id)
      .single()

    // Convert attributes array to scores object
    const scoresObject: Record<string, number> = {}
    attributes.forEach((attr: { attribute: string; value: number | null }) => {
      if (attr.value !== null) {
        scoresObject[attr.attribute] = attr.value
      }
    })

    // Prepare cupping score data
    const cuppingScoreData = {
      sample_id: sampleId,
      cupper_id: user.id,
      session_id: sessionId, // Link to active session for validation tracking
      scores: scoresObject,
      defects: defects // Store the full defects structure (with taints and faults arrays)
    }

    let result

    if (existingScore) {
      // Update existing score (using admin client to bypass RLS)
      const { data, error } = await supabaseAdmin
        .from('cupping_scores')
        .update(cuppingScoreData)
        .eq('id', existingScore.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating cupping score:', error)
        return NextResponse.json(
          { error: 'Failed to update cupping score' },
          { status: 500 }
        )
      }

      result = data
    } else {
      // Insert new score (using admin client to bypass RLS)
      const { data, error } = await supabaseAdmin
        .from('cupping_scores')
        .insert(cuppingScoreData)
        .select()
        .single()

      if (error) {
        console.error('Error inserting cupping score:', error)
        return NextResponse.json(
          { error: 'Failed to save cupping score' },
          { status: 500 }
        )
      }

      result = data
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
    const { data: scores, error } = await supabaseAdmin
      .from('cupping_scores')
      .select(`
        *,
        cupper:cupper_id(id, full_name, email)
      `)
      .eq('sample_id', sampleId)
      .eq('cupper_id', user.id) // Only return current user's score

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
