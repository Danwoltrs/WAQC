/**
 * Build the PostgREST `.or()` filter for a certificate search.
 *
 * Matching is CERTIFICATE-granular: a certificate is returned only when the certificate
 * itself is for the matched contract/reference — not merely because it shares a mother
 * sample with some other matching certificate. So a contract-number search returns that
 * contract's certificates across however many samples (incl. earlier/rejected ones), but
 * never a sibling sub-contract certificate of the same mother sample that carries a
 * DIFFERENT contract number.
 *
 *  - Mother certificate (sample_contract_id IS NULL): matches when the SAMPLE's own
 *    reference fields matched the query.
 *  - Sub-contract certificate: matches when THAT specific sub-contract's fields matched.
 *  - Company-name match stays broad (every certificate for the client's samples) — a name
 *    search is not a per-contract lookup.
 */
export interface CertSearchIdSets {
  /** Sample ids whose OWN fields matched → their mother certificates. */
  motherSampleIds: string[]
  /** sample_contracts ids that matched → those specific sub-contract certificates. */
  subContractIds: string[]
  /** Sample ids belonging to a name-matched client → all of their certificates. */
  clientSampleIds: string[]
}

/**
 * @param like a PostgREST ILIKE pattern already wrapped in `%…%` and sanitized of the
 *   `.or()` delimiters (`,()%_`) — see sanitizeOrTerm.
 */
export function buildCertificateSearchOr(like: string, ids: CertSearchIdSets): string {
  const parts = [`certificate_number.ilike.${like}`, `issued_to.ilike.${like}`]
  if (ids.motherSampleIds.length > 0) {
    parts.push(`and(sample_contract_id.is.null,sample_id.in.(${ids.motherSampleIds.join(',')}))`)
  }
  if (ids.subContractIds.length > 0) {
    parts.push(`sample_contract_id.in.(${ids.subContractIds.join(',')})`)
  }
  if (ids.clientSampleIds.length > 0) {
    parts.push(`sample_id.in.(${ids.clientSampleIds.join(',')})`)
  }
  return parts.join(',')
}
