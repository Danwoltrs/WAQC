/**
 * Why a certificate was rejected — the one place that knows the reasons and
 * their severity. The period report counts each rejected certificate once,
 * under its WORST reason, so the reasons add up to the rejections; the
 * rejection analytics page shows EVERY reason each certificate failed and the
 * combinations they come in. Both read this module so they cannot drift.
 *
 * The input is `certificates.compliance_violations`, the sentences
 * `compliance-criteria.ts` writes (e.g. `Quakers: 12 exceeds maximum (8)`).
 * Pure and dependency-free: the analytics page imports it in the browser.
 */

export type RejectionReasonKey =
  | 'cup_fault'
  | 'primary'
  | 'secondary'
  | 'cup_taint'
  | 'quakers'
  | 'screen'
  | 'cup_score'
  | 'moisture'
  | 'cupper'
  | 'override'
  | 'other'

export interface RejectionReasonDef {
  key: RejectionReasonKey
  label: string
  /** Compact label for chart axes and combination names. */
  short: string
}

/**
 * Worst first. The first six are Wolthers' severity order. The rest sit after
 * them so every rejected certificate still lands on a named row:
 *   - cup score: a cup attribute or CVA score below (or above) the spec — not
 *     a cup FAULT, so Cup (fault) matches the faults the cuppers recorded;
 *   - cupper's decision: a spec with no rules, rejected by hand at cupping;
 *   - status override: staff switched an approved certificate to rejected,
 *     which records no criterion (the fetchers mark it, rejectionViolations);
 *   - not recorded: a rejection with nothing on it at all.
 */
export const REJECTION_REASONS: readonly RejectionReasonDef[] = [
  { key: 'cup_fault', label: 'Cup (fault)', short: 'Cup fault' },
  { key: 'primary', label: 'Primary defects', short: 'Primary' },
  { key: 'secondary', label: 'Secondary defects', short: 'Secondary' },
  { key: 'cup_taint', label: 'Cup (taint)', short: 'Cup taint' },
  { key: 'quakers', label: 'Quakers', short: 'Quakers' },
  { key: 'screen', label: 'Screen size', short: 'Screen' },
  { key: 'cup_score', label: 'Cup score', short: 'Cup score' },
  { key: 'moisture', label: 'Moisture', short: 'Moisture' },
  { key: 'cupper', label: "Cupper's decision", short: 'Cupper' },
  { key: 'override', label: 'Status override', short: 'Override' },
  { key: 'other', label: 'Not recorded', short: 'Not recorded' },
]

const SEVERITY = new Map(REJECTION_REASONS.map((r, i) => [r.key, i]))
const DEF = new Map(REJECTION_REASONS.map(r => [r.key, r]))

export const reasonLabel = (key: RejectionReasonKey): string => DEF.get(key)!.label
export const reasonShort = (key: RejectionReasonKey): string => DEF.get(key)!.short

const bySeverity = (a: RejectionReasonKey, b: RejectionReasonKey) => SEVERITY.get(a)! - SEVERITY.get(b)!

/**
 * The reason(s) one violation line stands for. A zero-tolerance line names
 * taints and faults together, so it can stand for both.
 *
 * "Total defects" is a secondary-defect story (the primaries have their own
 * line when they are the cause).
 */
