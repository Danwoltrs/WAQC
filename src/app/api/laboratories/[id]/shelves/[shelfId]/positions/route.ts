import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/laboratories/[id]/shelves/[shelfId]/positions
 * Get all storage positions for a shelf in grid format
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shelfId: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: laboratoryId, shelfId } = await params
    const { searchParams } = new URL(request.url)
    const availability = searchParams.get('availability') // 'available', 'occupied', 'all'

    // Get shelf details to verify access and get dimensions
    const { data: shelf, error: shelfError } = await supabase
      .from('lab_shelves')
      .select('id, shelf_letter, rows, columns, laboratory_id')
      .eq('id', shelfId)
      .eq('laboratory_id', laboratoryId)
      .single()

    if (shelfError || !shelf) {
      return NextResponse.json({ error: 'Shelf not found' }, { status: 404 })
    }

    // Build query
    let query = supabase
      .from('storage_positions')
      .select(`
        id,
        position_code,
        column_number,
        row_number,
        capacity_per_position,
        current_samples,
        current_count,
        is_available,
        created_at,
        updated_at
      `)
      .eq('shelf_id', shelfId)
      .order('row_number')
      .order('column_number')

    // Apply availability filter
    if (availability === 'available') {
      query = query.eq('is_available', true)
    } else if (availability === 'occupied') {
      query = query.gt('current_count', 0)
    }

    const { data: positions, error: positionsError } = await query

    if (positionsError) {
      console.error('Error fetching positions:', positionsError)
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
    }

    // For each position with samples, get sample details
    const positionsWithSamples = await Promise.all(
      (positions || []).map(async (position: any) => {
        if (position.current_samples && position.current_samples.length > 0) {
          const { data: samples } = await supabase
            .from('samples')
            .select('id, tracking_number, client_reference, origin, status, intake_date')
            .in('id', position.current_samples)

          return {
            ...position,
            samples: samples || []
          }
        }
        return {
          ...position,
          samples: []
        }
      })
    )

    // Organize positions into a grid structure for easy rendering
    const grid: any[][] = []
    for (let row = 1; row <= shelf.rows; row++) {
      const rowData: any[] = []
      for (let col = 1; col <= shelf.columns; col++) {
        const position = positionsWithSamples.find(
          p => p.row_number === row && p.column_number === col
        )
        rowData.push(position || null)
      }
      grid.push(rowData)
    }

    return NextResponse.json({
      shelf: {
        id: shelf.id,
        shelf_letter: shelf.shelf_letter,
        rows: shelf.rows,
        columns: shelf.columns
      },
      positions: positionsWithSamples,
      grid
    })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]/shelves/[shelfId]/positions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
