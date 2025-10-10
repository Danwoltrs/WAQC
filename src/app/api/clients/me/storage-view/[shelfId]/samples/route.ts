import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  id: string
  client_id: string | null
}

/**
 * GET /api/clients/me/storage-view/[shelfId]/samples
 * Get samples stored in a client's assigned shelf
 * Security: Verifies client owns the shelf and has view permission
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shelfId: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shelfId } = await params

    // Get user profile with client association
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const profile = profileData as ProfileData

    if (!profile.client_id) {
      return NextResponse.json({ error: 'Client association not found' }, { status: 403 })
    }

    // Verify shelf belongs to this client and has view permission
    const { data: shelf, error: shelfError } = await supabase
      .from('lab_shelves')
      .select(`
        id,
        shelf_letter,
        rows,
        columns,
        samples_per_position,
        client_id,
        allow_client_view,
        laboratory_id,
        laboratories (
          id,
          name,
          location
        )
      `)
      .eq('id', shelfId)
      .eq('client_id', profile.client_id!)
      .eq('allow_client_view', true)
      .single()

    if (shelfError || !shelf) {
      return NextResponse.json({
        error: 'Shelf not found or access denied',
        message: 'This shelf is not assigned to your client or visibility is not enabled'
      }, { status: 404 })
    }

    // Get all storage positions for this shelf
    const { data: positions, error: positionsError } = await supabase
      .from('storage_positions')
      .select(`
        id,
        position_code,
        column_number,
        row_number,
        capacity_per_position,
        current_samples,
        current_count,
        is_available
      `)
      .eq('shelf_id', shelfId)
      .order('row_number')
      .order('column_number')

    if (positionsError) {
      console.error('Error fetching positions:', positionsError)
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
    }

    // For each position with samples, get sample details (only for this client)
    const positionsWithSamples = await Promise.all(
      (positions || []).map(async (position: any) => {
        if (position.current_samples && position.current_samples.length > 0) {
          const { data: samples } = await supabase
            .from('samples')
            .select(`
              id,
              tracking_number,
              client_reference,
              origin,
              status,
              intake_date,
              weight_kg,
              quality_grade
            `)
            .in('id', position.current_samples)
            .eq('client_id', profile.client_id!)

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

    // Organize into grid
    const grid: any[][] = []
    const shelfData = shelf as any
    for (let row = 1; row <= shelfData.rows; row++) {
      const rowData: any[] = []
      for (let col = 1; col <= shelfData.columns; col++) {
        const position = positionsWithSamples.find(
          p => p.row_number === row && p.column_number === col
        )
        rowData.push(position || null)
      }
      grid.push(rowData)
    }

    // Calculate statistics
    const totalSamples = positionsWithSamples.reduce(
      (sum, p) => sum + (p.samples?.length || 0),
      0
    )
    const occupiedPositions = positionsWithSamples.filter(
      p => p.samples && p.samples.length > 0
    ).length

    return NextResponse.json({
      shelf: {
        id: shelfData.id,
        shelf_letter: shelfData.shelf_letter,
        rows: shelfData.rows,
        columns: shelfData.columns,
        laboratory: shelfData.laboratories
      },
      positions: positionsWithSamples,
      grid,
      statistics: {
        total_positions: positionsWithSamples.length,
        occupied_positions: occupiedPositions,
        total_samples: totalSamples,
        total_capacity: positionsWithSamples.reduce(
          (sum, p) => sum + p.capacity_per_position,
          0
        )
      }
    })
  } catch (error) {
    console.error('Error in GET /api/clients/me/storage-view/[shelfId]/samples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
