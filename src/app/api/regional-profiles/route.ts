import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { PROFILE_COLUMNS, parseProfileInput, profileDbError } from '@/lib/sensory/profile-input'

/** GET /api/regional-profiles?active=true. RLS decides what a caller sees; a missing table fails soft. */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let query = (supabase as any).from('regional_profiles').select(PROFILE_COLUMNS).order('name', { ascending: true })
    if (request.nextUrl.searchParams.get('active') === 'true') query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ profiles: [] })
      console.error('regional-profiles GET failed:', error)
      return NextResponse.json({ error: 'Failed to load regional profiles' }, { status: 500 })
    }
    return NextResponse.json({ profiles: data ?? [] })
  } catch (error) {
    console.error('regional-profiles GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/regional-profiles. Lab staff only. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase, user.id))) {
      return NextResponse.json({ error: 'Only lab staff can manage regional profiles' }, { status: 403 })
    }

    const parsed = parseProfileInput(await request.json(), false)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('regional_profiles')
      .insert({ ...parsed.fields, created_by: user.id })
      .select(PROFILE_COLUMNS)
      .single()
    if (error) {
      const mapped = profileDbError(error.code)
      if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status })
      console.error('regional-profiles POST failed:', error)
      return NextResponse.json({ error: 'Failed to create regional profile' }, { status: 500 })
    }
    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error('regional-profiles POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
