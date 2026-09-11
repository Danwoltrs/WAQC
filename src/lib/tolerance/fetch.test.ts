import { describe, expect, it } from 'vitest'
import { fetchToleranceApproval, fetchIssuedValues } from './fetch'

/**
 * Records the column list passed to `.select(...)` on the decision table, so a
 * test can prove which columns each reader actually requested rather than
 * merely that it returned data. A fake whose chain methods ignore their
 * arguments (`chain = () => q`) cannot fail when a select is later widened by
 * mistake — this repo has already shipped that exact class of bug once (a fake
 * accepting any column name hid a wrong column name in cupping_sessions for
 * nine months). `labSourceId` is always passed explicitly below, so
 * `resolveLabSourceId` never runs.
 *
 * `samples` is a second table now: both readers first check that the lot is
 * actually flagged `approved_with_comments`, so the fake has to answer for it.
 * `flag` is what that lookup returns — a boolean, or an object to model the
 * error cases (a missing column, a missing row).
 */
type FlagAnswer =
  | boolean
  | { data: Record<string, unknown> | null; error: { message: string } | null }

function db(rows: unknown[], selects: string[][] = [], flag: FlagAnswer = true) {
  const approvals: Record<string, unknown> = {}
  approvals.select = (...args: string[]) => { selects.push(args); return approvals }
  approvals.eq = () => approvals
  approvals.order = () => approvals
  approvals.limit = () => Promise.resolve({ data: rows, error: null })

  const flagResult =
    typeof flag === 'boolean' ? { data: { approved_with_comments: flag }, error: null } : flag
  const samples: Record<string, unknown> = {}
  samples.select = () => samples
  samples.eq = () => samples
  samples.maybeSingle = () => Promise.resolve(flagResult)

  return { from: (table: string) => (table === 'samples' ? samples : approvals) } as never
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

/**
 * A decision row must stop applying the moment the lot stops being an
 * approved-with-comments lot.
 *
 * Both readers used to key ONLY on a row existing for the lab-source sample.
 * Nothing clears that row, so a lot approved with comments (issued 30.0%),
 * re-graded after the lab spots a sieving error to a genuinely in-spec 34%,
 * and then approved normally would still print 30.0% on the PDF and the QR
 * page forever. The same gate also neutralises the accepted Task-10 residual:
 * a failed compensating delete leaves an orphaned row behind, and with the
 * flag false that row can no longer shadow a later ordinary approval.
 */
describe('a decision only applies while the sample is actually flagged', () => {
  const row = {
    issued_values: { screen_percentages: { '18': 30 }, defects: null },
    metrics: [{ key: 'screen_18_min' }],
    comments: ['Melhorar peneira 18.'],
    request_additional_sample: true,
    decided_at: '2026-09-10T12:00:00Z',
  }

  it('both readers return null when approved_with_comments is false', async () => {
    expect(await fetchToleranceApproval(db([row], [], false), 'lab-1', 'lab-1')).toBeNull()
    expect(await fetchIssuedValues(db([row], [], false), 'lab-1', 'lab-1')).toBeNull()
  })

  it('both readers still return the decision when the flag is true', async () => {
    expect(await fetchToleranceApproval(db([row], [], true), 'lab-1', 'lab-1')).not.toBeNull()
    expect(await fetchIssuedValues(db([row], [], true), 'lab-1', 'lab-1')).not.toBeNull()
  })

  it('degrades to null — never throws — when the column does not exist yet', async () => {
    // The migration adding `approved_with_comments` is unapplied everywhere
    // today, so PostgREST answers 42703. That must read as "no decision",
    // exactly as a missing table does.
    const missingColumn = { data: null, error: { message: 'column samples.approved_with_comments does not exist' } }
    await expect(fetchToleranceApproval(db([row], [], missingColumn), 'lab-1', 'lab-1')).resolves.toBeNull()
    await expect(fetchIssuedValues(db([row], [], missingColumn), 'lab-1', 'lab-1')).resolves.toBeNull()
  })

  it('degrades to null when the sample row itself is gone', async () => {
    const noRow = { data: null, error: null }
    expect(await fetchToleranceApproval(db([row], [], noRow), 'lab-1', 'lab-1')).toBeNull()
    expect(await fetchIssuedValues(db([row], [], noRow), 'lab-1', 'lab-1')).toBeNull()
  })
})
