import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

type ExistingUserData = {
  id: string
  email: string
}

/**
 * GET /api/laboratories/[id]/personnel
 * Get all personnel for a laboratory
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

    // Get laboratory info to check if it's Santos HQ
    const { data: lab } = await supabase
      .from('laboratories')
      .select('name')
      .eq('id', id)
      .single()

    const isSantosHQ = lab?.name?.toLowerCase().includes('santos') && lab?.name?.toLowerCase().includes('hq')

    // Get lab-specific personnel
    const { data: labPersonnel, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, qc_role, qc_enabled, created_at, is_global_admin')
      .eq('laboratory_id', id)
      .order('full_name')

    if (error) {
      console.error('Error fetching personnel:', error)
      return NextResponse.json({ error: 'Failed to fetch personnel' }, { status: 500 })
    }

    let personnel = labPersonnel || []

    // If this is Santos HQ, also include global staff (global admins and global roles) as Wolthers staff
    if (isSantosHQ) {
      const { data: globalStaff, error: globalError } = await supabase
        .from('profiles')
        .select('id, email, full_name, qc_role, qc_enabled, created_at, is_global_admin')
        .or('is_global_admin.eq.true,qc_role.eq.global_quality_admin,qc_role.eq.global_finance_admin,qc_role.eq.santos_hq_finance')
        .order('full_name')

      if (!globalError && globalStaff) {
        // Add global staff that aren't already in the lab personnel list
        const existingIds = new Set(personnel.map(p => p.id))
        const uniqueGlobalStaff = globalStaff.filter(staff => !existingIds.has(staff.id))
        personnel = [...personnel, ...uniqueGlobalStaff]
      }
    }

    return NextResponse.json({ personnel })
  } catch (error) {
    console.error('Error in GET /api/laboratories/[id]/personnel:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/laboratories/[id]/personnel
 * Add personnel to a laboratory
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
    const { id: laboratoryId } = await params

    // Global admins and global_quality_admin can add personnel to any lab
    // Lab quality managers can only add personnel to their own lab
    if (!profile.is_global_admin &&
        profile.qc_role !== 'global_quality_admin' &&
        profile.laboratory_id !== laboratoryId) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.email || !body.full_name || !body.qc_role) {
      return NextResponse.json({
        error: 'Missing required fields: email, full_name, qc_role'
      }, { status: 400 })
    }

    // Check if user with this email already exists
    const { data: existingUserData, error: existingUserError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', body.email)
      .maybeSingle()

    const existingUser = existingUserData as ExistingUserData | null

    if (existingUser) {
      // Check if user is a global admin or has a global role
      const { data: existingProfileData } = await supabase
        .from('profiles')
        .select('is_global_admin, qc_role')
        .eq('id', existingUser.id)
        .single()

      const existingProfile = existingProfileData as { is_global_admin: boolean, qc_role: string } | null

      // Don't allow assigning global admins or global roles to specific labs
      if (existingProfile?.is_global_admin ||
          ['global_admin', 'global_quality_admin', 'global_finance_admin', 'santos_hq_finance'].includes(existingProfile?.qc_role || '')) {
        return NextResponse.json({
          error: `${body.full_name} is already a ${existingProfile?.qc_role === 'global_admin' ? 'Global Administrator' : existingProfile?.qc_role?.replace(/_/g, ' ')} and has access to all laboratories. Global roles cannot be assigned to specific laboratories.`
        }, { status: 400 })
      }

      // User exists, update their laboratory assignment
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          laboratory_id: laboratoryId,
          full_name: body.full_name,
          qc_role: body.qc_role,
          qc_enabled: true
        })
        .eq('id', existingUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating profile:', updateError)
        return NextResponse.json({
          error: 'Failed to update personnel',
          details: updateError.message
        }, { status: 500 })
      }

      return NextResponse.json({
        personnel: updatedProfile,
        message: 'Personnel updated with new laboratory assignment'
      })
    }

    // Cannot create profile without auth user due to foreign key constraint
    // User must first be invited/sign up through Supabase Auth
    return NextResponse.json({
      error: `No user found with email ${body.email}. Please invite this user through Supabase Auth first, then assign them to this laboratory.`,
      suggestion: 'User must create an account before they can be assigned to a laboratory.'
    }, { status: 400 })
  } catch (error) {
    console.error('Error in POST /api/laboratories/[id]/personnel:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
