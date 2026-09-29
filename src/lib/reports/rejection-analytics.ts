/**
 * Rejection analytics page model. Unlike the weekly report (one worst reason
 * per certificate), this view shows EVERY reason each rejected certificate
 * failed, and the combinations those reasons come in. The reasons, their
 * severity order and the per-certificate classification all come from
 * rejection-reasons.ts; nothing here re-derives them.
 */
import {
  classifyRejection,
  combinationLabel,
  reasonCombinations,
  reasonLabel,
  summarizeAllReasons,
  type ReasonCount,
  type RejectionReasonKey,
} from './rejection-reasons'

/** One certificate in the date range, as the page reads it. */
export interface AnalyticsCertificate {
  id: string
  sampleId: string
  certificateNumber: string
  issuedAt: string
  isRejected: boolean
  violations: string[]
  /** Wolthers contract number, when the sample has one. */
  contract: string | null
  buyerContract: string | null
  client: string | null
  shipper: string | null
  sampleType: string | null
}

export interface DrillRow extends AnalyticsCertificate {
  /** Every reason it failed, worst first; empty when approved. */
  reasons: RejectionReasonKey[]
}

export interface AnalyticsCombination {
  reasons: RejectionReasonKey[]
  label: string
  count: number
}

export interface RejectionAnalytics {
  analyzed: number
  rejected: number
  /** 0-100, rounded. */
  rejectionRate: number
  multiReason: number
  /** Certificates per reason, severity order. A certificate counts under
   *  every reason it failed, so these do not add up to `rejected`. */
  reasons: ReasonCount[]
  /** Exact reason sets, largest first; these DO add up to `rejected`. */
  combinations: AnalyticsCombination[]
  rows: DrillRow[]
}

export function buildRejectionAnalytics(certs: readonly AnalyticsCertificate[]): RejectionAnalytics {
  const rows: DrillRow[] = certs.map(c => ({
    ...c,
    reasons: c.isRejected ? classifyRejection(c.violations).reasons : [],
  }))
  const rejected = rows.filter(r => r.isRejected)
  const lists = rejected.map(r => r.violations)
  return {
    analyzed: rows.length,
    rejected: rejected.length,
    rejectionRate: rows.length > 0 ? Math.round((rejected.length / rows.length) * 100) : 0,
    multiReason: rejected.filter(r => r.reasons.length > 1).length,
    reasons: summarizeAllReasons(lists),
    combinations: reasonCombinations(lists).map(c => ({
      reasons: c.reasons,
      label: combinationLabel(c.reasons),
      count: c.count,
    })),
    rows,
  }
}

export type Selection =
  | { kind: 'analyzed' }
  | { kind: 'rejected' }
  | { kind: 'multi' }
  | { kind: 'reason'; reason: RejectionReasonKey }
  | { kind: 'combination'; reasons: RejectionReasonKey[] }

/** The certificates behind a KPI card, reason bar or combination bar,
 *  newest first. */
export function selectCertificates(a: RejectionAnalytics, sel: Selection): DrillRow[] {
  const pick = (r: DrillRow): boolean => {
    switch (sel.kind) {
      case 'analyzed': return true
      case 'rejected': return r.isRejected
      case 'multi': return r.reasons.length > 1
      case 'reason': return r.reasons.includes(sel.reason)
      case 'combination': return r.isRejected && r.reasons.join('+') === sel.reasons.join('+')
    }
  }
  return a.rows
    .filter(pick)
    .sort((x, y) =>
      y.issuedAt.localeCompare(x.issuedAt)
      || y.certificateNumber.localeCompare(x.certificateNumber, 'en', { numeric: true }))
}

export function selectionTitle(sel: Selection): string {
  switch (sel.kind) {
    case 'analyzed': return 'All certificates analyzed'
    case 'rejected': return 'Rejected certificates'
    case 'multi': return 'Rejected for more than one reason'
    case 'reason': return `Failed on ${reasonLabel(sel.reason)}`
    case 'combination': return combinationLabel(sel.reasons)
  }
}

export function sameSelection(a: Selection | null, b: Selection): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'reason' && b.kind === 'reason') return a.reason === b.reason
  if (a.kind === 'combination' && b.kind === 'combination') return a.reasons.join('+') === b.reasons.join('+')
  return true
}
