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

    const { attributes, defects } = body

    if (!attributes || !Array.isArray(attributes)) {
      return NextResponse.json({ error: 'Invalid attributes data' }, { status: 400 })
    }

    if (!defects || typeof defects !== 'object') {
      return NextResponse.json({ error: 'Invalid defects data' }, { status: 400 })
    }

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

    // Fetch all cupping scores for this sample (using admin client for consistency)
    const { data: scores, error } = await supabaseAdmin
      .from('cupping_scores')
      .select(`
        *,
        cupper:cupper_id(id, full_name, email)
      `)
      .eq('sample_id', sampleId)

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
