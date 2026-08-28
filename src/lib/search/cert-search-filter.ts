/**
 * Build the PostgREST `.or()` filter for a certificate search.
 *
 * A certificate belongs to exactly one sample and a contract sibling is a sample
 * in its own right (samples.lab_source_sample_id), so matching is simply "the
 * certificate's own sample matched". A contract-number search therefore returns
 * that contract's certificate — and only it — even when the physical lot behind
 * it covers ten other contracts: the siblings carry different numbers and never
 * ride along. `certificates.sample_contract_id` is dead and must not be read.
 *
 *  - Reference match: the SAMPLE's own reference fields matched the query.
 *  - Company-name (any counterparty role) and quality-name matches stay broad
 *    (every certificate of the samples carrying them) — a name search is not a
 *    per-contract lookup.
 */
export interface CertSearchIdSets {
  /** Sample ids whose OWN reference fields matched → their certificates. */
  sampleIds: string[]
  /** Sample ids carrying a name-matched company (any role) or quality → all of their certificates. */
  clientSampleIds: string[]
}

/**
 * @param like a PostgREST ILIKE pattern already wrapped in `%…%` and sanitized of the
 *   `.or()` delimiters (`,()%_`) — see sanitizeOrTerm.
 */
export function buildCertificateSearchOr(like: string, ids: CertSearchIdSets): string {
  const parts = [`certificate_number.ilike.${like}`, `issued_to.ilike.${like}`]
  // Both sets are ORed, so they collapse into one deduplicated in-list. The
  // filter travels in the request URI and the edge proxy rejects ~24KB, so a
  // client whose samples also matched by reference must not be listed twice.
  const sampleIds = [...new Set([...ids.sampleIds, ...ids.clientSampleIds])]
  if (sampleIds.length > 0) {
    parts.push(`sample_id.in.(${sampleIds.join(',')})`)
  }
  return parts.join(',')
}
