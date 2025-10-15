import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

/**
 * GET /api/laboratories/[id]
 * Get a single laboratory by ID
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

    const { id } = await params

    const { data: laboratory, error } = await supabase
      .from('laboratories')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
      }
      console.error('Error fetching laboratory:', error)
      return NextResponse.json({ error: 'Failed to fetch laboratory' }, { status: 500 })
    }

    if (!laboratory) {
      return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
    }

    // Get personnel for this lab
    const { data: personnel, error: personnelError } = await supabase
      .from('profiles')
      .select('id, email, full_name, qc_role, is_active, created_at')
      .eq('laboratory_id', id)
      .order('full_name')

    if (personnelError) {
      console.error('Error fetching personnel:', personnelError)
    }

    return NextResponse.json({
      laboratory: {
        ...(laboratory as any),
        personnel: personnel || []
      }
    })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/laboratories/[id]
 * Update a laboratory
 */
export async function PATCH(
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
    const { id } = await params

    // Check if lab exists
    const { data: existing, error: fetchError } = await supabase
      .from('laboratories')
      .select('id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
    }

    // Global admins and global_quality_admin can edit all labs
    // Lab quality managers can only edit their own lab
    if (!profile.is_global_admin &&
        profile.qc_role !== 'global_quality_admin' &&
        profile.laboratory_id !== id) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()

    // Prepare update data
    const updateData: any = {}
    const allowedFields = [
      'name',
      'location',
      'country',
      'address',
      'neighborhood',
      'city',
      'state',
      'type',
      'storage_capacity',
      'contact_email',
      'contact_phone',
      'is_active',
      'entrance_x_position',
      'entrance_y_position',
      'supported_origins'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Update laboratory
    const { data: laboratory, error: updateError } = await supabase
      .from('laboratories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating laboratory:', updateError)
      return NextResponse.json({
        error: 'Failed to update laboratory',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ laboratory })
  } catch (error) {
    console.error('Error in PATCH /api/laboratories/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/laboratories/[id]
 * Delete a laboratory (global admins only)
 */
export async function DELETE(
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

    // Get user profile to check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('is_global_admin')
      .eq('id', user.id)
      .single()

    const profile = profileData as { is_global_admin: boolean } | null

    if (profileError || !profile || !profile.is_global_admin) {
      return NextResponse.json({
        error: 'Only global admins can delete laboratories'
      }, { status: 403 })
    }

    const { id } = await params

    // Check if laboratory has samples
    const { count: samplesCount } = await supabase
      .from('samples')
      .select('*', { count: 'exact', head: true })
      .eq('laboratory_id', id)

    if (samplesCount && samplesCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete laboratory with associated samples',
        sample_count: samplesCount
      }, { status: 400 })
    }

    // Check if laboratory has personnel
    const { count: personnelCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('laboratory_id', id)

    if (personnelCount && personnelCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete laboratory with assigned personnel. Please reassign personnel first.',
        personnel_count: personnelCount
      }, { status: 400 })
    }

    // Delete laboratory
    const { error: deleteError } = await supabase
      .from('laboratories')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting laboratory:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete laboratory',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/laboratories/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
