// src/lib/portal/portal-certificates.ts
import { trackingNumberToSlug } from '@/lib/utils'

export interface PortalCertRow {
  id: string
  certificateNumber: string
  trackingNumber: string | null
  status: 'approved' | 'rejected'
  issuedDate: string | null
  downloadUrl: string | null
}

export function mapCertRow(row: any): PortalCertRow {
  // The certificate's own sample — a contract sibling has its own tracking
  // number, so the download URL resolves to that certificate, not its lot's.
  const trackingNumber: string | null = row.sample?.tracking_number ?? null
  return {
    id: row.id,
    certificateNumber: row.certificate_number,
    trackingNumber,
    status: row.is_rejected ? 'rejected' : 'approved',
    issuedDate: row.created_at ?? null,
    downloadUrl: trackingNumber ? `/api/portal/certificate/${trackingNumberToSlug(trackingNumber)}/pdf` : null,
  }
}
