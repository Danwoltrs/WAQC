import { describe, it, expect } from 'vitest'
import { summarizeSamples, lastMonths, approvalRate, type SummarySampleRow } from './client-summary'

const row = (p: Partial<SummarySampleRow>): SummarySampleRow => ({
  id: Math.random().toString(36).slice(2),
  status: 'approved',
  approved_with_comments: false,
  created_at: '2026-11-05T10:00:00Z',
  origin: 'Brazil',
  quality_spec_id: null,
  ...p,
})

const NOW = new Date('2026-11-09T12:00:00Z')

describe('lastMonths', () => {
  it('returns 12 months ending with the current one, oldest first', () => {
    const m = lastMonths(NOW)
    expect(m).toHaveLength(12)
    expect(m[0]).toEqual({ month: '2025-12', label: 'Dec' })
    expect(m[11]).toEqual({ month: '2026-11', label: 'Nov' })
  })
})

describe('summarizeSamples', () => {
  it('counts every row, not a capped page', () => {
    const rows = Array.from({ length: 180 }, () => row({}))
    expect(summarizeSamples(rows, NOW).counts.total).toBe(180)
  })

  it('counts approved with comments inside approved, and once in its own bucket', () => {
    const s = summarizeSamples([
      row({ status: 'approved' }),
      row({ status: 'approved', approved_with_comments: true }),
      row({ status: 'rejected' }),
      row({ status: 'received' }),
      row({ status: 'in_progress' }),
      row({ status: 'under_review' }),
    ], NOW)
    expect(s.counts).toMatchObject({
      total: 6, approved: 2, approvedWithComments: 1, rejected: 1, received: 1, inProgress: 1, underReview: 1,
    })
    const nov = s.monthly.find((m) => m.month === '2026-11')!
    expect(nov).toMatchObject({ approved: 1, withComments: 1, rejected: 1 })
  })

  it('ignores approved_with_comments on a sample that is not approved', () => {
    const s = summarizeSamples([row({ status: 'rejected', approved_with_comments: true })], NOW)
    expect(s.counts.approvedWithComments).toBe(0)
    expect(s.monthly[11]).toMatchObject({ withComments: 0, rejected: 1 })
  })

  it('leaves samples older than 12 months out of the monthly chart but in the totals', () => {
    const s = summarizeSamples([row({ created_at: '2024-01-10T00:00:00Z' })], NOW)
    expect(s.counts.approved).toBe(1)
    expect(s.monthly.reduce((n, m) => n + m.approved, 0)).toBe(0)
  })

  it('groups origins (trimmed) and specs', () => {
    const s = summarizeSamples([
      row({ origin: 'Brazil', quality_spec_id: 'q1' }),
      row({ origin: ' Brazil ', quality_spec_id: 'q1', status: 'rejected' }),
      row({ origin: 'Colombia', quality_spec_id: 'q2' }),
      row({ origin: null }),
    ], NOW)
    expect(s.origins).toEqual([{ origin: 'Brazil', count: 2 }, { origin: 'Colombia', count: 1 }])
    expect(s.specs.q1).toEqual({ total: 2, approved: 1, rejected: 1 })
    expect(s.specs.q2).toEqual({ total: 1, approved: 1, rejected: 0 })
  })
})

describe('approvalRate', () => {
  it('is approved over decided samples', () => {
    expect(approvalRate({ approved: 41, rejected: 7 })).toBe(85)
  })
  it('is null when nothing is decided', () => {
    expect(approvalRate({ approved: 0, rejected: 0 })).toBeNull()
  })
})
