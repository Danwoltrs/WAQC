// src/lib/portal/portal-certificates.ts
import { shownCertificateNumber } from '@/lib/sample-reference'
import { portalCertificatePdfUrl, portalSampleReference, PORTAL_SAMPLE_REFERENCE_COLUMNS } from './portal-samples'

export interface PortalCertRow {
  id: string
  /** The real certificate number; null for a legacy lot certified under its SAN- lab number. */
  certificateNumber: string | null
  /** The lot as the client knows it — container, ICO, sample number or contract. Never the SAN- lab number. */
  reference: string
  status: 'approved' | 'rejected'
  issuedDate: string | null
  downloadUrl: string | null
}

/** The `sample` embed the portal certificates query selects. */
export const PORTAL_CERT_SAMPLE_EMBED =
  `sample:samples!inner(id, client_id, end_client_id, deleted_at, ${PORTAL_SAMPLE_REFERENCE_COLUMNS})`

export function mapCertRow(row: any): PortalCertRow {
  // The certificate's own sample — a contract sibling is its own row, so the
  // download resolves to that certificate, not its lot's.
  const sampleId: string | null = row.sample?.id ?? null
  return {
    id: row.id,
    certificateNumber: shownCertificateNumber(row.certificate_number),
    reference: portalSampleReference(row.sample),
    status: row.is_rejected ? 'rejected' : 'approved',
    issuedDate: row.created_at ?? null,
    downloadUrl: sampleId ? portalCertificatePdfUrl(sampleId) : null,
  }
}
