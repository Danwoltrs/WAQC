// Aggregates a client's samples for the client page: the rail figures, the
// Samples summary and the Metrics tab all read this one shape, so the numbers
// on the page can never disagree with each other.
//
// Pure: the route fetches every live sample row (paged, no 50-row cap) and
// hands them here.

export interface SummarySampleRow {
  id: string
  status: string | null
  approved_with_comments: boolean | null
  created_at: string
  origin: string | null
  quality_spec_id: string | null
}

export interface MonthBucket {
  /** `YYYY-MM`, in UTC. */
  month: string
  /** Short month name for the axis, e.g. `Nov`. */
  label: string
  approved: number
  withComments: number
  rejected: number
}

export interface ClientSummaryCounts {
  total: number
  /** Approved, including approved with comments. */
  approved: number
  approvedWithComments: number
  rejected: number
  received: number
  inProgress: number
  underReview: number
}

export interface SampleAggregates {
  counts: ClientSummaryCounts
  monthly: MonthBucket[]
  origins: Array<{ origin: string; count: number }>
  /** Keyed by `client_qualities.id` (samples.quality_spec_id). */
  specs: Record<string, { total: number; approved: number; rejected: number }>
}

export interface LatestSample {
  sampleId: string
  /** Certificate number, else the lot's own identifier. Never the SAN. */
  label: string
  contract: string | null
  seller: string | null
  quality: string | null
  origin: string | null
  status: string | null
  approvedWithComments: boolean
  /** Null when not decided yet, or when the viewer may not see send state. */
  sent: boolean | null
  createdAt: string
}

/** What GET /api/clients/[id]/summary returns. */
export interface ClientSummaryResponse extends Omit<SampleAggregates, 'counts'> {
  counts: ClientSummaryCounts & { certificates: number }
  /** Decided samples in the window with no send to anyone; null for non-staff. */
  notSent: number | null
  notSentWindowDays: number
  latest: LatestSample[]
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The last `n` calendar months ending with the month of `now`, oldest first. */
export function lastMonths(now: Date, n = 12): Array<{ month: string; label: string }> {
  const out: Array<{ month: string; label: string }> = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push({ month: monthKey(d), label: MONTH_LABELS[d.getUTCMonth()] })
  }
  return out
}

export function summarizeSamples(rows: SummarySampleRow[], now: Date = new Date()): SampleAggregates {
  const counts: ClientSummaryCounts = {
    total: rows.length, approved: 0, approvedWithComments: 0, rejected: 0,
    received: 0, inProgress: 0, underReview: 0,
  }
  const months = lastMonths(now)
  const byMonth = new Map<string, MonthBucket>(
    months.map((m) => [m.month, { ...m, approved: 0, withComments: 0, rejected: 0 }]),
  )
  const origins = new Map<string, number>()
  const specs: SampleAggregates['specs'] = {}

  for (const r of rows) {
    const approved = r.status === 'approved'
    const rejected = r.status === 'rejected'
    const withComments = approved && r.approved_with_comments === true
    if (approved) counts.approved++
    if (withComments) counts.approvedWithComments++
    if (rejected) counts.rejected++
    if (r.status === 'received') counts.received++
    if (r.status === 'in_progress') counts.inProgress++
    if (r.status === 'under_review') counts.underReview++

    const bucket = byMonth.get(monthKey(new Date(r.created_at)))
    if (bucket) {
      if (withComments) bucket.withComments++
      else if (approved) bucket.approved++
      else if (rejected) bucket.rejected++
    }

    const origin = r.origin?.trim()
    if (origin) origins.set(origin, (origins.get(origin) ?? 0) + 1)

    if (r.quality_spec_id) {
      const s = (specs[r.quality_spec_id] ??= { total: 0, approved: 0, rejected: 0 })
      s.total++
      if (approved) s.approved++
      if (rejected) s.rejected++
    }
  }

  return {
    counts,
    monthly: months.map((m) => byMonth.get(m.month)!),
    origins: [...origins.entries()]
      .map(([origin, count]) => ({ origin, count }))
      .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin)),
    specs,
  }
}

/** Approved share of decided samples (approved + rejected), as a whole percent; null when nothing is decided. */
export function approvalRate(counts: Pick<ClientSummaryCounts, 'approved' | 'rejected'>): number | null {
  const decided = counts.approved + counts.rejected
  return decided > 0 ? Math.round((counts.approved / decided) * 100) : null
}
