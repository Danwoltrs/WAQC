/**
 * Resolve what the certificates list was searched for — one term, or a pasted
 * list of numbers — into the `.or()` filter for the certificates query.
 *
 * A single term keeps today's path exactly (ilike on the certificate plus the
 * resolved sample ids). A list instead searches the UNION of every term's
 * samples as one `sample_id.in.(...)`: the filter travels in the request URI,
 * and per-term ilike parts would push 50 terms past the ~24 KB proxy limit.
 * Each term also scans certificate_number / issued_to, since a certificate
 * number is not a sample field. A term whose samples have no certificate is
 * reported back so the page can name what the list could not find. Both reads
 * skip a certificate whose sample is soft-deleted, as the list itself does, so
 * a deleted lot's number is named as not found instead of quietly vanishing.
 */
import { splitSearchTerms } from './search-terms'
import { buildCertificateSearchOr } from './cert-search-filter'
import { sanitizeOrTerm } from './or-filter'
import {
  MAX_SEARCH_SAMPLE_IDS,
  SAMPLE_SCAN_LIMIT,
  resolveCertificateSearchIds,
} from './cert-search-resolve'
import { selectInChunks } from '@/lib/supabase-in-chunks'

export interface CertificateSearch {
  /** PostgREST .or() filter for the certificates query; null = no search. */
  or: string | null
  truncated: boolean
  failed: boolean
  /** Multi-term searches only; [] otherwise. */
  unmatchedTerms: string[]
  termsCapped: boolean
}

/** A filter that matches no certificate. */
export const NO_MATCH_OR = 'sample_id.eq.00000000-0000-0000-0000-000000000000'

const TERMS_IN_FLIGHT = 5

// Joins the certificate's sample so `.is(LIVE_SAMPLE, null)` can drop a deleted one.
const LIVE_CERTIFICATE_SELECT = 'sample_id, sample:samples!inner(deleted_at)'
const LIVE_SAMPLE = 'sample.deleted_at'

export async function resolveCertificateSearch(db: any, input: string): Promise<CertificateSearch> {
  const { terms, capped } = splitSearchTerms(input)
  const base = { truncated: false, failed: false, unmatchedTerms: [] as string[], termsCapped: capped }
  if (terms.length === 0) return { ...base, or: null }

  if (terms.length === 1) {
    const safeQ = sanitizeOrTerm(terms[0])
    if (safeQ.length === 0) return { ...base, or: null }
    const { sampleIds, clientSampleIds, truncated, failed } = await resolveCertificateSearchIds(db, terms[0])
    return { ...base, or: buildCertificateSearchOr(`%${safeQ}%`, { sampleIds, clientSampleIds }), truncated, failed }
  }

  let failed = false
  let truncated = false

  const resolveTerm = async (term: string): Promise<string[]> => {
    const safeQ = sanitizeOrTerm(term)
    if (safeQ.length === 0) return []
    const [ids, scan] = await Promise.all([
      resolveCertificateSearchIds(db, term),
      db.from('certificates').select(LIVE_CERTIFICATE_SELECT)
        .or(`certificate_number.ilike.%${safeQ}%,issued_to.ilike.%${safeQ}%`)
        .not('sample_id', 'is', null)
        .is(LIVE_SAMPLE, null)
        .limit(SAMPLE_SCAN_LIMIT),
    ])
    if (ids.failed) failed = true
    if (ids.truncated) truncated = true
    if (scan.error) {
      console.warn('[certificates] list search: certificate scan failed; results will be incomplete:', scan.error?.message ?? scan.error)
      failed = true
    }
    const scanned = ((scan.data ?? []) as { sample_id: string }[]).map((r) => r.sample_id)
    return [...new Set([...ids.sampleIds, ...ids.clientSampleIds, ...scanned])]
  }

  // At most TERMS_IN_FLIGHT terms at once: each fans out into several scans.
  const perTerm: string[][] = new Array(terms.length)
  let next = 0
  const worker = async () => {
    while (next < terms.length) {
      const i = next++
      perTerm[i] = await resolveTerm(terms[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(TERMS_IN_FLIGHT, terms.length) }, worker))

  let union = [...new Set(perTerm.flat())]
  if (union.length > MAX_SEARCH_SAMPLE_IDS) {
    union = union.slice(0, MAX_SEARCH_SAMPLE_IDS)
    truncated = true
  }

  let unmatchedTerms: string[] = []
  if (union.length > 0) {
    const res = await selectInChunks<{ sample_id: string }>(union, (chunk) =>
      db.from('certificates').select(LIVE_CERTIFICATE_SELECT).in('sample_id', chunk).is(LIVE_SAMPLE, null))
    if (res.error) {
      console.warn('[certificates] list search: certificate lookup failed; results will be incomplete:', res.error?.message ?? res.error)
      failed = true
    } else {
      const certified = new Set((res.data ?? []).map((r) => r.sample_id))
      const kept = new Set(union)
      // A term whose samples were cut by the cap is unknown, not unmatched.
      unmatchedTerms = terms.filter((_, i) =>
        !perTerm[i].some((id) => certified.has(id)) && perTerm[i].every((id) => kept.has(id)))
    }
  } else {
    unmatchedTerms = [...terms]
  }

  return {
    or: union.length > 0 ? `sample_id.in.(${union.join(',')})` : NO_MATCH_OR,
    truncated,
    failed,
    unmatchedTerms,
    termsCapped: capped,
  }
}
