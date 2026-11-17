import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { serverError } from '@/lib/portal/route-errors'
import { PROFILE_COLUMNS, PROFILE_NOTE_CAP, sanitizePicks } from '@/lib/sensory'

/** GET /api/portal/regional-profiles: the active profiles a client can pick on its quality. A missing table fails soft. */
export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_specs' })
  if (!gate.ok) return gate.response
  try {
    const { data, error } = await (gate.ctx.admin as any)
      .from('regional_profiles')
      .select(PROFILE_COLUMNS)
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ profiles: [] })
      return serverError(error)
    }
    const profiles = (data ?? []).map((row: any) => ({ ...row, notes: sanitizePicks(row.notes, PROFILE_NOTE_CAP) }))
    return NextResponse.json({ profiles })
  } catch (error) {
    return serverError(error)
  }
}
