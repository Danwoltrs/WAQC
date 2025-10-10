import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type LaboratoryData = {
  id: string
  name: string
  location: string | null
  entrance_x_position: number | null
  entrance_y_position: number | null
}

/**
 * GET /api/laboratories/[id]/storage-layout
 * Get complete storage layout for a laboratory (for 2D floor plan view)
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

    const { id: laboratoryId } = await params

    // Get laboratory details
    const { data: laboratoryData, error: labError } = await supabase
      .from('laboratories')
      .select('id, name, location, entrance_x_position, entrance_y_position')
      .eq('id', laboratoryId)
      .single()

    if (labError || !laboratoryData) {
      return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
    }

    const laboratory = laboratoryData as LaboratoryData

    // Get all shelves with their positions and client assignments
    const { data: shelves, error: shelvesError } = await supabase
      .from('lab_shelves')
      .select(`
        id,
        shelf_number,
        shelf_letter,
        columns,
        rows,
        samples_per_position,
        x_position,
        y_position,
        position_layout,
        client_id,
        allow_client_view,
        clients (
          id,
          name
        )
      `)
      .eq('laboratory_id', laboratoryId)
      .order('shelf_number')

    if (shelvesError) {
      console.error('Error fetching shelves:', shelvesError)
      return NextResponse.json({ error: 'Failed to fetch shelves' }, { status: 500 })
    }

    // For each shelf, get utilization summary
    const shelvesWithUtilization = await Promise.all(
      (shelves || []).map(async (shelf: any) => {
        const { data: utilization } = await (supabase as any)
          .rpc('get_shelf_utilization', { p_shelf_id: shelf.id })
          .single()

        return {
          ...shelf,
          total_capacity: shelf.rows * shelf.columns * shelf.samples_per_position,
          utilization: utilization || {
            total_positions: 0,
            occupied_positions: 0,
            total_capacity: 0,
            current_count: 0,
            utilization_percentage: 0
          }
        }
      })
    )

    // Calculate overall lab statistics
    const totalCapacity = shelvesWithUtilization.reduce(
      (sum, shelf) => sum + (shelf.utilization.total_capacity || 0),
      0
    )
    const currentCount = shelvesWithUtilization.reduce(
      (sum, shelf) => sum + (shelf.utilization.current_count || 0),
      0
    )
    const utilizationPercentage = totalCapacity > 0
      ? Math.round((currentCount / totalCapacity) * 100 * 100) / 100
      : 0

    return NextResponse.json({
      laboratory: {
        ...laboratory,
        statistics: {
          total_shelves: shelvesWithUtilization.length,
          total_capacity: totalCapacity,
          current_count: currentCount,
          utilization_percentage: utilizationPercentage,
          available_capacity: totalCapacity - currentCount
        }
      },
      shelves: shelvesWithUtilization
    })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]/storage-layout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
