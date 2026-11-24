import type { ApprovalDecision, ApprovalSide } from './types'
import { shownCertificateNumber } from '@/lib/sample-reference'
import { carriesVerdict } from '@/lib/sample-verdict'

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
  /**
   * `samples.sample_type`. A type sample is measured, never approved or
   * rejected: it is listed on its own and left out of both counts.
   */
  sampleType?: string | null
}

const isMeasuredOnly = (l: BatchUnitLine): boolean => !carriesVerdict(l.sampleType)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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

/** "Container ABCU123 · Cert BR-036991/26 · Ref 42250/26" — null parts dropped. */
function formatLine(line: BatchUnitLine): string {
  const parts: string[] = []
  if (line.containerNr) parts.push(`Container ${line.containerNr}`)
  // A legacy certificate issued under the SAN- lab number is never quoted.
  const cert = shownCertificateNumber(line.certNumber)
  if (cert) parts.push(`Cert ${cert}`)
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
  const judged = lines.filter((l) => !isMeasuredOnly(l))
  const measured = n - judged.length
  const approved = judged.filter((l) => l.decision === 'approved').length
  const rejected = judged.length - approved
  const rate = judged.length > 0 ? Math.round((approved / judged.length) * 100) : 0
  const dates = lines.map((l) => l.date).filter((d): d is string => !!d).sort()
  const first = fmtDate(dates[0] ?? null)
  const last = fmtDate(dates[dates.length - 1] ?? null)
  const segs: string[] = [`${n} certificate${n === 1 ? '' : 's'}`]
  if (first && last) segs.push(first === last ? first : `${first} – ${last}`)
  const counts: string[] = []
  if (approved > 0) counts.push(`${approved} approved`)
  if (rejected > 0) counts.push(`${rejected} rejected`)
  if (judged.length > 0) segs.push(`${counts.join(', ')} (${rate}% approved)`)
  if (measured > 0) segs.push(plural(measured, 'type sample'))
  return segs.join(' · ')
}

export function buildBatchApprovalSubject(input: BatchTemplateInput): string {
  const n = input.lines.length
  const noun = `certificate${n === 1 ? '' : 's'}`
  const judged = input.lines.filter((l) => !isMeasuredOnly(l))
  // Only type samples: there is no verdict to announce.
  if (judged.length === 0 && n > 0) return `Wolthers QC — ${n} type sample ${noun}`
  const approved = judged.filter((l) => l.decision === 'approved').length
  const rejected = judged.length - approved
  // Type samples among them: the counts would not add up to n, so name none.
  if (judged.length < n) return `Wolthers QC — ${n} ${noun}`
  if (approved > 0 && rejected > 0) {
    return `Wolthers QC — ${n} ${noun} (${approved} approved, ${rejected} rejected)`
  }
  if (rejected > 0) return `Wolthers QC — ${n} rejected ${noun}`
  return `Wolthers QC — ${n} approved ${noun}`
}

export function buildBatchApprovalBody(input: BatchTemplateInput): string {
  const approved = input.lines.filter((l) => !isMeasuredOnly(l) && l.decision === 'approved')
  const rejected = input.lines.filter((l) => !isMeasuredOnly(l) && l.decision === 'rejected')
  const measured = input.lines.filter(isMeasuredOnly)

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
    // Cycle rule: a rejected PSS is always followed by a request for a new one.
    out.push('', 'For each rejected pre-shipment sample above, please send a new sample to the W&A laboratory in Santos, quoting the contract number.')
  }
  if (measured.length > 0) {
    out.push(
      '',
      'Type samples (measured against the quality, not approved or rejected):',
      ...measured.map((l) => `${formatLine({ ...l, decision: 'approved' })} — ${l.decision === 'rejected' ? 'out of range' : 'in range'}`),
    )
  }
  out.push('', 'All certificates are attached.', '', 'Best regards,', 'Wolthers & Associates')
  return out.join('\n')
}
