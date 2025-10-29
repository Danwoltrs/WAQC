import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Define cupper type explicitly
type CupperProfile = {
  id: string
  email: string
  full_name: string
  qc_role: string | null
  qc_enabled: boolean | null
  is_cupper: boolean | null
  is_q_grader: boolean | null
  laboratory_id: string | null
}

/**
 * GET /api/cuppers
 * Get all cuppers (users with is_cupper=true or is_q_grader=true) for the current user's laboratory
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's laboratory
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('laboratory_id, is_global_admin, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Build query to get cuppers
    let query = supabase
      .from('profiles')
      .select('id, email, full_name, qc_role, qc_enabled, is_cupper, is_q_grader, laboratory_id')
      .or('is_cupper.eq.true,is_q_grader.eq.true')
      .eq('qc_enabled', true)
      .order('full_name')

    // If user has a laboratory_id, filter by that lab
    // Global admins can see all cuppers
    if (profile.laboratory_id && !profile.is_global_admin) {
      query = query.eq('laboratory_id', profile.laboratory_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching cuppers:', error)
      return NextResponse.json({ error: 'Failed to fetch cuppers' }, { status: 500 })
    }

    // Cast and format cuppers for the UI (cast through unknown to bypass TypeScript strict checking)
    const cuppers = (data || []) as unknown as CupperProfile[]
    const formattedCuppers = cuppers.map(cupper => ({
      id: cupper.id,
      full_name: cupper.full_name,
      email: cupper.email,
      qc_role: cupper.qc_role,
      is_cupper: cupper.is_cupper,
      is_q_grader: cupper.is_q_grader,
      laboratory_id: cupper.laboratory_id
    }))

    return NextResponse.json({ cuppers: formattedCuppers })
  } catch (error) {
    console.error('Error in GET /api/cuppers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
