/**
 * Certificate download/attachment filename helpers.
 *
 * A certificate number like "SAG-011692/26" is not filesystem-safe (the slash).
 * When the buyer/importer contract reference is known we append it after our
 * certificate number so the file is identifiable by both: the filename leads
 * with our certificate number, then the buyer reference when one is present:
 * "<certNumber>_<buyerRef>.pdf".
 */

/** Filesystem-safe form of a certificate number: "SAG-011692/26" -> "SAG-011692_26". */
export function sanitizeCertNumber(certNum: string | null | undefined): string {
  let name = (certNum || 'certificate').replace(/\//g, '_')
  if (name.startsWith('R-')) name = 'r-' + name.slice(2)
  return name
}

/** Filesystem-safe form of a buyer/contract reference (drops slashes/whitespace). */
export function sanitizeReference(ref: string | null | undefined): string {
  return (ref || '').trim().replace(/[\\/\s]+/g, '_')
}

/**
 * Build the certificate filename.
 * With a buyer reference: "<certNumber>_<buyerRef>.pdf" (cert number first).
 * Without: "<certNumber>.pdf".
 */
export function buildCertificateFilename(
  certNumber: string | null | undefined,
  buyerRef?: string | null,
): string {
  const cert = sanitizeCertNumber(certNumber)
  const ref = sanitizeReference(buyerRef)
  return ref ? `${cert}_${ref}.pdf` : `${cert}.pdf`
}

/**
 * The certificate API routes already set Content-Disposition to the authoritative
 * filename — the OFFICIAL certificate number plus the buyer reference (via
 * buildCertificateFilename), resolved server-side from the DB. Client download
 * handlers must use that name rather than reconstructing one from whatever fields
 * happen to be loaded on the page (which can be the internal lab number, or miss
 * the buyer reference). This reads the server's chosen filename, falling back to
 * building it locally only when the header is somehow absent.
 */
export function certificateFilenameFromResponse(
  response: Response,
  fallbackCertNumber?: string | null,
  fallbackBuyerRef?: string | null,
): string {
  const disposition = response.headers.get('Content-Disposition')
  const match = disposition?.match(/filename="([^"]+)"/)
  if (match?.[1]) return match[1]
  return buildCertificateFilename(fallbackCertNumber, fallbackBuyerRef)
}
