import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type SampleData = {
  id: string
  client_id: string | null
  laboratory_id: string
  origin: string | null
}

/**
 * GET /api/samples/[id]/suggested-positions
 * Get suggested storage positions for a sample based on:
 * 1. Client match (shelves assigned to sample's client)
 * 2. Available capacity
 * 3. Proximity (positions in same shelf)
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

    // Get sample details including client and laboratory
    const { data: sampleData, error: sampleError } = await supabase
      .from('samples')
      .select('id, client_id, laboratory_id, origin')
      .eq('id', sampleId)
      .single()

    if (sampleError || !sampleData) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const sample = sampleData as SampleData

    // Get all available positions in the sample's laboratory
    const { data: positions, error: positionsError } = await supabase
      .from('storage_positions')
      .select(`
        id,
        position_code,
        shelf_id,
        current_count,
        capacity_per_position,
        is_available,
        column_number,
        row_number,
        lab_shelves (
          id,
          shelf_letter,
          client_id,
          clients (
            id,
            name
          )
        )
      `)
      .eq('laboratory_id', sample.laboratory_id)
      .eq('is_available', true)
      .order('current_count', { ascending: true }) // Prefer positions with more space

    if (positionsError) {
      console.error('Error fetching positions:', positionsError)
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
    }

    // Score and rank positions
    const scoredPositions = (positions || []).map((position: any) => {
      let score = 0
      let recommendation_reason = []

      // Priority 1: Client match (highest priority)
      if (position.lab_shelves?.client_id === sample.client_id) {
        score += 100
        recommendation_reason.push(`Dedicated shelf for ${position.lab_shelves.clients?.name || 'your client'}`)
      }

      // Priority 2: Available capacity (more space = higher score)
      const availableSpace = position.capacity_per_position - position.current_count
      const capacityPercent = (availableSpace / position.capacity_per_position) * 100
      score += Math.floor(capacityPercent / 10) // 0-10 points based on capacity

      if (capacityPercent > 80) {
        recommendation_reason.push('Plenty of space available')
      } else if (capacityPercent > 50) {
        recommendation_reason.push('Good availability')
      }

      // Priority 3: Empty positions are better for first sample
      if (position.current_count === 0) {
        score += 5
        recommendation_reason.push('Empty position')
      }

      return {
        ...position,
        score,
        recommendation_reason,
        available_space: availableSpace,
        is_recommended: score >= 100 // Client match positions are recommended
      }
    })

    // Sort by score (highest first)
    scoredPositions.sort((a, b) => b.score - a.score)

    // Take top 20 suggestions
    const topSuggestions = scoredPositions.slice(0, 20)

    // Group by shelf for better organization
    const groupedByShelf: any = {}
    topSuggestions.forEach((pos: any) => {
      const shelfLetter = pos.lab_shelves?.shelf_letter
      if (!groupedByShelf[shelfLetter]) {
        groupedByShelf[shelfLetter] = {
          shelf_letter: shelfLetter,
          shelf_id: pos.shelf_id,
          client: pos.lab_shelves?.clients,
          is_client_shelf: pos.lab_shelves?.client_id === sample.client_id,
          positions: []
        }
      }
      groupedByShelf[shelfLetter].positions.push(pos)
    })

    const groupedSuggestions = Object.values(groupedByShelf)

    return NextResponse.json({
      sample_id: sampleId,
      total_suggestions: topSuggestions.length,
      positions: topSuggestions,
      grouped_by_shelf: groupedSuggestions,
      recommendation: topSuggestions.length > 0 ? {
        position_id: topSuggestions[0].id,
        position_code: topSuggestions[0].position_code,
        reason: topSuggestions[0].recommendation_reason.join(', ')
      } : null
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/suggested-positions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
