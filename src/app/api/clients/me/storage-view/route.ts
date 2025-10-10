import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  id: string
  client_id: string | null
  qc_role: string
}

/**
 * GET /api/clients/me/storage-view
 * Get client's assigned shelves (filtered by allow_client_view permission)
 * Clients can only see shelves where:
 * - client_id matches their client_id
 * - allow_client_view is true
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile with client association
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const profile = profileData as ProfileData

    // User must be associated with a client
    if (!profile.client_id) {
      return NextResponse.json({
        error: 'No client association found',
        message: 'Your account is not associated with a client'
      }, { status: 403 })
    }

    // Get shelves assigned to this client with visibility enabled
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
        laboratory_id,
        laboratories (
          id,
          name,
          location,
          country
        )
      `)
      .eq('client_id', profile.client_id!)
      .eq('allow_client_view', true)
      .order('shelf_number')

    if (shelvesError) {
      console.error('Error fetching client shelves:', shelvesError)
      return NextResponse.json({ error: 'Failed to fetch storage information' }, { status: 500 })
    }

    // For each shelf, get utilization data
    const shelvesWithUtilization = await Promise.all(
      (shelves || []).map(async (shelf: any) => {
        const { data: utilization } = await (supabase as any)
          .rpc('get_shelf_utilization', { p_shelf_id: shelf.id })
          .single()

        // Get sample count for this client in this shelf
        const { data: samples } = await supabase
          .from('samples')
          .select('id')
          .eq('client_id', profile.client_id!)
          .eq('laboratory_id', shelf.laboratory_id)
          .like('storage_position', `${shelf.shelf_letter}-%`)

        return {
          ...shelf,
          total_capacity: shelf.rows * shelf.columns * shelf.samples_per_position,
          utilization: utilization || {
            total_positions: 0,
            occupied_positions: 0,
            total_capacity: 0,
            current_count: 0,
            utilization_percentage: 0
          },
          your_samples_count: samples?.length || 0
        }
      })
    )

    // Calculate client's overall storage statistics
    const totalCapacity = shelvesWithUtilization.reduce(
      (sum, shelf) => sum + shelf.total_capacity,
      0
    )
    const yourSamplesCount = shelvesWithUtilization.reduce(
      (sum, shelf) => sum + shelf.your_samples_count,
      0
    )

    return NextResponse.json({
      shelves: shelvesWithUtilization,
      statistics: {
        total_shelves: shelvesWithUtilization.length,
        total_capacity: totalCapacity,
        your_samples_count: yourSamplesCount,
        laboratories: [...new Set(shelvesWithUtilization.map(s => s.laboratories?.name))].length
      }
    })
  } catch (error) {
    console.error('Error in GET /api/clients/me/storage-view:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
