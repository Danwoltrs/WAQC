import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

type PositionStats = {
  id: string
  current_count: number
  capacity_per_position: number
}

type MaxShelf = {
  shelf_number: number
}

type InsertedShelf = {
  id: string
  laboratory_id: string
  shelf_number: number
  shelf_letter: string
  columns: number
  rows: number
  position_layout: string
  samples_per_position: number
  naming_convention: string
  client_id: string | null
  allow_client_view: boolean
  x_position: number
  y_position: number
  created_at: string
  updated_at: string
}

/**
 * GET /api/laboratories/[id]/shelves
 * Get all shelves for a laboratory with utilization data
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

    // Get user profile to check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('qc_role, laboratory_id, is_global_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const profile = profileData as ProfileData

    // Check permissions: global admin, global_quality_admin, or lab personnel for this lab
    const canAccess = profile.is_global_admin ||
                     profile.qc_role === 'global_quality_admin' ||
                     profile.laboratory_id === laboratoryId

    if (!canAccess) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get all shelves for this laboratory
    console.log('[/shelves GET] Fetching shelves for laboratory:', laboratoryId)
    const { data: shelves, error: shelvesError } = await supabase
      .from('lab_shelves')
      .select(`
        id,
        laboratory_id,
        shelf_number,
        shelf_letter,
        columns,
        rows,
        position_layout,
        samples_per_position,
        naming_convention,
        client_id,
        allow_client_view,
        x_position,
        y_position,
        created_at,
        updated_at,
        clients (
          id,
          name
        )
      `)
      .eq('laboratory_id', laboratoryId)
      .order('shelf_number')

    console.log('[/shelves GET] Query result:', {
      shelvesCount: shelves?.length || 0,
      shelvesData: shelves,
      error: shelvesError
    })

    if (shelvesError) {
      console.error('Error fetching shelves:', shelvesError)
      return NextResponse.json({ error: 'Failed to fetch shelves' }, { status: 500 })
    }

    // For each shelf, get utilization data
    const shelvesWithUtilization = await Promise.all(
      (shelves || []).map(async (shelf: any) => {
        // Get position statistics
        const { data: positionsData, error: posError } = await supabase
          .from('storage_positions')
          .select('id, current_count, capacity_per_position')
          .eq('shelf_id', shelf.id)

        if (posError) {
          console.error('Error fetching positions:', posError)
        }

        const positions = positionsData as PositionStats[] | null

        const totalPositions = positions?.length || 0
        const totalCapacity = positions?.reduce((sum, p) => sum + p.capacity_per_position, 0) || 0
        const currentCount = positions?.reduce((sum, p) => sum + p.current_count, 0) || 0
        const occupiedPositions = positions?.filter(p => p.current_count > 0).length || 0
        const utilizationPercentage = totalCapacity > 0
          ? Math.round((currentCount / totalCapacity) * 100 * 100) / 100
          : 0

        return {
          ...shelf,
          utilization: {
            total_positions: totalPositions,
            occupied_positions: occupiedPositions,
            total_capacity: totalCapacity,
            current_count: currentCount,
            utilization_percentage: utilizationPercentage
          }
        }
      })
    )

    return NextResponse.json({ shelves: shelvesWithUtilization })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]/shelves:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/laboratories/[id]/shelves
 * Create a new shelf for a laboratory
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

    const { id: laboratoryId } = await params

    // Get user profile to check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('qc_role, laboratory_id, is_global_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const profile = profileData as ProfileData

    // Only global admins and lab managers can create shelves
    const canCreate = profile.is_global_admin ||
                     profile.qc_role === 'global_quality_admin' ||
                     (profile.qc_role === 'lab_quality_manager' && profile.laboratory_id === laboratoryId)

    if (!canCreate) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.shelf_letter || !body.rows || !body.columns) {
      return NextResponse.json({
        error: 'Missing required fields: shelf_letter, rows, columns'
      }, { status: 400 })
    }

    // Check if shelf_letter is unique within this laboratory
    const { data: existing } = await supabase
      .from('lab_shelves')
      .select('id')
      .eq('laboratory_id', laboratoryId)
      .eq('shelf_letter', body.shelf_letter)
      .single()

    if (existing) {
      return NextResponse.json({
        error: `Shelf letter '${body.shelf_letter}' already exists in this laboratory`
      }, { status: 400 })
    }

    // Get next shelf_number
    const { data: maxShelfData } = await supabase
      .from('lab_shelves')
      .select('shelf_number')
      .eq('laboratory_id', laboratoryId)
      .order('shelf_number', { ascending: false })
      .limit(1)
      .single()

    const maxShelf = maxShelfData as MaxShelf | null
    const nextShelfNumber = (maxShelf?.shelf_number || 0) + 1

    // Create shelf
    const shelfData: any = {
      laboratory_id: laboratoryId,
      shelf_number: nextShelfNumber,
      shelf_letter: body.shelf_letter.toUpperCase(),
      columns: body.columns,
      rows: body.rows,
      position_layout: body.position_layout || 'standard',
      samples_per_position: body.samples_per_position || 1,
      naming_convention: body.naming_convention || `${body.shelf_letter}-{row_letter}{column_number}`,
      client_id: body.client_id || null,
      allow_client_view: body.allow_client_view || false,
      x_position: body.x_position || 0,
      y_position: body.y_position || 0
    }

    console.log('[/shelves POST] Creating shelf with data:', shelfData)
    const { data: insertedShelfData, error: insertError } = await supabase
      .from('lab_shelves')
      .insert(shelfData)
      .select()
      .single()

    console.log('[/shelves POST] Insert result:', {
      shelf: insertedShelfData,
      error: insertError
    })

    if (insertError || !insertedShelfData) {
      console.error('Error creating shelf:', insertError)
      return NextResponse.json({
        error: 'Failed to create shelf',
        details: insertError?.message || 'No data returned'
      }, { status: 500 })
    }

    const shelf = insertedShelfData as InsertedShelf

    // Auto-generate storage positions for this shelf
    console.log('[/shelves POST] Generating positions for shelf:', shelf.id)
    const { data: positionCount, error: generateError } = await (supabase as any)
      .rpc('generate_storage_positions_for_shelf', { p_shelf_id: shelf.id })

    console.log('[/shelves POST] Position generation result:', {
      positionCount,
      error: generateError
    })

    if (generateError) {
      console.error('Error generating positions:', generateError)
      // Don't fail the request, but log the error
      console.warn('Shelf created but positions were not auto-generated')
    }

    return NextResponse.json({
      shelf,
      positions_generated: positionCount || 0
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/laboratories/[id]/shelves:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
