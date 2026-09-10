import { describe, expect, it } from 'vitest'
import { fetchToleranceApproval, fetchIssuedValues } from './fetch'

/**
 * Records the column list passed to `.select(...)` for the one table both
 * readers query, so a test can prove which columns each reader actually
 * requested rather than merely that it returned data. A fake whose chain
 * methods ignore their arguments (`chain = () => q`) cannot fail when a
 * select is later widened by mistake — this repo has already shipped that
 * exact class of bug once (a fake accepting any column name hid a wrong
 * column name in cupping_sessions for nine months). `labSourceId` is always
 * passed explicitly below, so `resolveLabSourceId` (which would query
 * `samples`) is never exercised by these tests.
 */
function db(rows: unknown[], selects: string[][] = []) {
  const q: Record<string, unknown> = {}
  q.select = (...args: string[]) => { selects.push(args); return q }
  q.eq = () => q
  q.order = () => q
  q.limit = () => Promise.resolve({ data: rows, error: null })
  return { from: () => q } as never
}

describe('fetchToleranceApproval', () => {
  it('returns null when the lot has no decision', async () => {
    const r = await fetchToleranceApproval(db([]), 'lab-1', 'lab-1')
    expect(r).toBeNull()
  })

  it('returns the most recent decision', async () => {
    const r = await fetchToleranceApproval(
      db([
        {
          issued_values: { screen_percentages: { '18': 30 }, defects: null },
          metrics: [], comments: [], request_additional_sample: true,
          decided_at: '2026-09-10T12:00:00Z',
        },
      ]),
      'lab-1',
      'lab-1',
    )
    expect(r?.issued_values.screen_percentages).toEqual({ '18': 30 })
    expect(r?.request_additional_sample).toBe(true)
  })

  it('requests comments and metrics — the internal reader is allowed to see them', async () => {
    const selects: string[][] = []
    await fetchToleranceApproval(db([], selects), 'lab-1', 'lab-1')
    expect(selects).toHaveLength(1)
    const columns = selects[0].join(',')
    expect(columns).toContain('comments')
    expect(columns).toContain('metrics')
  })
})

describe('fetchIssuedValues', () => {
  it('requests ONLY issued_values — never comments or metrics', async () => {
    const selects: string[][] = []
    await fetchIssuedValues(db([], selects), 'lab-1', 'lab-1')
    expect(selects).toHaveLength(1)
    const columns = selects[0].join(',')
    expect(columns).toBe('issued_values')
    expect(columns).not.toContain('comments')
    expect(columns).not.toContain('metrics')
  })

  it('returns the issued values with no comments/metrics leaking through, even if the row carries them', async () => {
    const r = await fetchIssuedValues(
      db([
        {
          issued_values: { screen_percentages: { '16': 80 }, defects: null },
          // A row that (incorrectly) also carries seller-only fields, as it
          // would if fetchIssuedValues's select were ever widened by mistake.
          comments: ['fix your sorting before the next shipment'],
          metrics: [{ key: 'screen_16', actual: 70, limit: 80 }],
        },
      ]),
      'lab-1',
      'lab-1',
    )
    expect(r).toEqual({ screen_percentages: { '16': 80 }, defects: null })
    expect(r).not.toHaveProperty('comments')
    expect(r).not.toHaveProperty('metrics')
  })
})
