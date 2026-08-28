import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the leaf collaborators so we can assert the ORCHESTRATION:
// writeDecisionToShipmentSamples must fan a decision out to the lab unit's
// contract AND every contract sibling in the group, each with the SAME result.
vi.mock('./contract-resolver', () => ({
  // Resolve every contract by its wolthers number → a distinct contract id.
  resolveSampleContract: vi.fn(async (_admin: unknown, keys: { wolthers_contract_nr: string | null }) => {
    const nr = keys.wolthers_contract_nr
    return nr
      ? { contractId: `C-${nr}`, buyerId: null, sellerId: null, buyerReference: null, sellerReference: null, contractNumber: nr }
      : null
  }),
}))
vi.mock('./shipment-sample-writeback', () => ({
  applyShipmentSampleApproval: vi.fn(async () => 'row-id'),
}))
vi.mock('./quality-summary', () => ({
  fetchQualitySampleSummaries: vi.fn(async () => new Map([['s1', { reason: 'Defects: 45 (max 30)' }]])),
}))

import { writeDecisionToShipmentSamples } from './sys-decision-writeback'
import { applyShipmentSampleApproval } from './shipment-sample-writeback'
import { fetchQualitySampleSummaries } from './quality-summary'

const applyMock = vi.mocked(applyShipmentSampleApproval)
const summariesMock = vi.mocked(fetchQualitySampleSummaries)

type Row = Record<string, unknown>

/**
 * Minimal awaitable Supabase stub over seeded tables. Serves the reads the
 * write-back makes: the sample by id, the profile, the group via fetchGroup's
 * `.or('id.eq.X,lab_source_sample_id.eq.X')`, and certificates `.in(...)`.
 */
function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? []
      const preds: Array<(r: Row) => boolean> = []
      const matching = () => rows.filter((r) => preds.every((p) => p(r)))
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        order: self,
        limit: self,
        eq: (col: string, v: unknown) => { preds.push((r) => r[col] === v); return chain },
        is: (col: string, v: unknown) => { preds.push((r) => (r[col] ?? null) === v); return chain },
        in: (col: string, vals: unknown[]) => { preds.push((r) => vals.includes(r[col])); return chain },
        // PostgREST `or`: "id.eq.X,lab_source_sample_id.eq.X" — the only shape fetchGroup uses.
        or: (expr: string) => {
          const alts = expr.split(',').map((t) => { const [col, v] = t.split('.eq.'); return { col, v } })
          preds.push((r) => alts.some((a) => r[a.col] === a.v))
          return chain
        },
        single: async () => ({ data: matching()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: matching(), error: null }).then(resolve, reject),
      })
      return chain
    },
  }
}

/** The lab unit: cupped, graded, carries the group's decision. */
const LAB_UNIT: Row = {
  id: 's1',
  tracking_number: 'SAN-00081/26',
  status: 'rejected',
  contract_id: null,
  wolthers_contract_nr: '42067/26',
  sample_type: 'pss',
  lab_source_sample_id: null,
  contract_ordinal: 1,
  created_at: '2026-08-01T10:00:00Z',
}
/** A contract sibling: its own contract, its own internal number, lab data on s1. */
const sibling = (id: string, wolthersNr: string, ordinal: number): Row => ({
  ...LAB_UNIT,
  id,
  tracking_number: `SAN-0070${ordinal}/26`,
  wolthers_contract_nr: wolthersNr,
  lab_source_sample_id: 's1',
  contract_ordinal: ordinal,
})
const PROFILE = { full_name: 'Anderson' }

beforeEach(() => {
  applyMock.mockClear()
  summariesMock.mockClear()
})

