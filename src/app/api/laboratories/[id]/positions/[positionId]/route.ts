import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; positionId: string }> }
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

    const params = await context.params
    const { id: laboratoryId, positionId } = params

    // Only global admins, global_quality_admin, and lab_quality_manager (for their own lab) can assign positions
    if (!profile.is_global_admin &&
        profile.qc_role !== 'global_quality_admin' &&
        !(profile.qc_role === 'lab_quality_manager' && profile.laboratory_id === laboratoryId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { client_id, allow_client_view } = body

    // Update the position assignment
    const { data, error } = await supabase
      .from('storage_positions')
      // @ts-expect-error - Supabase type inference issue with update
      .update({
        client_id: client_id || null,
        allow_client_view: allow_client_view || false
      })
      .eq('id', positionId)
      .select()
      .single()

    if (error) {
      console.error('Error updating position assignment:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ position: data })
  } catch (error) {
    console.error('Error in PATCH /api/laboratories/[id]/positions/[positionId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
