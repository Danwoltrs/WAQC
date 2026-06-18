import type { ApprovalDecision, ApprovalSide } from './types'

export interface BatchUnitLine {
  containerNr: string | null
  certNumber: string | null
  contractNumber: string | null
  decision: ApprovalDecision
  reason: string | null // cupping/grading comments; surfaced for rejections only
}

export interface BatchTemplateInput {
  greeting: string
  side: ApprovalSide
  lines: BatchUnitLine[]
}

/** "Container ABCU123 · Cert SAN-1/26 · Contract 42250/26" — null parts dropped. */
function formatLine(line: BatchUnitLine): string {
  const parts: string[] = []
  if (line.containerNr) parts.push(`Container ${line.containerNr}`)
  if (line.certNumber) parts.push(`Cert ${line.certNumber}`)
  if (line.contractNumber) parts.push(`Contract ${line.contractNumber}`)
  let text = parts.length ? parts.join(' · ') : '(details unavailable)'
  if (line.decision === 'rejected' && line.reason && line.reason.trim()) {
    text += ` — ${line.reason.trim()}`
  }
  return `- ${text}`
}

export function buildBatchApprovalSubject(input: BatchTemplateInput): string {
  const n = input.lines.length
  const noun = `certificate${n === 1 ? '' : 's'}`
  const approved = input.lines.filter((l) => l.decision === 'approved').length
  const rejected = n - approved
  if (approved > 0 && rejected > 0) {
    return `Wolthers QC — ${n} ${noun} (${approved} approved, ${rejected} rejected)`
  }
  if (rejected > 0) return `Wolthers QC — ${n} rejected ${noun}`
  return `Wolthers QC — ${n} approved ${noun}`
}

export function buildBatchApprovalBody(input: BatchTemplateInput): string {
  const approved = input.lines.filter((l) => l.decision === 'approved')
  const rejected = input.lines.filter((l) => l.decision === 'rejected')

  const out: string[] = [
    `Dear ${input.greeting},`,
    '',
    'Wolthers has completed quality control on the following.',
  ]
  if (approved.length > 0) {
    out.push('', 'Approved:', ...approved.map(formatLine))
  }
  if (rejected.length > 0) {
    out.push('', 'Rejected:', ...rejected.map(formatLine))
  }
  out.push('', 'All certificates are attached.', '', 'Best regards,', 'Wolthers & Associates')
  return out.join('\n')
}