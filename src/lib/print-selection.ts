/**
 * Maps a certificate-row selection onto the two sleeve print routes.
 *
 * These live apart from the page because the two routes treat sub-contracts
 * oppositely, and the difference is invisible in the UI: get it wrong and the
 * operator just sees the wrong number of sheets.
 */

/** The only fields of a certificate row that the mapping needs. */
export interface PrintSelectionCertificate {
  sample_id: string | null
  /** Set on a sub-contract (split) certificate; null on the mother's. */
  sample_contract_id: string | null
}

/** One entry in the POST body of /api/samples/bulk/print-bag-sleeves. */
export interface BagSleeveEntry {
  id: string
  contractId?: string
  includeQrCode: boolean
}

/**
 * One tin label covers a whole lot: the route emits a single label per mother
 * sample and comma-joins every certificate belonging to it — mother first, then
 * each sub-contract by sort_order — into the Cert. field. So a mother plus its
 * ten splits is ONE label, not eleven.
 *
 * Order is first-seen, so the sheet follows the order of the list on screen.
 */
export function certificatesToTinSampleIds(
  certs: PrintSelectionCertificate[],
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const cert of certs) {
    if (!cert.sample_id || seen.has(cert.sample_id)) continue
    seen.add(cert.sample_id)
    ids.push(cert.sample_id)
  }
  return ids
}

/**
 * Bag sleeves are the opposite: one sleeve per certificate. Passing contractId
 * makes the route override tracking number, contract refs, ICO and container
 * from sample_contracts, so a split prints its own references rather than its
 * mother's.
 *
 * Deduplication is on the (lot, contract) pair only — defensive, since the same
 * certificate cannot legitimately appear twice in one selection.
 */
export function certificatesToBagSleeveEntries(
  certs: PrintSelectionCertificate[],
  includeQrCode: boolean,
): BagSleeveEntry[] {
  const entries: BagSleeveEntry[] = []
  const seen = new Set<string>()
  for (const cert of certs) {
    if (!cert.sample_id) continue
    const key = `${cert.sample_id}:${cert.sample_contract_id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      id: cert.sample_id,
      ...(cert.sample_contract_id ? { contractId: cert.sample_contract_id } : {}),
      includeQrCode,
    })
  }
  return entries
}
