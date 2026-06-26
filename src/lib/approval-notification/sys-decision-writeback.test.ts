import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the leaf collaborators so we can assert the ORCHESTRATION:
// writeDecisionToShipmentSamples must fan a mother sample's decision out to its
// primary contract AND every child sub-contract, each with the SAME result.
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

const applyMock = vi.mocked(applyShipmentSampleApproval)

/** Minimal awaitable Supabase stub serving the three tables the write-back reads. */
function fakeAdmin(data: { mother: unknown; profile: unknown; subs: unknown[] }) {
  return {
    from(table: string) {
      const payload =
        table === 'samples'
          ? { data: data.mother }
          : table === 'profiles'
            ? { data: data.profile }
            : table === 'sample_contracts'
              ? { data: data.subs }
              : { data: null }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        order: self,
        limit: self,
        single: async () => payload,
        maybeSingle: async () => payload,
        then: (resolve: (v: unknown) => unknown) => resolve(payload),
      })
      return chain
    },
  }
}

const MOTHER = {
  id: 's1',
  tracking_number: 'SAN-00081/26',
  status: 'rejected',
  contract_id: null,
  wolthers_contract_nr: '42067/26',
  sample_type: 'pss',
}
const PROFILE = { full_name: 'Anderson' }

beforeEach(() => applyMock.mockClear())

describe('writeDecisionToShipmentSamples — children get the same result, all saved on sys', () => {
  it('writes the decision to the mother contract AND every child sub-contract', async () => {
    const admin = fakeAdmin({
      mother: MOTHER,
      profile: PROFILE,
      subs: [
        { contract_id: null, wolthers_contract_nr: '42068/26', tracking_number: 'R-SAK-011717/26' },
        { contract_id: null, wolthers_contract_nr: '42274/26', tracking_number: 'R-SAK-011718/26' },
      ],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    // One save per contract: mother + 2 children = 3.
    expect(applyMock).toHaveBeenCalledTimes(3)
    const byContract = Object.fromEntries(applyMock.mock.calls.map(([, a]) => [a.contractId, a]))

    // Every contract represented, keyed by its own tracking number (R- stripped).
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

  it('dedupes a child that resolves to the mother contract (no double-write)', async () => {
    const admin = fakeAdmin({
      mother: MOTHER,
      profile: PROFILE,
      subs: [
        { contract_id: null, wolthers_contract_nr: '42067/26', tracking_number: 'R-SAK-000001/26' }, // same as mother
        { contract_id: null, wolthers_contract_nr: '42068/26', tracking_number: 'R-SAK-011717/26' },
      ],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    // Mother + the one distinct child = 2 (the duplicate contract is skipped).
    expect(applyMock).toHaveBeenCalledTimes(2)
    const contractIds = applyMock.mock.calls.map(([, a]) => a.contractId).sort()
    expect(contractIds).toEqual(['C-42067/26', 'C-42068/26'])
  })

  it('does nothing for a sample that has not been decided yet', async () => {
    const admin = fakeAdmin({
      mother: { ...MOTHER, status: 'cupping' },
      profile: PROFILE,
      subs: [{ contract_id: null, wolthers_contract_nr: '42068/26', tracking_number: 'R-SAK-011717/26' }],
    })

    await writeDecisionToShipmentSamples(admin as never, 's1', 'u1')

    expect(applyMock).not.toHaveBeenCalled()
  })
})
