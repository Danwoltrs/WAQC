// src/app/api/portal/certificates/[id]/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isUuid, requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { buildCertificatePdfResponse } from '@/lib/certificate-pdf'
import { trackingNumberToSlug } from '@/lib/utils'

/** The certificate PDF, served only when its sample belongs to the caller's company. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireQcPortal(request, { view: 'qc_certificates' })
  if (!gate.ok) return gate.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { admin, companyId, userId } = gate.ctx

  const { data: certificate, error: certError } = await admin
    .from('certificates')
    .select('id, certificate_number, sample_id')
    .eq('id', id)
    .is('voided_at', null)
    .maybeSingle()
  if (certError) {
    console.error('portal certificate pdf: certificate read failed', certError.code ?? '')
    return NextResponse.json({ error: 'Could not load certificate' }, { status: 500 })
  }
  if (!certificate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: sample, error: sampleError } = await admin
    .from('samples')
    .select('id, client_id, end_client_id, deleted_at')
    .eq('id', certificate.sample_id)
    .maybeSingle()
  if (sampleError) {
    console.error('portal certificate pdf: sample read failed', sampleError.code ?? '')
    return NextResponse.json({ error: 'Could not load certificate' }, { status: 500 })
  }
  if (!sample || sample.deleted_at || (sample.client_id !== companyId && sample.end_client_id !== companyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return buildCertificatePdfResponse(admin, trackingNumberToSlug(certificate.certificate_number), {
    sampleId: sample.id,
    audit: { channel: 'portal', actorUserId: userId },
  })
}
