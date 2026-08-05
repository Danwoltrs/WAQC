/**
 * Field derivation for the tin sleeve label.
 *
 * The label never shows samples.tracking_number (the internal SAN- lab number).
 * It leads with the counterparty's own identifier — the container number for a
 * shipment sample, the exporter's sample number for a pre-shipment sample — and
 * carries the OFFICIAL certificate number in its own field.
 *
 * Pure: no Supabase, no react-pdf, no ambient clock.
 */

export type SleeveSampleType = 'PSS' | 'SS' | 'Type Sample' | 'Stocklot'

export interface SleeveLabelSource {
  sampleType: SleeveSampleType
  containerNr?: string | null
  exporterSampleNumber?: string | null
  /** Mother certificate first, then each sub-contract's. Raw, without the month. */
  certificateNumbers: string[]
  /** ISO timestamp the certificate was issued (certificates.created_at). */
  certifiedAt?: string | null
  sellerName?: string | null
  sellerRef?: string | null
  clientName?: string | null
  clientRef?: string | null
  roasterName?: string | null
  quality?: string | null
  bagCount?: number | null
  bagWeightKg?: number | null
  bagType?: string | null
  quantityMt?: number | null
  equivalent60kgBags?: number | null
}

export interface SleeveLabelFields {
  headline: string
  seller: string | null
  client: string | null
  cert: string | null
  roaster: string | null
  quality: string | null
  quantity: string | null
  date: string | null
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** "BR-036991/26" + July -> "BR-036991/JUL/26". No year segment -> "37112/JUL". */
export function withCertifiedMonth(certNumber: string, certifiedAt: string | null | undefined): string {
  if (!certNumber) return ''
  if (!certifiedAt) return certNumber
  const d = new Date(certifiedAt)
  if (Number.isNaN(d.getTime())) return certNumber
  const month = MONTHS[d.getMonth()]
  const lastSlash = certNumber.lastIndexOf('/')
  if (lastSlash === -1) return `${certNumber}/${month}`
  return `${certNumber.slice(0, lastSlash)}/${month}${certNumber.slice(lastSlash)}`
}

/** "2026-07-29T12:00:00Z" -> "29/Jul/2026". */
export function formatLabelDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return `${day}/${month}/${d.getFullYear()}`
}

/** "333 bags in 60 kg jute bags | 20.0 MT", or the bulk equivalent form. */
export function formatSleeveQuantity(src: SleeveLabelSource): string | null {
  const { bagCount, bagWeightKg, bagType, quantityMt, equivalent60kgBags } = src

  if (bagType === 'bulk' && equivalent60kgBags) {
    const mt = quantityMt ?? (equivalent60kgBags * 60) / 1000
    return `equiv. ${Math.round(equivalent60kgBags)} bags in 60 kg | ${mt.toFixed(1)} MT`
  }

  if (bagCount != null && bagWeightKg != null) {
    const bagTypeName =
      bagType === 'jute_bag' ? 'jute bags' : bagType === 'pp_bag' ? 'PP bags' : 'bags'
    const mt = quantityMt ?? (bagCount * bagWeightKg) / 1000
    return `${bagCount} bags in ${bagWeightKg} kg ${bagTypeName} | ${mt.toFixed(1)} MT`
  }

  return null
}

const SAMPLE_TYPES: Record<string, SleeveSampleType> = {
  pss: 'PSS',
  ss: 'SS',
  type: 'Type Sample',
  stocklot: 'Stocklot',
}

/** samples.sample_type ("pss", "ss", …) -> the label's display type. */
export function toSleeveSampleType(raw: string | null | undefined): SleeveSampleType {
  return SAMPLE_TYPES[String(raw || '').toLowerCase()] || 'PSS'
}

export interface QualitySpecLike {
  custom_name?: string | null
  template?: {
    name_en?: string | null
    name_pt?: string | null
    name_es?: string | null
  } | null
}

/**
 * The client's custom name OR the template name — never both.
 *
 * The old label printed "{custom_name} - {template_name}", which rendered as
 * "Dunkin - Dunkin" whenever the two matched.
 */
export function resolveQualityName(
  qualitySpec: QualitySpecLike | null | undefined,
  fallback?: string | null,
): string | null {
  const candidates = [
    qualitySpec?.custom_name,
    qualitySpec?.template?.name_en,
    qualitySpec?.template?.name_pt,
    qualitySpec?.template?.name_es,
    fallback,
  ]
  for (const c of candidates) {
    const v = (c || '').trim()
    if (v) return v
  }
  return null
}

/** "Cocatrel (34680)", "OFI", or null when there is no name to print. */
function party(name?: string | null, ref?: string | null): string | null {
  const n = (name || '').trim()
  if (!n) return null
  const r = (ref || '').trim()
  return r ? `${n} (${r})` : n
}

export function buildSleeveLabelFields(src: SleeveLabelSource): SleeveLabelFields {
  const certs = (src.certificateNumbers || [])
    .filter(Boolean)
    .map(c => withCertifiedMonth(c, src.certifiedAt))

  const container = (src.containerNr || '').trim()
  const exporterSample = (src.exporterSampleNumber || '').trim()

  let headline: string
  let certUsedAsHeadline = false

  if (src.sampleType === 'SS' && container) {
    headline = container
  } else if (src.sampleType === 'PSS' && exporterSample) {
    headline = exporterSample
  } else if (container) {
    headline = container
  } else if (exporterSample) {
    headline = exporterSample
  } else if (certs.length > 0) {
    headline = certs[0]
    certUsedAsHeadline = true
  } else {
    headline = 'Reference pending'
  }

  // When the certificate number became the headline, the Cert. field shows only
  // what is left, so no number is printed twice and none is lost.
  const remaining = certUsedAsHeadline ? certs.slice(1) : certs

  return {
    headline,
    seller: party(src.sellerName, src.sellerRef),
    client: party(src.clientName, src.clientRef),
    cert: remaining.length > 0 ? remaining.join(', ') : null,
    roaster: (src.roasterName || '').trim() || null,
    quality: (src.quality || '').trim() || null,
    quantity: formatSleeveQuantity(src),
    date: formatLabelDate(src.certifiedAt),
  }
}
