import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ShelfData = {
  id: string
  shelf_letter: string
  rows: number
  columns: number
  laboratory_id: string
  samples_per_position: number
}

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
    const { data: shelfData, error: shelfError } = await supabase
      .from('lab_shelves')
      .select('id, shelf_letter, rows, columns, laboratory_id, samples_per_position')
      .eq('id', shelfId)
      .eq('laboratory_id', laboratoryId)
      .single()

    if (shelfError || !shelfData) {
      return NextResponse.json({ error: 'Shelf not found' }, { status: 404 })
    }

    const shelf = shelfData as ShelfData

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
        client_id,
        allow_client_view,
        clients:client_id (
          id,
          name
        ),
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

    // Check if positions need to be created (if they don't exist for this shelf)
    const expectedPositionCount = shelf.rows * shelf.columns
    const actualPositionCount = positions?.length || 0

    // Check if any existing positions have wrong capacity and fix them
    if (actualPositionCount > 0 && shelf.samples_per_position) {
      const positionsWithWrongCapacity = positions.filter(
        (p: any) => p.capacity_per_position !== shelf.samples_per_position
      )

      if (positionsWithWrongCapacity.length > 0) {
        // Use service role for updating positions (bypasses RLS)
        const { createClient: createServiceClient } = await import('@supabase/supabase-js')
        const serviceClient = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        )

        // Update all positions with wrong capacity
        const updatePromises = positionsWithWrongCapacity.map((pos: any) =>
          serviceClient
            .from('storage_positions')
            .update({ capacity_per_position: shelf.samples_per_position })
            .eq('id', pos.id)
        )

        await Promise.all(updatePromises)

        // Reload positions after update
        const { data: updatedPositions } = await supabase
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
            client_id,
            allow_client_view,
            clients:client_id (
              id,
              name
            ),
            created_at,
            updated_at
          `)
          .eq('shelf_id', shelfId)
          .order('row_number')
          .order('column_number')

        if (updatedPositions) {
          (positions as any[]).splice(0, positions!.length, ...updatedPositions)
        }
      }
    }

    if (actualPositionCount === 0) {
      // Create all positions for this shelf
      const positionsToCreate = []
      for (let row = 1; row <= shelf.rows; row++) {
        for (let col = 1; col <= shelf.columns; col++) {
          const rowLetter = String.fromCharCode(64 + row) // A, B, C...
          // Include shelf letter to ensure uniqueness across multiple shelves in same lab
          const positionCode = `${shelf.shelf_letter}${rowLetter}${col}` // e.g., "AA1", "AA2", "BA1"...

          positionsToCreate.push({
            laboratory_id: laboratoryId,
            shelf_id: shelfId,
            position_code: positionCode,
            row_number: row,
            column_number: col,
            capacity_per_position: shelf.samples_per_position || 10,
            current_count: 0
          })
        }
      }

      // Use service role for creating positions (bypasses RLS)
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )

      const { data: createdPositions, error: createError } = await serviceClient
        .from('storage_positions')
        .insert(positionsToCreate as any)
        .select(`
          id,
          position_code,
          column_number,
          row_number,
          capacity_per_position,
          current_samples,
          current_count,
          is_available,
          client_id,
          allow_client_view,
          clients:client_id (
            id,
            name
          ),
          created_at,
          updated_at
        `)

      if (createError) {
        console.error('Error creating positions:', createError)
        console.error('Attempted to create positions:', JSON.stringify(positionsToCreate, null, 2))
        return NextResponse.json({
          error: 'Failed to create positions',
          details: createError.message,
          code: createError.code
        }, { status: 500 })
      }

      // Use the newly created positions
      (positions as any[]).splice(0, positions!.length, ...(createdPositions || []))
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
