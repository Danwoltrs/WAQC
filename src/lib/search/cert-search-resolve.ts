/**
 * Resolve a certificate search term to sample ids, before the certificates
 * query paginates (see /api/certificates). Two kinds of match:
 *
 *  - Per-certificate: the certificate's OWN sample matched on a reference
 *    number or a free-text field (quality, origin, legacy counterparty names).
 *    A contract sibling is a sample row of its own, so a contract-number search
 *    returns that contract's certificate and never its siblings.
 *  - Broad: a company matched by name (client, seller, exporter, importer,
 *    roaster, end client) or a quality spec matched by name → every
 *    certificate of every sample that carries it. A name search is not a
 *    per-contract lookup.
 *
 * Every filter travels in the request URI. Measured 2026-08-28 with the
 * certificates route's embedded select: 350 sample ids (12.7 KB of filter)
 * succeed, 400 (14.5 KB) fail at the transport level ("fetch failed" — the
 * whole URL is ~16 KB by then). So id lists are chunked (six in-lists of 30
 * uuids ≈ 7 KB) and the resolved set handed to the certificates query is
 * capped at MAX_SEARCH_SAMPLE_IDS samples, chosen by their newest certificate
 * so the cap agrees with the list's newest-first order ("Brazil" matches every
 * sample's origin — 775 ids).
 *
 * A failed scan degrades to "incomplete" (logged, `truncated` set), never to
 * an error: the list must still load.
 */
import { buildOrIlike, sanitizeOrTerm } from './or-filter'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import type { CertSearchIdSets } from './cert-search-filter'

export const SAMPLE_REFERENCE_FIELDS = [
  'tracking_number',
  'wolthers_contract_nr',
  'seller_contract_nr',
  'buyer_contract_nr',
  'supplier_contract_nr',
  'shipper_contract_nr',
  'exporter_sample_number',
  'ico_number',
  'container_nr',
]

/** Free text on the sample itself: quality, origin, and the legacy name columns. */
export const SAMPLE_TEXT_FIELDS = [
  'quality_name',
  'origin',
  'micro_origin',
  'supplier',
  'exporter_legacy',
  'importer_legacy',
  'roaster_legacy',
]

/** Every company role a sample can carry. */
export const COUNTERPARTY_FIELDS = [
  'client_id',
  'seller_id',
  'exporter_id',
  'importer_id',
  'roaster_id',
  'end_client_id',
]

// Reference-number searches (the primary use) match a handful of rows; these
// caps only bite on very broad substrings, which the response then flags.
export const SAMPLE_SCAN_LIMIT = 2000
export const COMPANY_SCAN_LIMIT = 200
export const QUALITY_SCAN_LIMIT = 200
/** Company ids per samples request: 6 in-lists × 30 uuids ≈ 7 KB of filter. */
export const COMPANY_CHUNK_SIZE = 30
/** Sample ids the certificates query may carry: 300 uuids ≈ 11 KB (350 OK, 400 fails — see above). */
export const MAX_SEARCH_SAMPLE_IDS = 300

export interface CertSearchResolution extends CertSearchIdSets {
  /** A scan hit its cap, failed, or the union was cut to the newest certificates — results may be incomplete. */
  truncated: boolean
}

type Row = { id: string }
type CertRow = { sample_id: string; created_at: string | null }
const EMPTY: CertSearchResolution = { sampleIds: [], clientSampleIds: [], truncated: false }

/**
 * @param term the search text as typed (trimmed here; `.or()` parts are sanitized
 *   of the PostgREST delimiters, `.ilike()` params keep everything but wildcards).
 */
