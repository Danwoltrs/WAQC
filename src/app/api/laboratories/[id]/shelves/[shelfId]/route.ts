import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

type PositionCount = {
  current_count: number
}

type ShelfWithClient = {
  id: string
  laboratory_id: string
  shelf_number: number
  shelf_letter: string
  columns: number
  rows: number
  position_layout: string | null
  samples_per_position: number
  naming_convention: string | null
  client_id: string | null
  allow_client_view: boolean
  x_position: number | null
  y_position: number | null
  created_at: string
  updated_at: string
  clients: {
    id: string
    name: string
    contact_name: string | null
    contact_email: string | null
  } | null
}

type ExistingShelf = {
  id: string
  shelf_letter: string
}

/**
 * GET /api/laboratories/[id]/shelves/[shelfId]
 * Get details for a specific shelf
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

    // Get shelf with client info
    const { data: shelfData, error: shelfError } = await supabase
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
          name,
          contact_name,
          contact_email
        )
      `)
      .eq('id', shelfId)
      .eq('laboratory_id', laboratoryId)
      .single()

    if (shelfError || !shelfData) {
      return NextResponse.json({ error: 'Shelf not found' }, { status: 404 })
    }

    const shelf = shelfData as ShelfWithClient

    // Get utilization data
    const { data: utilization } = await (supabase as any)
      .rpc('get_shelf_utilization', { p_shelf_id: shelfId })
      .single()

    return NextResponse.json({
      shelf: {
        ...shelf,
        utilization: utilization || {
          total_positions: 0,
          occupied_positions: 0,
          total_capacity: 0,
          current_count: 0,
          utilization_percentage: 0
        }
      }
    })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]/shelves/[shelfId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/laboratories/[id]/shelves/[shelfId]
 * Update a shelf (including client assignment and visibility)
 */
export async function PATCH(
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

    // Check permissions
    const canUpdate = profile.is_global_admin ||
                     profile.qc_role === 'global_quality_admin' ||
                     (profile.qc_role === 'lab_quality_manager' && profile.laboratory_id === laboratoryId)

    if (!canUpdate) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify shelf exists
    const { data: existingData, error: fetchError } = await supabase
      .from('lab_shelves')
      .select('id, shelf_letter')
      .eq('id', shelfId)
      .eq('laboratory_id', laboratoryId)
      .single()

    if (fetchError || !existingData) {
      return NextResponse.json({ error: 'Shelf not found' }, { status: 404 })
    }

    const existing = existingData as ExistingShelf

    const body = await request.json()

    // If shelf_letter is being changed, check uniqueness
    if (body.shelf_letter && body.shelf_letter !== existing.shelf_letter) {
      const { data: duplicate } = await supabase
        .from('lab_shelves')
        .select('id')
        .eq('laboratory_id', laboratoryId)
        .eq('shelf_letter', body.shelf_letter.toUpperCase())
        .neq('id', shelfId)
        .single()

      if (duplicate) {
        return NextResponse.json({
          error: `Shelf letter '${body.shelf_letter}' already exists in this laboratory`
        }, { status: 400 })
      }
    }

    // Prepare update data
    const updateData: any = {}
    const allowedFields = [
      'shelf_letter',
      'columns',
      'rows',
      'position_layout',
      'samples_per_position',
      'naming_convention',
      'client_id',
      'allow_client_view',
      'x_position',
      'y_position'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'shelf_letter') {
          updateData[field] = body[field].toUpperCase()
        } else {
          updateData[field] = body[field]
        }
      }
    }

    // Update shelf
    const { data: shelf, error: updateError } = await supabase
      .from('lab_shelves')
      .update(updateData)
      .eq('id', shelfId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating shelf:', updateError)
      return NextResponse.json({
        error: 'Failed to update shelf',
        details: updateError.message
      }, { status: 500 })
    }

    // If dimensions or naming changed, regenerate positions
    if (body.rows || body.columns || body.samples_per_position || body.shelf_letter) {
      const { error: regenerateError } = await (supabase as any)
        .rpc('generate_storage_positions_for_shelf', { p_shelf_id: shelfId })

      if (regenerateError) {
        console.error('Error regenerating positions:', regenerateError)
        return NextResponse.json({
          error: 'Shelf updated but failed to regenerate positions',
          details: regenerateError.message
        }, { status: 500 })
      }
    }

    return NextResponse.json({ shelf })
  } catch (error) {
    console.error('Error in PATCH /api/laboratories/[id]/shelves/[shelfId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/laboratories/[id]/shelves/[shelfId]
 * Delete a shelf and all its positions
 */
export async function DELETE(
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

    // Only global admins can delete shelves
    if (!profile.is_global_admin && profile.qc_role !== 'global_quality_admin') {
      return NextResponse.json({
        error: 'Only global admins can delete shelves'
      }, { status: 403 })
    }

    // Check if shelf has any samples
    const { data: positionsData } = await supabase
      .from('storage_positions')
      .select('current_count')
      .eq('shelf_id', shelfId)

    const positions = positionsData as PositionCount[] | null
    const totalSamples = positions?.reduce((sum, p) => sum + p.current_count, 0) || 0

    if (totalSamples > 0) {
      return NextResponse.json({
        error: 'Cannot delete shelf with stored samples',
        sample_count: totalSamples
      }, { status: 400 })
    }

    // Delete shelf (cascade will delete positions)
    const { error: deleteError } = await supabase
      .from('lab_shelves')
      .delete()
      .eq('id', shelfId)
      .eq('laboratory_id', laboratoryId)

    if (deleteError) {
      console.error('Error deleting shelf:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete shelf',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/laboratories/[id]/shelves/[shelfId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
