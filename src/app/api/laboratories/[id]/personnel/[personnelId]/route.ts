import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

/**
 * PATCH /api/laboratories/[id]/personnel/[personnelId]
 * Update a personnel member
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; personnelId: string }> }
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
    const { id: laboratoryId, personnelId } = await params

    // Global admins and global_quality_admin can edit personnel in any lab
    // Lab quality managers can only edit personnel in their own lab
    if (!profile.is_global_admin &&
        profile.qc_role !== 'global_quality_admin' &&
        profile.laboratory_id !== laboratoryId) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()

    // Prepare update data
    const updateData: any = {}
    const allowedFields = ['full_name', 'qc_role', 'is_active', 'qc_enabled']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Update personnel
    const { data: personnel, error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', personnelId)
      .eq('laboratory_id', laboratoryId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating personnel:', updateError)
      return NextResponse.json({
        error: 'Failed to update personnel',
        details: updateError.message
      }, { status: 500 })
    }

    if (!personnel) {
      return NextResponse.json({ error: 'Personnel not found in this laboratory' }, { status: 404 })
    }

    return NextResponse.json({ personnel })
  } catch (error) {
    console.error('Error in PATCH /api/laboratories/[id]/personnel/[personnelId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/laboratories/[id]/personnel/[personnelId]
 * Remove personnel from a laboratory (unassign, not delete user)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; personnelId: string }> }
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
    const { id: laboratoryId, personnelId } = await params

    // Global admins and global_quality_admin can remove personnel from any lab
    // Lab quality managers can only remove personnel from their own lab
    if (!profile.is_global_admin &&
        profile.qc_role !== 'global_quality_admin' &&
        profile.laboratory_id !== laboratoryId) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Unassign personnel from laboratory (set laboratory_id to null)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ laboratory_id: null })
      .eq('id', personnelId)
      .eq('laboratory_id', laboratoryId)

    if (updateError) {
      console.error('Error removing personnel:', updateError)
      return NextResponse.json({
        error: 'Failed to remove personnel',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/laboratories/[id]/personnel/[personnelId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
