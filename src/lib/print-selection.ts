/**
 * Maps a certificate-row selection onto the two sleeve print routes.
 *
 * These live apart from the page because the two routes treat a contract
 * group oppositely, and the difference is invisible in the UI: get it wrong
 * and the operator just sees the wrong number of sheets.
 */
import { labSourceId } from '@/lib/sample-group'

/** The only fields of a certificate row that the mapping needs. */
export interface PrintSelectionCertificate {
  sample_id: string | null
  /**
   * The certificate's own sample with its lab-unit pointer: null on a lab
   * unit, the lab unit's id on a contract sibling. A caller that did not embed
   * the sample gets lab-unit behaviour (one tin per sample id).
   */
  sample?: { lab_source_sample_id: string | null } | null
}

/** One entry in the POST body of /api/samples/bulk/print-bag-sleeves. */
export interface BagSleeveEntry {
  id: string
  includeQrCode: boolean
}

/**
 * One tin label covers a whole physical sample: the route emits a single
 * label per LAB UNIT and comma-joins every certificate in its contract group
 * — lab unit first, then each sibling by contract_ordinal — into the Cert.
 * field. So a lab unit plus its ten siblings is ONE label, not eleven, and a
 * sibling selected on its own still prints its lot's label.
 *
 * The returned ids are lab-unit ids in first-seen order, but that does NOT
 * carry through to the sheet: the route selects with `.in('id', ...)` and no
 * `.order()`, so the order the labels come out in is unspecified.
 */
export function certificatesToTinSampleIds(
  certs: PrintSelectionCertificate[],
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const cert of certs) {
    if (!cert.sample_id) continue
    const labId = labSourceId({ id: cert.sample_id, lab_source_sample_id: cert.sample?.lab_source_sample_id ?? null })
    if (seen.has(labId)) continue
    seen.add(labId)
    ids.push(labId)
  }
  return ids
}

/**
 * Bag sleeves are the opposite: one sleeve per certificate, addressed by the
 * certificate's own sample. A sibling is a sample in its own right and prints
 * its own tracking number, contract refs, ICO and container.
 *
 * Deduplication is on the sample id only — defensive, since the same
 * certificate cannot legitimately appear twice in one selection.
 */
export function certificatesToBagSleeveEntries(
  certs: PrintSelectionCertificate[],
  includeQrCode: boolean,
): BagSleeveEntry[] {
  const entries: BagSleeveEntry[] = []
  const seen = new Set<string>()
  for (const cert of certs) {
    if (!cert.sample_id || seen.has(cert.sample_id)) continue
    seen.add(cert.sample_id)
    entries.push({ id: cert.sample_id, includeQrCode })
  }
  return entries
}
