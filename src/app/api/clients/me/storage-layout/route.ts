import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  id: string
  client_id: string | null
}

/**
 * GET /api/clients/me/storage-layout
 * Get lab layout showing only client's approved shelves (for 2D visualization)
 * Security: Returns only shelves where client_id matches and allow_client_view is true
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

    // Get all visible shelves for this client, grouped by laboratory
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
      .eq('client_id', profile.client_id)
      .eq('allow_client_view', true)
      .order('laboratory_id')
      .order('shelf_number')

    if (shelvesError) {
      console.error('Error fetching client shelves:', shelvesError)
      return NextResponse.json({ error: 'Failed to fetch storage layout' }, { status: 500 })
    }

    // For each shelf, get utilization and sample count
    const shelvesWithData = await Promise.all(
      (shelves || []).map(async (shelf: any) => {
        const { data: utilization } = await (supabase as any)
          .rpc('get_shelf_utilization', { p_shelf_id: shelf.id })
          .single()

        // Count client's samples in this shelf
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

    // Group by laboratory
    const labGroups: any = {}
    shelvesWithData.forEach(shelf => {
      const labId = shelf.laboratory_id
      if (!labGroups[labId]) {
        labGroups[labId] = {
          laboratory: shelf.laboratories,
          shelves: [],
          statistics: {
            total_shelves: 0,
            total_capacity: 0,
            your_samples_count: 0
          }
        }
      }
      labGroups[labId].shelves.push(shelf)
      labGroups[labId].statistics.total_shelves++
      labGroups[labId].statistics.total_capacity += shelf.total_capacity
      labGroups[labId].statistics.your_samples_count += shelf.your_samples_count
    })

    // Convert to array
    const laboratories = Object.values(labGroups)

    // Overall statistics
    const overallStats = {
      total_laboratories: laboratories.length,
      total_shelves: shelvesWithData.length,
      total_capacity: shelvesWithData.reduce((sum, s) => sum + s.total_capacity, 0),
      your_samples_count: shelvesWithData.reduce((sum, s) => sum + s.your_samples_count, 0)
    }

    return NextResponse.json({
      laboratories,
      statistics: overallStats
    })
  } catch (error) {
    console.error('Error in GET /api/clients/me/storage-layout:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
