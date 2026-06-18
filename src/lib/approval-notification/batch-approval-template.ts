import type { ApprovalDecision, ApprovalSide } from './types'

export interface BatchUnitLine {
  containerNr: string | null
  certNumber: string | null
  contractNumber: string | null
  // The recipient's own reference for this contract (buyer_reference for a buyer
  // email, seller_reference for a seller email). Shown instead of our internal
  // contract number; falls back to contractNumber when absent.
  reference: string | null
  // Certificate issue date (ISO) — drives the date-range summary line.
  date: string | null
  decision: ApprovalDecision
  reason: string | null // cupping/grading comments; surfaced for rejections only
}

export interface BatchTemplateInput {
  greeting: string
  side: ApprovalSide
  lines: BatchUnitLine[]
}

const fmtDate = (iso: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** "Container ABCU123 · Cert SAN-1/26 · Ref 42250/26" — null parts dropped. */
function formatLine(line: BatchUnitLine): string {
  const parts: string[] = []
  if (line.containerNr) parts.push(`Container ${line.containerNr}`)
  if (line.certNumber) parts.push(`Cert ${line.certNumber}`)
  const ref = line.reference ?? line.contractNumber
  if (ref) parts.push(`Ref ${ref}`)
  let text = parts.length ? parts.join(' · ') : '(details unavailable)'
  if (line.decision === 'rejected' && line.reason && line.reason.trim()) {
    text += ` — ${line.reason.trim()}`
  }
  return `- ${text}`
}

/** "5 certificates · 12 Jun 2026 – 18 Jun 2026 · 4 approved, 1 rejected (80% approved)" */
function buildSummary(lines: BatchUnitLine[]): string {
  const n = lines.length
  const approved = lines.filter((l) => l.decision === 'approved').length
  const rejected = n - approved
  const rate = n > 0 ? Math.round((approved / n) * 100) : 0
  const dates = lines.map((l) => l.date).filter((d): d is string => !!d).sort()
  const first = fmtDate(dates[0] ?? null)
  const last = fmtDate(dates[dates.length - 1] ?? null)
  const segs: string[] = [`${n} certificate${n === 1 ? '' : 's'}`]
  if (first && last) segs.push(first === last ? first : `${first} – ${last}`)
  const counts: string[] = []
  if (approved > 0) counts.push(`${approved} approved`)
  if (rejected > 0) counts.push(`${rejected} rejected`)
  segs.push(`${counts.join(', ')} (${rate}% approved)`)
  return segs.join(' · ')
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
    '',
    buildSummary(input.lines),
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
