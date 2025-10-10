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

    // Allow lab staff to manage positions in their own lab
    const allowedRoles = [
      'global_quality_admin',
      'lab_quality_manager',
      'lab_assistant',
      'sample_intake_specialist'
    ]

    const hasAccess = profile.is_global_admin ||
      (allowedRoles.includes(profile.qc_role) && profile.laboratory_id === laboratoryId)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { client_id, allow_client_view, current_count, capacity_per_position } = body

    // Build update object dynamically (excluding is_available as it's a generated column)
    const updateData: any = {}

    if (client_id !== undefined) {
      updateData.client_id = client_id || null
    }

    if (allow_client_view !== undefined) {
      updateData.allow_client_view = allow_client_view || false
    }

    if (current_count !== undefined) {
      updateData.current_count = current_count
    }

    if (capacity_per_position !== undefined) {
      updateData.capacity_per_position = capacity_per_position
    }

    // Use service role for updating positions (bypasses RLS)
    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Update the position assignment
    const { data, error } = await serviceClient
      .from('storage_positions')
      .update(updateData)
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
