// src/lib/portal/portal-samples.ts
import { sampleLabelText } from '@/lib/sample-reference'

/**
 * Portal sample rows. Never the SAN tracking number (CLAUDE.md): a sample is
 * named by its certificate number, else its own identifier, else its contract.
 */

export const PORTAL_SAMPLE_COLUMNS =
  'id, client_id, end_client_id, origin, quality_name, sample_type, workflow_stage, status, wolthers_contract_nr, buyer_contract_nr, container_nr, ico_number, exporter_sample_number, certificates(id, certificate_number, voided_at)'

export interface PortalSampleRow {
  id: string
  label: string
  contract: string | null
  buyerRef: string | null
  origin: string | null
  quality: string | null
  sampleType: string | null
  stage: string | null
  status: string | null
  certificateUrl: string | null
}

export function certificatePdfUrl(certificateId: string, companyId: string): string {
  return `/api/portal/certificates/${encodeURIComponent(certificateId)}/pdf?company=${encodeURIComponent(companyId)}`
}

function firstCertificate(row: any): { id: string; certificate_number: string } | null {
  const c = row.certificates
  const list: any[] = Array.isArray(c) ? c : c ? [c] : []
  // A voided certificate is no longer a certificate the client can see.
  return list.find((x) => x && !x.voided_at) ?? null
}

/** `canOpenCertificates`: the caller holds qc_certificates; without it the PDF link is withheld. */
export function mapSampleRow(row: any, companyId: string, canOpenCertificates: boolean): PortalSampleRow {
  const certificate = firstCertificate(row)
  const contract: string | null = row.wolthers_contract_nr ?? null
  return {
    id: row.id,
    label: sampleLabelText(
      {
        container_nr: row.container_nr ?? null,
        ico_number: row.ico_number ?? null,
        exporter_sample_number: row.exporter_sample_number ?? null,
        certificate_id: certificate?.id ?? null,
        certificate_number: certificate?.certificate_number ?? null,
      },
      contract ? `Contract ${contract}` : 'Sample',
    ),
    contract,
    buyerRef: row.buyer_contract_nr ?? null,
    origin: row.origin ?? null,
    quality: row.quality_name ?? null,
    sampleType: row.sample_type ?? null,
    stage: row.workflow_stage ?? null,
    status: row.status ?? null,
    certificateUrl: certificate && canOpenCertificates ? certificatePdfUrl(certificate.id, companyId) : null,
  }
}

const SEARCH_COLUMNS = ['wolthers_contract_nr', 'buyer_contract_nr', 'container_nr', 'ico_number', 'exporter_sample_number']

/** A PostgREST `or` filter over the sample's own references, or null for an empty search. */
export function sampleSearchFilter(q: string): string | null {
  const term = q.replace(/[,()*%\\"]/g, '').trim()
  if (!term) return null
  return SEARCH_COLUMNS.map((c) => `${c}.ilike.*${term}*`).join(',')
}