describe('writeDecisionToShipmentSamples — every contract in the group gets the same result on sys', () => {
  it('writes the decision to the lab unit contract AND every contract sibling', async () => {
    const admin = fakeAdmin({
      samples: [LAB_UNIT, sibling('s2', '42068/26', 2), sibling('s3', '42274/26', 3)],
      profiles: [PROFILE],
      certificates: [
        { sample_id: 's2', certificate_number: 'R-SAK-011717/26' },
        { sample_id: 's3', certificate_number: 'R-SAK-011718/26' },
      ],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    // One save per contract: lab unit + 2 siblings = 3.
    expect(applyMock).toHaveBeenCalledTimes(3)
    const byContract = Object.fromEntries(applyMock.mock.calls.map(([, a]) => [a.contractId, a]))

    // The lab unit keeps its tracking number; a sibling claims its sys rows by
    // its CERTIFICATE number (what sample_contracts.tracking_number used to
    // hold), "R-" stripped so the ref is stable across approve/reject.
    expect(byContract['C-42067/26'].waqcRef).toBe('SAN-00081/26')
    expect(byContract['C-42068/26'].waqcRef).toBe('SAK-011717/26')
    expect(byContract['C-42274/26'].waqcRef).toBe('SAK-011718/26')

    // SAME result on all three: same decision and same reason.
    for (const a of applyMock.mock.calls.map(([, args]) => args)) {
      expect(a.decision).toBe('rejected')
      expect(a.reason).toBe('Defects: 45 (max 30)')
      expect(a.sampleType).toBe('pss')
    }
  })

  it('never reads the archived sample_contracts table', async () => {
    const tables = { samples: [LAB_UNIT, sibling('s2', '42068/26', 2)], profiles: [PROFILE], certificates: [] }
    const admin = fakeAdmin(tables)
    const seen: string[] = []
    const spy = { from: (t: string) => { seen.push(t); return admin.from(t) } }

    await writeDecisionToShipmentSamples(spy as never, 's1', 'u1')

    expect(seen).not.toContain('sample_contracts')
    expect(applyMock).toHaveBeenCalledTimes(2)
  })

  it('dedupes a sibling that resolves to the lab unit contract (no double-write)', async () => {
    const admin = fakeAdmin({
      samples: [LAB_UNIT, sibling('s2', '42067/26', 2), sibling('s3', '42068/26', 3)], // s2 = same contract as the lab unit
      profiles: [PROFILE],
      certificates: [
        { sample_id: 's2', certificate_number: 'R-SAK-000001/26' },
        { sample_id: 's3', certificate_number: 'R-SAK-011717/26' },
      ],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    // Lab unit + the one distinct sibling = 2 (the duplicate contract is skipped).
    expect(applyMock).toHaveBeenCalledTimes(2)
    const contractIds = applyMock.mock.calls.map(([, a]) => a.contractId).sort()
    expect(contractIds).toEqual(['C-42067/26', 'C-42068/26'])
  })

  it('falls back to a sibling\'s own tracking number when it has no certificate yet', async () => {
    const admin = fakeAdmin({
      samples: [LAB_UNIT, { ...sibling('s2', '42068/26', 2), tracking_number: 'R-SAN-00702/26' }],
      profiles: [PROFILE],
      certificates: [],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    const byContract = Object.fromEntries(applyMock.mock.calls.map(([, a]) => [a.contractId, a]))
    expect(byContract['C-42068/26'].waqcRef).toBe('SAN-00702/26')
  })

  it('writes the whole group when entered through a sibling, and reads the reason from the lab unit', async () => {
    const admin = fakeAdmin({
      samples: [LAB_UNIT, sibling('s2', '42068/26', 2)],
      profiles: [PROFILE],
      certificates: [{ sample_id: 's2', certificate_number: 'R-SAK-011717/26' }],
    })

    // An override on the sibling's certificate calls in with the sibling id.
    await writeDecisionToShipmentSamples(admin as never, 's2', 'u1')

    expect(applyMock).toHaveBeenCalledTimes(2)
    const byContract = Object.fromEntries(applyMock.mock.calls.map(([, a]) => [a.contractId, a]))
    expect(byContract['C-42067/26'].waqcRef).toBe('SAN-00081/26')
    expect(byContract['C-42068/26'].waqcRef).toBe('SAK-011717/26')
    // Lab data lives on the lab unit, so the rejection reason is fetched for s1.
    expect(summariesMock).toHaveBeenCalledWith(expect.anything(), ['s1'])
    for (const a of applyMock.mock.calls.map(([, args]) => args)) expect(a.reason).toBe('Defects: 45 (max 30)')
  })

  it('does nothing for a sample that has not been decided yet', async () => {
    const admin = fakeAdmin({
      samples: [{ ...LAB_UNIT, status: 'cupping' }, { ...sibling('s2', '42068/26', 2), status: 'cupping' }],
      profiles: [PROFILE],
      certificates: [{ sample_id: 's2', certificate_number: 'R-SAK-011717/26' }],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    expect(applyMock).not.toHaveBeenCalled()
  })
})
