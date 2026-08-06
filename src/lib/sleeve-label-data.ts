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

/**
 * Labels render the laboratory's local calendar date, not UTC: a certificate
 * issued at 22:30 on 30 June in Santos must print 30/Jun, not 1/Jul.
 *
 * Hardcoded to the Santos HQ zone. The other labs (Buenaventura, Guatemala
 * City, Lima) certify in their own local days and would need this resolved
 * per-laboratory — tracked as a follow-up, not in scope here.
 */
export const LABEL_TIME_ZONE = 'America/Sao_Paulo'

/** Extract day, month (short), and year in the label timezone. */
function dateParts(d: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LABEL_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return { day: get('day'), month: get('month'), year: get('year') }
}

/** "BR-036991/26" + July -> "BR-036991/JUL/26". No year segment -> "37112/JUL". */
export function withCertifiedMonth(certNumber: string, certifiedAt: string | null | undefined): string {
  if (!certNumber) return ''
  if (!certifiedAt) return certNumber
  const d = new Date(certifiedAt)
  if (Number.isNaN(d.getTime())) return certNumber
  const month = dateParts(d).month.toUpperCase()
  const lastSlash = certNumber.lastIndexOf('/')
  if (lastSlash === -1) return `${certNumber}/${month}`
  return `${certNumber.slice(0, lastSlash)}/${month}${certNumber.slice(lastSlash)}`
}

/** "2026-07-29T12:00:00Z" -> "29/Jul/2026". */
export function formatLabelDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const { day, month, year } = dateParts(d)
  return `${day}/${month}/${year}`
}

/**
 * The tin's tonnage is the mother sample plus every sub-contract, because one
 * tin covers the whole lot. Returns null when no tonnage is stored anywhere, so
 * formatSleeveQuantity derives it from the bag count instead.
 */
export function sumSleeveQuantityMt(
  motherMt: number | null | undefined,
  subContractMt: Array<number | null | undefined>,
): number | null {
  const values = [motherMt, ...subContractMt].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0)
}

/** "333 bags in 60 kg jute bags | 20.0 MT", or the bulk equivalent form. */
export function formatSleeveQuantity(src: SleeveLabelSource): string | null {
  const { bagCount, bagWeightKg, bagType, quantityMt, equivalent60kgBags } = src

  // `||`, not `??`: a stored 0 is "not filled in", not "zero tonnes", and must
  // fall through to the bag-derived figure rather than print "0.0 MT".
  if (bagType === 'bulk' && equivalent60kgBags) {
    const mt = quantityMt || (equivalent60kgBags * 60) / 1000
    return `equiv. ${Math.round(equivalent60kgBags)} bags in 60 kg | ${mt.toFixed(1)} MT`
  }

  if (bagCount != null && bagWeightKg != null) {
    const bagTypeName =
      bagType === 'jute_bag' ? 'jute bags' : bagType === 'pp_bag' ? 'PP bags' : 'bags'
    const mt = quantityMt || (bagCount * bagWeightKg) / 1000
    return `${bagCount} bags in ${bagWeightKg} kg ${bagTypeName} | ${mt.toFixed(1)} MT`
  }

  return null
}

export interface SleeveCertificateRow {
  sample_contract_id: string | null
  certificate_number: string
  created_at: string
}

/**
 * Mother certificate first, then the sub-contract certificates in the order the
 * sub-contracts themselves are displayed (sample_contracts.sort_order).
 *
 * Sub-contract certificates minted in one batch share a created_at, so ordering
 * the comma-joined Cert. field on the timestamp made it shuffle between prints
 * of the same tin. Rows with no known sort_order keep their incoming order and
 * sort last.
 *
 * `rows` is expected in created_at order, which sets the certified date when
 * there is no mother certificate.
 */
export function orderSleeveCertificates(
  rows: SleeveCertificateRow[],
  sortOrderByContractId: Record<string, number | null | undefined>,
): { numbers: string[]; certifiedAt: string | null } {
  const mother = rows.find(r => r.sample_contract_id === null)
  const subs = rows
    .filter(r => r.sample_contract_id !== null)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ao = sortOrderByContractId[a.row.sample_contract_id!] ?? Number.MAX_SAFE_INTEGER
      const bo = sortOrderByContractId[b.row.sample_contract_id!] ?? Number.MAX_SAFE_INTEGER
      return ao === bo ? a.index - b.index : ao - bo
    })
    .map(e => e.row)

  return {
    numbers: [
      ...(mother ? [mother.certificate_number] : []),
      ...subs.map(r => r.certificate_number),
    ],
    certifiedAt: mother?.created_at || rows[0]?.created_at || null,
  }
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

export interface CompanyNameLike {
  name?: string | null
  fantasy_name?: string | null
}

/**
 * The name to print for a counterparty.
 *
 * Labels carry the trade name (nome fantasia) — nobody in the trade says
 * "Syngenta AVC SA". The legal name is the fallback, and stays authoritative
 * everywhere else: certificates, contracts, correspondence.
 */
export function resolveCompanyName(company: CompanyNameLike | null | undefined): string | null {
  if (!company) return null
  const trade = (company.fantasy_name || '').trim()
  if (trade) return trade
  return (company.name || '').trim() || null
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
