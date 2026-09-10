import { describe, expect, it } from 'vitest'
import { fetchToleranceApproval } from './fetch'

function db(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  const chain = () => q
  q.select = chain
  q.eq = chain
  q.order = chain
  q.limit = () => Promise.resolve({ data: rows, error: null })
  return {
    from: () => q,
    // resolveLabSourceId reads samples; return the id unchanged.
    _samples: rows,
  } as never
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
})
