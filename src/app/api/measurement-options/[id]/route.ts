import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'

/**
 * PATCH /api/measurement-options/[id]
 * Body: { is_iso?: boolean, is_active?: boolean }
 * Mark a humidity method as ISO or not, or retire / bring back an entry.
 * An entry is never renamed or deleted: lots store the name they were
 * measured with, and a retired entry simply stops being offered.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const patch: Record<string, boolean> = {}
    if (typeof body?.is_iso === 'boolean') patch.is_iso = body.is_iso
    if (typeof body?.is_active === 'boolean') patch.is_active = body.is_active
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    }

    const { data, error } = await (supabase as any)
      .from('qc_measurement_options')
      .update(patch)
      .eq('id', id)
      .select('id, kind, name, is_iso, spec_key, is_active, sort_order')
      .maybeSingle()
    if (error) {
      console.error('[measurement-options] update failed:', error)
      return NextResponse.json({ error: 'Could not change the entry' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    return NextResponse.json({ option: data })
  } catch (error) {
    console.error('Error in PATCH /api/measurement-options/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