export function reasonsOfViolation(v: string): RejectionReasonKey[] {
  if (typeof v !== 'string') return ['other']
  const s = v.trim()

  const zero = s.match(/^Zero tolerance:\s*(\d+)\s*taint\(s\)\s*and\s*(\d+)\s*fault/i)
  if (zero) {
    const out: RejectionReasonKey[] = []
    if (Number(zero[2]) > 0) out.push('cup_fault')
    if (Number(zero[1]) > 0) out.push('cup_taint')
    return out.length > 0 ? out : ['cup_fault']
  }

  if (/^Fault\s+"/i.test(s) || /^Cupping\s+faults/i.test(s) || /^Cupping\s+defects/i.test(s)) return ['cup_fault']
  if (/^Taint\s+"/i.test(s) || /^Cupping\s+taints/i.test(s)) return ['cup_taint']
  if (/^Primary defects:/i.test(s)) return ['primary']
  if (/^(Secondary|Total) defects:/i.test(s)) return ['secondary']
  if (/^Quakers:/i.test(s)) return ['quakers']
  // Certificates issued before the compliance fix read "Screen Screen 16: …".
  if (/^Screen\s+(Screen\s+)?[A-Za-z0-9]+:/i.test(s)) return ['screen']
  if (/^Moisture:/i.test(s)) return ['moisture']
  if (/^CVA score\b/i.test(s)) return ['cup_score']
  if (/^[A-Za-z][A-Za-z ]*?:\s+[\d.]+\s+is\s+(below minimum|above maximum)/i.test(s)) return ['cup_score']
  if (/^Manual rejection by cupper/i.test(s)) return ['cupper']
  if (s === STATUS_OVERRIDE_VIOLATION) return ['override']
  return ['other']
}

/** What the fetchers stamp on a rejected certificate that carries no
 *  violation but an override comment (certificates/[id]/override). */
export const STATUS_OVERRIDE_VIOLATION = 'Status override'

/**
 * The violation list a certificate is classified by. Only strings count; a
 * rejection set by the status override records none, so it is named from the
 * override comment instead of falling to "not recorded".
 */
export function rejectionViolations(
  isRejected: boolean,
  violations: unknown,
  overrideComment: string | null | undefined,
): string[] {
  if (!isRejected) return []
  const list = Array.isArray(violations) ? violations.filter((v): v is string => typeof v === 'string') : []
  if (list.length === 0 && overrideComment?.trim()) return [STATUS_OVERRIDE_VIOLATION]
  return list
}

export interface CertificateRejection {
  /** Every reason the certificate failed, once each, worst first. */
  reasons: RejectionReasonKey[]
  worst: RejectionReasonKey
}

export function classifyRejection(violations: readonly string[] | null | undefined): CertificateRejection {
  const set = new Set<RejectionReasonKey>()
  for (const v of violations ?? []) for (const k of reasonsOfViolation(v)) set.add(k)
  // An unrecognised line next to a recognised reason adds nothing to read.
  if (set.size > 1) set.delete('other')
  if (set.size === 0) set.add('other')
  const reasons = [...set].sort(bySeverity)
  return { reasons, worst: reasons[0] }
}

export interface ReasonCount {
  key: RejectionReasonKey
  label: string
  count: number
}

/** Present reasons in severity order, from a key → count map. */
function orderedCounts(counts: Map<RejectionReasonKey, number>): ReasonCount[] {
  return REJECTION_REASONS
    .filter(r => (counts.get(r.key) ?? 0) > 0)
    .map(r => ({ key: r.key, label: r.label, count: counts.get(r.key)! }))
}

export interface WorstReasonSummary {
  /** One count per reason; each certificate counted once, under its worst. */
  rows: ReasonCount[]
  /** Rejected certificates summarised (= the sum of `rows`). */
  total: number
  /** Certificates that failed on more than one reason. */
  multiReason: number
}

/** Takes one violation list per REJECTED certificate. */
export function summarizeWorstReasons(
  certificates: ReadonlyArray<readonly string[] | null | undefined>,
): WorstReasonSummary {
  const counts = new Map<RejectionReasonKey, number>()
  let multiReason = 0
  for (const v of certificates) {
    const c = classifyRejection(v)
    counts.set(c.worst, (counts.get(c.worst) ?? 0) + 1)
    if (c.reasons.length > 1) multiReason += 1
  }
  return { rows: orderedCounts(counts), total: certificates.length, multiReason }
}

/** How many certificates failed each reason. A certificate counts under every
 *  reason it failed, so these do NOT add up to the rejections. */
export function summarizeAllReasons(
  certificates: ReadonlyArray<readonly string[] | null | undefined>,
): ReasonCount[] {
  const counts = new Map<RejectionReasonKey, number>()
  for (const v of certificates) {
    for (const k of classifyRejection(v).reasons) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return orderedCounts(counts)
}

export interface ReasonCombination {
  /** The exact set of reasons, worst first. */
  reasons: RejectionReasonKey[]
  count: number
  /** Positions of the certificates in the input list. */
  indices: number[]
}

/**
 * Certificates grouped by their EXACT set of reasons (UpSet intersections):
 * "Quakers only", "Quakers + Screen size", … Largest first; ties go to the
 * set whose worst reason is worse.
 */
export function reasonCombinations(
  certificates: ReadonlyArray<readonly string[] | null | undefined>,
): ReasonCombination[] {
  const map = new Map<string, ReasonCombination>()
  certificates.forEach((v, i) => {
    const { reasons } = classifyRejection(v)
    const id = reasons.join('+')
    const combo = map.get(id) ?? { reasons, count: 0, indices: [] }
    combo.count += 1
    combo.indices.push(i)
    map.set(id, combo)
  })
  return [...map.values()].sort((a, b) =>
    b.count - a.count
    || bySeverity(a.reasons[0], b.reasons[0])
    || a.reasons.length - b.reasons.length,
  )
}

/** "Quakers only", "Primary + Secondary + Quakers". */
export function combinationLabel(reasons: readonly RejectionReasonKey[]): string {
  if (reasons.length === 1) return `${reasonShort(reasons[0])} only`
  return reasons.map(reasonShort).join(' + ')
}
