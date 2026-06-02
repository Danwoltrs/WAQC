export type ApprovalDecision = 'approved' | 'rejected'

export interface ApprovalTemplateInput {
  decision: ApprovalDecision
  trackingNumber: string
  contractNumber: string | null
  qualityName: string | null
  origin: string | null
  cuppingScore: number | null
  violations: string[] // populated on rejection
}

/** e.g. "Quality Approval — BR-000123/26 — IRO007561 SAX 17/18 GC" */
export function buildApprovalSubject(input: ApprovalTemplateInput): string {
  const word = input.decision === 'approved' ? 'Approval' : 'Rejection'
  const tail = [input.contractNumber, input.qualityName].filter(Boolean).join(' ')
  const base = `Quality ${word} — ${input.trackingNumber}`
  return tail ? `${base} — ${tail}` : base
}

/** Plain-text body. The route wraps this to HTML for Graph. */
export function buildApprovalBody(input: ApprovalTemplateInput): string {
  const verb = input.decision === 'approved' ? 'APPROVED' : 'REJECTED'
  const lines: string[] = ['Dear team,', '']
  lines.push(
    `The quality sample ${input.trackingNumber} has been ${verb} by Wolthers Quality Control.`,
    '',
  )
  if (input.contractNumber) lines.push(`Contract: ${input.contractNumber}`)
  if (input.qualityName) lines.push(`Quality: ${input.qualityName}`)
  if (input.origin) lines.push(`Origin: ${input.origin}`)
  if (input.cuppingScore != null) lines.push(`Cupping score: ${input.cuppingScore}`)
  lines.push(`Certificate no.: ${input.trackingNumber}`)
  if (input.decision === 'rejected' && input.violations.length > 0) {
    lines.push('', 'Reason(s):')
    for (const v of input.violations) lines.push(`- ${v}`)
  }
  lines.push(
    '',
    input.decision === 'approved'
      ? 'The quality certificate is attached.'
      : 'The rejection certificate is attached.',
    '',
    'Best regards,',
    'Wolthers Quality Control',
  )
  return lines.join('\n')
}

/** Minimal text→HTML for the Graph HTML body. Escapes entities, paragraphs on blank lines. */
export function approvalBodyToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split('\n\n')
    .map(
      (p) =>
        `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 10px">${esc(
          p,
        ).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
}
