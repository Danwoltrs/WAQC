import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type LaboratoryInsert = Database['public']['Tables']['laboratories']['Insert']

type ProfileData = {
  qc_role: string
  laboratory_id: string | null
  is_global_admin: boolean
}

/**
 * GET /api/laboratories
 * Get all laboratories (filtered by user permissions)
 */
export async function GET(request: NextRequest) {
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

    // Global admins and global_quality_admin can see all labs
    let query = supabase
      .from('laboratories')
      .select('*')
      .order('name')

    // Lab quality managers can only see their own lab
    if (profile.qc_role === 'lab_quality_manager' && profile.laboratory_id) {
      query = query.eq('id', profile.laboratory_id)
    }

    const { data: laboratories, error } = await query

    if (error) {
      console.error('Error fetching laboratories:', error)
      return NextResponse.json({ error: 'Failed to fetch laboratories' }, { status: 500 })
    }

    // For each lab, get personnel count
    const labsWithCounts = await Promise.all(
      (laboratories || []).map(async (lab: any) => {
        const isSantosHQ = lab.name?.toLowerCase().includes('santos') && lab.name?.toLowerCase().includes('hq')

        if (isSantosHQ) {
          // For Santos HQ, count both lab-specific personnel and global staff
          const { count: labCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('laboratory_id', lab.id)

          const { count: globalCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .or('is_global_admin.eq.true,qc_role.eq.global_quality_admin,qc_role.eq.global_finance_admin,qc_role.eq.santos_hq_finance')

          // Use Set logic to avoid double counting users who might be in both groups
          const { data: labPersonnel } = await supabase
            .from('profiles')
            .select('id')
            .eq('laboratory_id', lab.id)

          const { data: globalStaff } = await supabase
            .from('profiles')
            .select('id')
            .or('is_global_admin.eq.true,qc_role.eq.global_quality_admin,qc_role.eq.global_finance_admin,qc_role.eq.santos_hq_finance')

          const labIds = new Set((labPersonnel || []).map(p => p.id))
          const uniqueGlobalStaff = (globalStaff || []).filter(staff => !labIds.has(staff.id))

          return {
            ...lab,
            personnel_count: (labPersonnel?.length || 0) + uniqueGlobalStaff.length
          }
        } else {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('laboratory_id', lab.id)

          return {
            ...lab,
            personnel_count: count || 0
          }
        }
      })
    )

    return NextResponse.json({ laboratories: labsWithCounts })
  } catch (error) {
    console.error('Error in GET /api/laboratories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/laboratories
 * Create a new laboratory (global admins and global_quality_admin only)
 */
export async function POST(request: NextRequest) {
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
      .select('qc_role, is_global_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const profile = profileData as { qc_role: string; is_global_admin: boolean }

    // Only global admins and global_quality_admin can create labs
    if (!profile.is_global_admin && profile.qc_role !== 'global_quality_admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.name || !body.location) {
      return NextResponse.json({
        error: 'Missing required fields: name, location'
      }, { status: 400 })
    }

    const labData: any = {
      name: body.name,
      location: body.location,
      country: body.country || null,
      type: body.type || 'lab',
      storage_capacity: body.storage_capacity || 1764,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      supported_origins: body.supported_origins || null,
      is_3rd_party: body.is_3rd_party || false,
      fee_per_sample: body.fee_per_sample || null,
      fee_currency: body.fee_currency || null,
      billing_basis: body.billing_basis || null
    }

    const { data: laboratory, error: insertError } = await supabase
      .from('laboratories')
      .insert(labData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating laboratory:', insertError)
      return NextResponse.json({
        error: 'Failed to create laboratory',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ laboratory }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/laboratories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
