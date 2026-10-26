// src/lib/portal/portal-certificates.ts
import type { PortalCertFact } from './portal-facts'

export function certificatePdfUrl(certificateId: string, companyId: string): string {
  return `/api/portal/certificates/${encodeURIComponent(certificateId)}/pdf?company=${encodeURIComponent(companyId)}`
}

export interface PortalCertRow {
  id: string
  /** Null for a legacy lot certified under its SAN- lab number, which is never shown. */
  certificateNumber: string | null
  contract: string | null
  origin: string
  quality: string
  seller: string
  type: 'PSS' | 'SS'
  crop: string | null
  status: 'approved' | 'rejected'
  issuedDate: string | null
  downloadUrl: string
}

export function factToCertRow(fact: PortalCertFact, companyId: string): PortalCertRow {
  return {
    id: fact.id,
    certificateNumber: fact.certificateNumber,
    contract: fact.contractRef,
    origin: fact.origin,
    quality: fact.quality,
    seller: fact.seller,
    type: fact.type === 'ss' ? 'SS' : 'PSS',
    crop: fact.crop,
    status: fact.rejected ? 'rejected' : 'approved',
    issuedDate: fact.issuedAt ?? null,
    downloadUrl: certificatePdfUrl(fact.id, companyId),
  }
}

/** Case-insensitive search on contract ref, certificate number and container. Empty matches all. */
export function matchCertSearch(fact: PortalCertFact, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [fact.contractRef, fact.certificateNumber, fact.containerNr]
    .some(v => typeof v === 'string' && v.toLowerCase().includes(q))
}
