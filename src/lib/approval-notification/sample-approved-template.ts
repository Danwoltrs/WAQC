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
  lines.push('', 'Best regards,', 'Wolthers & Associates')
  return lines.join('\n')
}
