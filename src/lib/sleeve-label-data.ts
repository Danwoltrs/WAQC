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
  icoNumber?: string | null
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

/** One of the lot's own identifiers, ready to print: "Container: " + "HASU 155.201-6". */
export interface SleeveReference {
  /** What to call it — 'Container: ', 'ICO: ', 'Sample: '. */
  label: string
  value: string
}

export interface SleeveLabelFields {
  /** The certificate number, which leads the label. */
  headline: string
  /**
   * The lot's own identifiers, in print order, minus whatever the headline
   * already took. A shipment sample carries both its container and its ICO.
   */
  references: SleeveReference[]
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

/**
 * Split "BR-036992/JUL/26" into its prefix, sequence digits and suffix.
 *
 * The sequence is the LAST digit run before the first '/', because prefixes
 * themselves contain digits ("BD1-001133") and a rejected number carries a
 * second segment ("R-SAK-011799"). Returns null for anything that does not
 * parse, which then never joins a range.
 */
function splitCertNumber(
  certNumber: string,
): { prefix: string; digits: string; suffix: string } | null {
  const slash = certNumber.indexOf('/')
  const head = slash === -1 ? certNumber : certNumber.slice(0, slash)
  const suffix = slash === -1 ? '' : certNumber.slice(slash)
  const m = /^(.*?)(\d+)$/.exec(head)
  if (!m) return null
  return { prefix: m[1], digits: m[2], suffix }
}

/** Runs shorter than this stay written out in full — a range would not earn it. */
const MIN_RUN_TO_COLLAPSE = 3

/**
 * Collapse consecutive certificate numbers into ranges:
 * BR-036992/JUL/26 … BR-036998/JUL/26 -> "BR-036992-036998/JUL/26".
 *
 * The Cert. line is two lines of 6.5pt inside a 93mm column — about six numbers
 * before textkit ellipsises the rest away. A lot split across nine contracts
 * therefore LOST numbers, which is exactly what the field exists to show. Splits
 * are numbered from one sequence in one batch, so they are consecutive in
 * practice and a range says the same thing in a third of the width.
 *
 * Anything that does not form a run of MIN_RUN_TO_COLLAPSE — a gap, a different
 * prefix, a different zero-padding — is printed in full.
 */
export function compressCertificateNumbers(numbers: string[]): string[] {
  const out: string[] = []
  let i = 0

  while (i < numbers.length) {
    const start = splitCertNumber(numbers[i])
    let end = i

    if (start) {
      while (end + 1 < numbers.length) {
        const next = splitCertNumber(numbers[end + 1])
        const prev = splitCertNumber(numbers[end])!
        if (
          !next ||
          next.prefix !== prev.prefix ||
          next.suffix !== prev.suffix ||
          next.digits.length !== prev.digits.length ||
          Number(next.digits) !== Number(prev.digits) + 1
        ) {
          break
        }
        end += 1
      }
    }

    const runLength = end - i + 1
    if (runLength >= MIN_RUN_TO_COLLAPSE && start) {
      const last = splitCertNumber(numbers[end])!
      out.push(`${start.prefix}${start.digits}-${last.digits}${start.suffix}`)
    } else {
      for (let k = i; k <= end; k++) out.push(numbers[k])
    }
    i = end + 1
  }

  return out
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
  certificate_number: string | null
  created_at: string
}

export interface SleeveSubContract {
  id: string
  /**
   * sample_contracts.tracking_number — the mirror of this split's certificate
   * number, written by the assign_certificate_number trigger.
   */
  tracking_number?: string | null
  sort_order?: number | null
}

/**
 * Mother certificate first, then one number per sub-contract, in the order the
 * sub-contracts themselves are displayed (sample_contracts.sort_order).
 *
 * The sub-contract LIST drives this, not the certificates table: a split whose
 * certificate row is missing or was inserted with a null number still has its
 * number mirrored on sample_contracts.tracking_number, and dropping it left the
 * tin showing the mother's number alone for a lot covering several contracts.
 * Certificate rows still win when both exist, and a certificate whose
 * sub-contract did not come back is appended rather than lost.
 *
 * Sub-contract certificates minted in one batch share a created_at, so ordering
 * the comma-joined Cert. field on the timestamp made it shuffle between prints
 * of the same tin. Sub-contracts with no sort_order keep their incoming order
 * and sort last.
 *
 * `rows` is expected in created_at order, which sets the certified date when
 * there is no mother certificate.
 */
export function orderSleeveCertificates(
  rows: SleeveCertificateRow[],
  subContracts: SleeveSubContract[],
): { numbers: string[]; certifiedAt: string | null } {
  const mother = rows.find(r => r.sample_contract_id === null)

  const certByContractId = new Map<string, SleeveCertificateRow>()
  for (const row of rows) {
    if (row.sample_contract_id && !certByContractId.has(row.sample_contract_id)) {
      certByContractId.set(row.sample_contract_id, row)
    }
  }

  const ordered = subContracts
    .map((sub, index) => ({ sub, index }))
    .sort((a, b) => {
      const ao = a.sub.sort_order ?? Number.MAX_SAFE_INTEGER
      const bo = b.sub.sort_order ?? Number.MAX_SAFE_INTEGER
      return ao === bo ? a.index - b.index : ao - bo
    })
    .map(e => e.sub)

  const numbers: string[] = []
  const seen = new Set<string>()
  const push = (n: string | null | undefined) => {
    const v = (n || '').trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    numbers.push(v)
  }

  push(mother?.certificate_number)
  for (const sub of ordered) {
    push(certByContractId.get(sub.id)?.certificate_number || sub.tracking_number)
  }

  const knownSubIds = new Set(ordered.map(sub => sub.id))
  for (const row of rows) {
    if (row.sample_contract_id && !knownSubIds.has(row.sample_contract_id)) {
      push(row.certificate_number)
    }
  }

  return {
    numbers,
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

/**
 * Every identifier the lot is known by, in the order it should print.
 *
 * A shipment sample is known by BOTH its container and its ICO — the warehouse
 * reads back one, the shipping documents the other — so the label carries both
 * rather than picking one. A pre-shipment sample leads with the exporter's
 * sample number. Whatever is missing is simply absent.
 */
function sleeveReferences(src: SleeveLabelSource): SleeveReference[] {
  const container = { label: 'Container: ', value: (src.containerNr || '').trim() }
  const ico = { label: 'ICO: ', value: (src.icoNumber || '').trim() }
  const exporterSample = { label: 'Sample: ', value: (src.exporterSampleNumber || '').trim() }

  const ordered =
    src.sampleType === 'PSS'
      ? [exporterSample, container, ico]
      : [container, ico, exporterSample]

  return ordered.filter(r => r.value)
}

export function buildSleeveLabelFields(src: SleeveLabelSource): SleeveLabelFields {
  const certs = (src.certificateNumbers || [])
    .filter(Boolean)
    .map(c => withCertifiedMonth(c, src.certifiedAt))

  // The certificate number leads: it is the number a warehouse reads back to
  // us, the one the QR resolves to, and the only one that is unique per lot.
  // The container falls to the line below. When there is no certificate yet the
  // first reference is promoted so the label still says which lot it belongs to.
  let references = sleeveReferences(src)
  let headline: string

  if (certs.length > 0) {
    headline = certs[0]
  } else if (references.length > 0) {
    headline = references[0].value
    references = references.slice(1)
  } else {
    headline = 'Reference pending'
  }

  // The Cert. field shows only what the headline did not take — for a sample
  // with sub-contracts, its sub-contract certificates. So no number is printed
  // twice and none is lost, consecutive runs collapsing to ranges so a lot with
  // many splits still fits the two lines the label has.
  const remaining = compressCertificateNumbers(certs.slice(1))

  return {
    headline,
    references,
    seller: party(src.sellerName, src.sellerRef),
    client: party(src.clientName, src.clientRef),
    cert: remaining.length > 0 ? remaining.join(', ') : null,
    roaster: (src.roasterName || '').trim() || null,
    quality: (src.quality || '').trim() || null,
    quantity: formatSleeveQuantity(src),
    date: formatLabelDate(src.certifiedAt),
  }
}
