// src/app/api/portal/overview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { buildStatusRollup } from '@/lib/portal/portal-overview'
import { mapSampleRow, PORTAL_SAMPLE_COLUMNS } from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request)
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx
  const scope = `client_id.eq.${companyId},end_client_id.eq.${companyId}`

  const [{ data: rows, error: rowsError }, { data: recent, error: recentError }] = await Promise.all([
    admin.from('samples').select('sample_type, status, workflow_stage').or(scope).is('deleted_at', null),
    admin
      .from('samples')
      .select(`${PORTAL_SAMPLE_COLUMNS}, updated_at`)
      .or(scope)
      .is('deleted_at', null)
      .in('status', ['approved', 'rejected'])
      .order('updated_at', { ascending: false })
      .limit(8),
  ])

  if (rowsError || recentError) return NextResponse.json({ error: 'Could not load overview' }, { status: 500 })

  return NextResponse.json({
    rollup: buildStatusRollup(rows ?? []),
    recent: (recent ?? []).map((r: any) => {
      const s = mapSampleRow(r, companyId)
      return { id: s.id, label: s.label, status: s.status, updatedAt: r.updated_at ?? null }
    }),
  })
}
