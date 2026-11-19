/** How many certificates one "Print certificates" request may hold. */
export const MAX_PRINT_CERTIFICATES = 50

export type PrintSkipReason = 'not found' | 'deleted' | 'no certificate'

export interface CertificatePrintPlan {
  /** The certificates to print, in the order the samples were asked for. */
  print: Array<{ sampleId: string; certificateId: string }>
  /** Samples left out, each with why. */
  skipped: Array<{ sampleId: string; reason: PrintSkipReason }>
}

/**
 * Pure: which of the requested samples can be printed as a certificate.
 *
 * A sample prints when it exists, is not deleted and has a certificate that is
 * not voided. One sample, one certificate: a contract sibling is its own sample
 * and is printed only when asked for. A sample asked for twice prints once.
 */
export function planCertificatePrint(
  requested: string[],
  samples: Array<{ id: string; deleted_at: string | null }>,
  certificates: Array<{ id: string; sample_id: string | null; voided_at?: string | null }>,
): CertificatePrintPlan {
  const sampleById = new Map(samples.map((s) => [s.id, s]))
  const certBySample = new Map<string, string>()
  for (const c of certificates) {
    if (!c.sample_id || c.voided_at) continue
    if (!certBySample.has(c.sample_id)) certBySample.set(c.sample_id, c.id)
  }

  const plan: CertificatePrintPlan = { print: [], skipped: [] }
  for (const sampleId of [...new Set(requested)]) {
    const sample = sampleById.get(sampleId)
    if (!sample) plan.skipped.push({ sampleId, reason: 'not found' })
    else if (sample.deleted_at) plan.skipped.push({ sampleId, reason: 'deleted' })
    else if (!certBySample.has(sampleId)) plan.skipped.push({ sampleId, reason: 'no certificate' })
    else plan.print.push({ sampleId, certificateId: certBySample.get(sampleId)! })
  }
  return plan
}

/** Why "Print certificate" is unavailable for a selection, or null when it can run. */
export function certificatePrintBlocker(withCertificate: number, selected: number): string | null {
  if (selected === 0) return 'Select at least one sample'
  if (withCertificate === 0) {
    return selected === 1 ? 'This sample has no certificate yet' : 'None of the selected samples has a certificate yet'
  }
  if (withCertificate > MAX_PRINT_CERTIFICATES) return `At most ${MAX_PRINT_CERTIFICATES} certificates can be printed at once`
  return null
}
