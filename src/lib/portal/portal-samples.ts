// src/lib/portal/portal-samples.ts
import { formatSampleReference, sampleLabelText, shownCertificateNumber } from '@/lib/sample-reference'

/**
 * What the portal shows a client. Never samples.tracking_number: the SAN- lab
 * number is an internal key, so nothing here carries it, and portal links name
 * the sample by its id.
 */
export interface PortalSampleRow {
  id: string
  /** The lot's own identifiers ("HASU 155.201-6 · 002/1649/0185"), else its contract number. */
  reference: string
  origin: string | null
  quality: string | null
  sampleType: string | null
  stage: string | null
  status: string | null
  /** The real certificate number, or null (none issued, or a legacy lab number). */
  certificateNumber: string | null
  certificateUrl: string | null
}

/** Columns a portal sample query selects to build its reference. */
export const PORTAL_SAMPLE_REFERENCE_COLUMNS =
  'sample_type, container_nr, ico_number, exporter_sample_number, buyer_contract_nr, wolthers_contract_nr'

/** The sample's certificates embed — by FK name, as samples→certificates has more than one path. */
export const PORTAL_SAMPLE_CERTIFICATES_EMBED =
  'certificates:certificates!certificates_sample_id_fkey(id, certificate_number, created_at)'

const str = (v: unknown): string => (v == null ? '' : String(v).trim())

/** The latest certificate from an embedded `certificates` array (or single object). */
export function latestCertificate(row: any): { id: string; certificate_number: string | null } | null {
  const certs = Array.isArray(row?.certificates) ? row.certificates : row?.certificates ? [row.certificates] : []
  if (certs.length === 0) return null
  return [...certs].sort((a: any, b: any) => str(b.created_at).localeCompare(str(a.created_at)))[0] ?? null
}

/**
 * The lot as a client recognises it: its container and ICO, or the exporter's
 * sample number; failing those, the buyer's contract number, then ours.
 */
export function portalSampleReference(row: any): string {
  return formatSampleReference(row ?? {})
    || str(row?.buyer_contract_nr)
    || str(row?.wolthers_contract_nr)
    || '—'
}

/** One name for a sample in a short list: its certificate number once issued, else its reference. */
export function portalSampleLabel(row: any): string {
  const cert = latestCertificate(row)
  const label = sampleLabelText(
    {
      container_nr: row?.container_nr,
      ico_number: row?.ico_number,
      exporter_sample_number: row?.exporter_sample_number,
      certificate_id: cert?.id ?? null,
      certificate_number: cert?.certificate_number ?? null,
    },
    '',
  )
  return label || portalSampleReference(row)
}

/** The portal's certificate PDF route, by sample id. */
export function portalCertificatePdfUrl(sampleId: string): string {
  return `/api/portal/certificate/${encodeURIComponent(sampleId)}/pdf`
}

export function mapSampleRow(row: any): PortalSampleRow {
  const certified = row.workflow_stage === 'certified' || row.workflow_stage === 'rejected'
  const cert = latestCertificate(row)
  return {
    id: row.id,
    reference: portalSampleReference(row),
    origin: row.origin ?? null,
    quality: row.quality_name ?? null,
    sampleType: row.sample_type ?? null,
    stage: row.workflow_stage ?? null,
    status: row.status ?? null,
    certificateNumber: cert ? shownCertificateNumber(cert.certificate_number) : null,
    certificateUrl: certified && row.id ? portalCertificatePdfUrl(row.id) : null,
  }
}

/**
 * The PostgREST `or` filter for the portal sample search: the lot's own
 * identifiers and its contract numbers. tracking_number stays in so a SAN-
 * number pasted from an old email still finds its lot; it is never shown.
 * Characters that would break the filter grammar are dropped.
 */
export function portalSampleSearchFilter(q: string): string | null {
  const term = q.replace(/[,()*%\\"]/g, ' ').trim()
  if (!term) return null
  const pattern = `%${term}%`
  return [
    'container_nr',
    'ico_number',
    'exporter_sample_number',
    'wolthers_contract_nr',
    'buyer_contract_nr',
    'tracking_number',
  ].map((col) => `${col}.ilike.${pattern}`).join(',')
}
