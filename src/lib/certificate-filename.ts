/**
 * Certificate download/attachment filename helpers.
 *
 * A certificate number like "SAG-011692/26" is not filesystem-safe (the slash).
 * Some buyers (e.g. Ahold) ask for the file to carry THEIR contract reference
 * alongside our certificate number, so the filename leads with the buyer
 * reference when one is present: "<buyerRef>_<certNumber>.pdf".
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
 * With a buyer reference: "<buyerRef>_<certNumber>.pdf" (buyer ref first).
 * Without: "<certNumber>.pdf".
 */
export function buildCertificateFilename(
  certNumber: string | null | undefined,
  buyerRef?: string | null,
): string {
  const cert = sanitizeCertNumber(certNumber)
  const ref = sanitizeReference(buyerRef)
  return ref ? `${ref}_${cert}.pdf` : `${cert}.pdf`
}
