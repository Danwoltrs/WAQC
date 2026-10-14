// src/app/api/portal/certificates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { mapCertRow } from '@/lib/portal/portal-certificates'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_certificates' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx

  // Filtered in the database through the inner join, then checked again here.
  const { data, error } = await admin
    .from('certificates')
    .select('id, certificate_number, is_rejected, created_at, samples!inner(client_id, end_client_id, deleted_at, wolthers_contract_nr, container_nr, ico_number, exporter_sample_number)')
    .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`, { referencedTable: 'samples' })
    .is('samples.deleted_at', null)
    .is('voided_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: 'Could not load certificates' }, { status: 500 })

  const rows = (data ?? []).filter((c: any) =>
    c.samples && c.samples.deleted_at == null &&
    (c.samples.client_id === companyId || c.samples.end_client_id === companyId))
  return NextResponse.json({ certificates: rows.map((c: any) => mapCertRow(c, companyId)) })
}