export async function resolveCertificateSearchIds(db: any, term: string): Promise<CertSearchResolution> {
  const safeQ = sanitizeOrTerm(term)
  if (safeQ.length === 0) return EMPTY
  const pattern = `%${term.trim().replace(/[%_]/g, '')}%`
  let truncated = false

  const rows = <R>(what: string, res: { data: R[] | null; error: any }): R[] => {
    if (res.error) {
      console.warn(`[certificates] search scan failed (${what}); results will be incomplete:`, res.error?.message ?? res.error)
      truncated = true
      return []
    }
    return res.data ?? []
  }
  const newestFirst = (q: any) => q.order('created_at', { ascending: false })

  const [sampleRes, companyRes, templateRes, customRes] = await Promise.all([
    newestFirst(db.from('samples').select('id')
      .or(buildOrIlike([...SAMPLE_REFERENCE_FIELDS, ...SAMPLE_TEXT_FIELDS], safeQ)))
      .limit(SAMPLE_SCAN_LIMIT),
    db.from('companies').select('id')
      .or(`name.ilike.%${safeQ}%,fantasy_name.ilike.%${safeQ}%`)
      .limit(COMPANY_SCAN_LIMIT),
    db.from('quality_templates').select('id').ilike('name', pattern).limit(QUALITY_SCAN_LIMIT),
    db.from('client_qualities').select('id').ilike('custom_name', pattern).limit(QUALITY_SCAN_LIMIT),
  ])
  const own = new Set(rows<Row>('samples', sampleRes).map((r) => r.id))
  const companyIds = rows<Row>('companies', companyRes).map((r) => r.id)
  const templateIds = rows<Row>('quality_templates', templateRes).map((r) => r.id)
  const qualityIds = new Set(rows<Row>('client_qualities', customRes).map((r) => r.id))
  truncated ||= own.size >= SAMPLE_SCAN_LIMIT || companyIds.length >= COMPANY_SCAN_LIMIT
    || templateIds.length >= QUALITY_SCAN_LIMIT || qualityIds.size >= QUALITY_SCAN_LIMIT

  // A client's spec named after a template ("NY 2/3 Fine Cup") carries no
  // custom_name of its own, so match through the template too.
  if (templateIds.length > 0) {
    const byTemplate = rows<Row>('client_qualities by template', await selectInChunks<Row>(templateIds, (chunk) =>
      db.from('client_qualities').select('id').in('template_id', chunk).limit(QUALITY_SCAN_LIMIT)))
    truncated ||= byTemplate.length >= QUALITY_SCAN_LIMIT
    for (const q of byTemplate) qualityIds.add(q.id)
  }

  const broad = new Set<string>()
  if (companyIds.length > 0) {
    const matched = rows<Row>('samples by company', await selectInChunks<Row>(companyIds, (chunk) => {
      const list = chunk.join(',')
      return newestFirst(db.from('samples').select('id')
        .or(COUNTERPARTY_FIELDS.map((f) => `${f}.in.(${list})`).join(',')))
        .limit(SAMPLE_SCAN_LIMIT)
    }, COMPANY_CHUNK_SIZE))
    truncated ||= matched.length >= SAMPLE_SCAN_LIMIT
    for (const r of matched) if (!own.has(r.id)) broad.add(r.id)
  }
  if (qualityIds.size > 0) {
    const matched = rows<Row>('samples by quality', await selectInChunks<Row>([...qualityIds], (chunk) =>
      newestFirst(db.from('samples').select('id').in('quality_spec_id', chunk)).limit(SAMPLE_SCAN_LIMIT)))
    truncated ||= matched.length >= SAMPLE_SCAN_LIMIT
    for (const r of matched) if (!own.has(r.id)) broad.add(r.id)
  }

  if (own.size + broad.size <= MAX_SEARCH_SAMPLE_IDS) {
    return { sampleIds: [...own], clientSampleIds: [...broad], truncated }
  }

  // Too many for one URI. Keep the samples whose certificates are newest — the
  // list is newest-first by certificate date, so a broad term still shows the
  // top of its list — and spend no slot on a sample without a certificate.
  truncated = true
  const union = [...own, ...broad]
  const certRes = await selectInChunks<CertRow>(union, (chunk) =>
    db.from('certificates').select('sample_id, created_at').in('sample_id', chunk))
  let keep: string[]
  if (certRes.error) {
    rows<CertRow>('certificates by sample', certRes)
    keep = union.slice(0, MAX_SEARCH_SAMPLE_IDS) // scans are newest-first by intake
  } else {
    const certs = (certRes.data ?? []).slice()
      .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 0))
    const seen = new Set<string>()
    keep = []
    for (const c of certs) {
      if (seen.has(c.sample_id)) continue
      seen.add(c.sample_id)
      keep.push(c.sample_id)
      if (keep.length >= MAX_SEARCH_SAMPLE_IDS) break
    }
  }
  return {
    sampleIds: keep.filter((id) => own.has(id)),
    clientSampleIds: keep.filter((id) => !own.has(id)),
    truncated,
  }
}
