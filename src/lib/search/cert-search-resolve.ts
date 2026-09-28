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
 * A failed scan is retried once (a transient timeout must not change what a
 * search returns), then degrades to "incomplete" (logged, `failed` set),
 * never to an error: the list must still load. `truncated` is kept for the
 * other case, a term too broad for the caps, so the page can say which.
 */
import { buildOrIlike, sanitizeOrTerm } from './or-filter'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import type { CertSearchIdSets } from './cert-search-filter'

/**
 * Every reference a certificate is looked up by: the lab number, the Wolthers
 * contract, each party's own contract ref (seller, shipper/exporter, buyer,
 * roaster, QC client, end client, supplier), the exporter's sample number,
 * the ICO and the container.
 */
export const SAMPLE_REFERENCE_FIELDS = [
  'tracking_number',
  'wolthers_contract_nr',
  'seller_contract_nr',
  'shipper_contract_nr',
  'exporter_contract_nr',
  'buyer_contract_nr',
  'roaster_contract_nr',
  'qc_client_contract_nr',
  'end_client_contract_nr',
  'supplier_contract_nr',
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
// 1000 = PostgREST's default max_rows: a higher limit is silently cut there,
// and the "hit its cap" check below would never fire.
export const SAMPLE_SCAN_LIMIT = 1000
export const COMPANY_SCAN_LIMIT = 200
export const QUALITY_SCAN_LIMIT = 200
/** Company ids per samples request: 6 in-lists × 30 uuids ≈ 7 KB of filter. */
export const COMPANY_CHUNK_SIZE = 30
/** Sample ids the certificates query may carry: 300 uuids ≈ 11 KB (350 OK, 400 fails — see above). */
export const MAX_SEARCH_SAMPLE_IDS = 300

export interface CertSearchResolution extends CertSearchIdSets {
  /** A scan hit its cap, or the union was cut to the newest certificates: the term is too broad. */
  truncated: boolean
  /** A scan failed twice: some matches are missing, and the same search may return more next time. */
  failed: boolean
}

type Row = { id: string }
type CertRow = { sample_id: string; created_at: string | null }
const EMPTY: CertSearchResolution = { sampleIds: [], clientSampleIds: [], truncated: false, failed: false }
type Res<R> = { data: R[] | null; error: any }

/**
 * @param term the search text as typed (trimmed here; `.or()` parts are sanitized
 *   of the PostgREST delimiters, `.ilike()` params keep everything but wildcards).
 */
export async function resolveCertificateSearchIds(db: any, term: string): Promise<CertSearchResolution> {
  const safeQ = sanitizeOrTerm(term)
  if (safeQ.length === 0) return EMPTY
  const pattern = `%${term.trim().replace(/[%_]/g, '')}%`
  let truncated = false
  let failed = false

  const rows = <R>(what: string, res: Res<R>): R[] => {
    if (res.error) {
      console.warn(`[certificates] search scan failed (${what}); results will be incomplete:`, res.error?.message ?? res.error)
      failed = true
      return []
    }
    return res.data ?? []
  }
  // A scan that errors runs once more before it counts as failed.
  const scan = async <R>(what: string, run: () => PromiseLike<Res<R>>): Promise<R[]> => {
    let res = await run()
    if (res.error) res = await run()
    return rows(what, res)
  }
  const newestFirst = (q: any) => q.order('created_at', { ascending: false })

  const [ownRows, companyRows, templateRows, customRows] = await Promise.all([
    scan<Row>('samples', () => newestFirst(db.from('samples').select('id')
      .is('deleted_at', null)
      .or(buildOrIlike([...SAMPLE_REFERENCE_FIELDS, ...SAMPLE_TEXT_FIELDS], safeQ)))
      .limit(SAMPLE_SCAN_LIMIT)),
    scan<Row>('companies', () => db.from('companies').select('id')
      .or(`name.ilike.%${safeQ}%,fantasy_name.ilike.%${safeQ}%`)
      .limit(COMPANY_SCAN_LIMIT)),
    scan<Row>('quality_templates', () => db.from('quality_templates').select('id').ilike('name', pattern).limit(QUALITY_SCAN_LIMIT)),
    scan<Row>('client_qualities', () => db.from('client_qualities').select('id').ilike('custom_name', pattern).limit(QUALITY_SCAN_LIMIT)),
  ])
  const own = new Set(ownRows.map((r) => r.id))
  const companyIds = companyRows.map((r) => r.id)
  const templateIds = templateRows.map((r) => r.id)
  const qualityIds = new Set(customRows.map((r) => r.id))
  truncated ||= own.size >= SAMPLE_SCAN_LIMIT || companyIds.length >= COMPANY_SCAN_LIMIT
    || templateIds.length >= QUALITY_SCAN_LIMIT || qualityIds.size >= QUALITY_SCAN_LIMIT

  // A client's spec named after a template ("NY 2/3 Fine Cup") carries no
  // custom_name of its own, so match through the template too.
  if (templateIds.length > 0) {
    const byTemplate = await scan<Row>('client_qualities by template', () => selectInChunks<Row>(templateIds, (chunk) =>
      db.from('client_qualities').select('id').in('template_id', chunk).limit(QUALITY_SCAN_LIMIT)))
    truncated ||= byTemplate.length >= QUALITY_SCAN_LIMIT
    for (const q of byTemplate) qualityIds.add(q.id)
  }

  const broad = new Set<string>()
  if (companyIds.length > 0) {
    const matched = await scan<Row>('samples by company', () => selectInChunks<Row>(companyIds, (chunk) => {
      const list = chunk.join(',')
      return newestFirst(db.from('samples').select('id')
      .is('deleted_at', null)
        .or(COUNTERPARTY_FIELDS.map((f) => `${f}.in.(${list})`).join(',')))
        .limit(SAMPLE_SCAN_LIMIT)
    }, COMPANY_CHUNK_SIZE))
    truncated ||= matched.length >= SAMPLE_SCAN_LIMIT
    for (const r of matched) if (!own.has(r.id)) broad.add(r.id)
  }
  if (qualityIds.size > 0) {
    const matched = await scan<Row>('samples by quality', () => selectInChunks<Row>([...qualityIds], (chunk) =>
      newestFirst(db.from('samples').select('id')
      .is('deleted_at', null).in('quality_spec_id', chunk)).limit(SAMPLE_SCAN_LIMIT)))
    truncated ||= matched.length >= SAMPLE_SCAN_LIMIT
    for (const r of matched) if (!own.has(r.id)) broad.add(r.id)
  }

  if (own.size + broad.size <= MAX_SEARCH_SAMPLE_IDS) {
    return { sampleIds: [...own], clientSampleIds: [...broad], truncated, failed }
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
    failed,
  }
}
