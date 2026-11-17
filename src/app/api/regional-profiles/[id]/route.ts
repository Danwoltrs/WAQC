import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { PROFILE_COLUMNS, parseProfileInput, profileDbError } from '@/lib/sensory/profile-input'

/** PATCH /api/regional-profiles/[id]. Any subset of the fields plus is_active. Lab staff only. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase, user.id))) {
      return NextResponse.json({ error: 'Only lab staff can manage regional profiles' }, { status: 403 })
    }

    const parsed = parseProfileInput(await request.json(), true)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('regional_profiles')
      .update({ ...parsed.fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .maybeSingle()
    if (error) {
      const mapped = profileDbError(error.code)
      if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status })
      console.error('regional-profiles PATCH failed:', error)
      return NextResponse.json({ error: 'Failed to update regional profile' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Regional profile not found' }, { status: 404 })
    return NextResponse.json({ profile: data })
  } catch (error) {
    console.error('regional-profiles PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
