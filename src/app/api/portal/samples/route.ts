// src/app/api/portal/samples/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { mapSampleRow, PORTAL_SAMPLE_COLUMNS, sampleSearchFilter } from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_samples' })
  if (!gate.ok) return gate.response
  const { admin, companyId, keys } = gate.ctx
  const canOpenCertificates = keys.views.includes('qc_certificates')

  let query = admin
    .from('samples')
    .select(PORTAL_SAMPLE_COLUMNS)
    .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const search = sampleSearchFilter(request.nextUrl.searchParams.get('q') ?? '')
  if (search) query = query.or(search)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Could not load samples' }, { status: 500 })
  // Defence in depth: two chained .or() filters, so re-check the company here.
  const rows = (data ?? []).filter((r: any) => r.client_id === companyId || r.end_client_id === companyId)
  return NextResponse.json({ samples: rows.map((r: any) => mapSampleRow(r, companyId, canOpenCertificates)) })
}
