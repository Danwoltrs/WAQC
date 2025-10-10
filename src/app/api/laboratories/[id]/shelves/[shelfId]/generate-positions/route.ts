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

type ShelfData = {
  id: string
  shelf_letter: string
  rows: number
  columns: number
  samples_per_position: number
}

/**
 * POST /api/laboratories/[id]/shelves/[shelfId]/generate-positions
 * Regenerate all storage positions for a shelf
 */
export async function POST(
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

    // Only admins and lab managers can regenerate positions
    const canRegenerate = profile.is_global_admin ||
                         profile.qc_role === 'global_quality_admin' ||
                         (profile.qc_role === 'lab_quality_manager' && profile.laboratory_id === laboratoryId)

    if (!canRegenerate) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Verify shelf exists and belongs to this lab
    const { data: shelfData, error: shelfError } = await supabase
      .from('lab_shelves')
      .select('id, shelf_letter, rows, columns, samples_per_position')
      .eq('id', shelfId)
      .eq('laboratory_id', laboratoryId)
      .single()

    if (shelfError || !shelfData) {
      return NextResponse.json({ error: 'Shelf not found' }, { status: 404 })
    }

    const shelf = shelfData as ShelfData

    // Check if shelf has any samples stored
    const { data: positionsData } = await supabase
      .from('storage_positions')
      .select('current_count')
      .eq('shelf_id', shelfId)

    const positions = positionsData as PositionCount[] | null
    const totalSamples = positions?.reduce((sum, p) => sum + p.current_count, 0) || 0

    if (totalSamples > 0) {
      return NextResponse.json({
        error: 'Cannot regenerate positions for shelf with stored samples. Please remove all samples first.',
        sample_count: totalSamples
      }, { status: 400 })
    }

    // Call the database function to regenerate positions
    const { data: positionCount, error: generateError } = await (supabase as any)
      .rpc('generate_storage_positions_for_shelf', { p_shelf_id: shelfId })

    if (generateError) {
      console.error('Error generating positions:', generateError)
      return NextResponse.json({
        error: 'Failed to generate positions',
        details: generateError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      positions_generated: positionCount,
      shelf: {
        id: shelf.id,
        shelf_letter: shelf.shelf_letter,
        rows: shelf.rows,
        columns: shelf.columns,
        total_positions: positionCount
      }
    })
  } catch (error) {
    console.error('Error in POST /api/laboratories/[id]/shelves/[shelfId]/generate-positions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
