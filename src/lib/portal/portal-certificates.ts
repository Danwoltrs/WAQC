// src/lib/portal/portal-certificates.ts
import { sampleIdentifier } from '@/lib/sample-reference'
import { certificatePdfUrl } from './portal-samples'

export interface PortalCertRow {
  id: string
  certificateNumber: string
  sample: string | null
  contract: string | null
  status: 'approved' | 'rejected'
  issuedDate: string | null
  downloadUrl: string
}

export function mapCertRow(row: any, companyId: string): PortalCertRow {
  const sample = row.samples ?? null
  const identifier = sample ? sampleIdentifier(sample) : null
  return {
    id: row.id,
    certificateNumber: row.certificate_number,
    sample: identifier ? `${identifier.tag} ${identifier.value}` : null,
    contract: sample?.wolthers_contract_nr ?? null,
    status: row.is_rejected ? 'rejected' : 'approved',
    issuedDate: row.created_at ?? null,
    downloadUrl: certificatePdfUrl(row.id, companyId),
  }
}
