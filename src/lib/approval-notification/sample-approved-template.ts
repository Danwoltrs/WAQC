import type { ApprovalDecision } from './types'

export interface SampleApprovedInput {
  decision: ApprovalDecision
  greeting: string
  contractNumber: string | null
  sellerReference: string | null
  buyerReference: string | null
  sampleType: string
  sampleCode: string | null
  trackingNumber: string
  awb: string | null
  courier: string | null
  comments: string | null
  /** 1-based count of rejected PSS on this contract INCLUDING this one
   *  (sys shipment_samples, mirrored by 0749). Null = unknown / not a PSS. */
  rejectionOrdinal?: number | null
}

/** Daniel's cycle rule (2026-09-09): a rejected PSS is always followed by a
 *  request for a new one, and the exporter is told which rejection this is. */
export function newSampleRequestParagraph(contractNumber: string | null, ordinal: number | null): string {
  const first = contractNumber
    ? `Please send a new pre-shipment sample for this contract to the W&A laboratory in Santos, quoting contract ${contractNumber}.`
    : 'Please send a new pre-shipment sample for this contract to the W&A laboratory in Santos.'
  return ordinal && ordinal > 0 ? `${first} This is rejection ${ordinal} for this contract.` : first
}

const isTbi = (s: string | null): boolean =>
  !s || /^t\.?b\.?i\.?$/i.test(s.trim())

export function buildSampleApprovedSubject(input: SampleApprovedInput): string {
  const verb = input.decision === 'approved' ? 'approved' : 'rejected'
  const head = `Sample ${verb} · ${input.contractNumber ?? input.trackingNumber}`
  return input.sampleCode ? `${head} · ${input.sampleCode}` : head
}

export function buildSampleApprovedBody(input: SampleApprovedInput): string {
  const verb = input.decision === 'approved' ? 'approved' : 'rejected'
  const sampleTypeLabel = input.sampleType.toUpperCase().replace(/_/g, ' ')
  const sampleLabel = input.sampleCode ?? input.trackingNumber ?? '—'
  const lines: string[] = [
    `Dear ${input.greeting},`,
    '',
    `Wolthers has ${verb} the following sample.`,
    '',
  ]
  if (input.contractNumber) lines.push(`Contract: ${input.contractNumber}`)
  if (!isTbi(input.sellerReference)) lines.push(`Seller ref: ${input.sellerReference}`)
  if (!isTbi(input.buyerReference)) lines.push(`Buyer ref: ${input.buyerReference}`)
  lines.push(`Sample: ${sampleTypeLabel} · ${sampleLabel}`)
  if (input.awb) {
    lines.push(`AWB: ${input.awb}${input.courier ? ` · ${input.courier}` : ''}`)
  }
  if (input.comments && input.comments.trim()) {
    lines.push('', 'Comments:', input.comments.trim())
  }
  if (input.decision === 'rejected' && input.sampleType.toLowerCase() === 'pss' && input.contractNumber) {
    lines.push('', newSampleRequestParagraph(input.contractNumber, input.rejectionOrdinal ?? null))
  }
  lines.push('', 'Best regards,', 'Wolthers & Associates')
  return lines.join('\n')
}
