import { describe, it, expect, vi } from 'vitest'

const fetchGroup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sample-group', () => ({ fetchGroup }))

import { findOpenBuyerRequests } from './open-buyer-requests'

type Row = Record<string, unknown>
interface Fixture {
  /** Our claimed rows on sys (id, waqc_ref, contract_id). */
  claimed?: Row[]
  /** Buyer requests (pre_approval_of -> a row id). */
  requests?: Row[]
  certificates?: Row[]
  companies?: Row[]
  error?: { code: string; message: string }
}

/** Table and column aware: the claimed-rows read and the request read are told apart by their columns. */
function fakeDb(f: Fixture) {
  const filters: Array<[string, string, unknown]> = []
  const db = {
    from(table: string) {
      let cols = ''
      const mine: Array<[string, unknown]> = []
      const q: Record<string, unknown> = {}
      const result = () => {
        if (table === 'companies') return { data: f.companies ?? [], error: null }
        if (table === 'certificates') return { data: f.certificates ?? [], error: null }
        if (f.error) return { data: null, error: f.error }
        if (/recipient/.test(cols)) {
          const of = (mine.find(([c]) => c === 'pre_approval_of')?.[1] ?? []) as string[]
          return { data: (f.requests ?? []).filter((r) => of.includes(r.pre_approval_of as string)), error: null }
        }
        const refs = (mine.find(([c]) => c === 'waqc_ref')?.[1] ?? []) as string[]
        return { data: (f.claimed ?? []).filter((r) => refs.includes(r.waqc_ref as string)), error: null }
      }
      const rec = (c: string, v: unknown) => { mine.push([c, v]); filters.push([table, c, v]); return q }
      Object.assign(q, {
        select: (c?: string) => { cols = c ?? ''; return q },
        eq: rec,
        in: rec,
        is: rec,
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      })
      return q
    },
  }
  return { db, filters }
}

const lab = { id: 's1', contract_id: 'c1', lab_source_sample_id: null, tracking_number: 'SAN-1/26' }
const claimedRow = { id: 'anchor', waqc_ref: 'SAN-1/26', contract_id: 'c1' }

describe('findOpenBuyerRequests', () => {
  it('names the recipient of a still-requested buyer request pointing at this lot', async () => {
    fetchGroup.mockResolvedValue([lab])
    const { db, filters } = fakeDb({
      claimed: [claimedRow],
      requests: [{ id: 'req', pre_approval_of: 'anchor', recipient_company_id: null, recipient_company_name: 'Blaser' }],
    })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
    expect(filters).toContainEqual(['shipment_samples', 'contract_id', ['c1']])
    expect(filters).toContainEqual(['shipment_samples', 'status', 'requested'])
  })

  it('does not return a request pointing at a row with a different ref (another lot on the contract)', async () => {
    fetchGroup.mockResolvedValue([lab])
    const { db } = fakeDb({
      claimed: [claimedRow, { id: 'resample', waqc_ref: 'SAN-9/26', contract_id: 'c1' }],
      requests: [{ id: 'req', pre_approval_of: 'resample', recipient_company_id: null, recipient_company_name: 'Blaser' }],
    })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([])
  })

  it('keys a contract sibling by its certificate number without the R- prefix', async () => {
    fetchGroup.mockResolvedValue([lab, { id: 's2', contract_id: 'c2', lab_source_sample_id: 's1', tracking_number: 'SAN-2/26' }])
    const { db } = fakeDb({
      certificates: [{ sample_id: 's2', certificate_number: 'R-SAG-011895/26' }],
      claimed: [{ id: 'sib-anchor', waqc_ref: 'SAG-011895/26', contract_id: 'c2' }],
      requests: [{ id: 'req', pre_approval_of: 'sib-anchor', recipient_company_id: null, recipient_company_name: 'Blaser' }],
    })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
  })

  it('uses the company display name for a recipient company id', async () => {
    fetchGroup.mockResolvedValue([lab])
    const { db } = fakeDb({
      claimed: [claimedRow],
      requests: [{ id: 'req', pre_approval_of: 'anchor', recipient_company_id: 'co1', recipient_company_name: null }],
      companies: [{ id: 'co1', name: 'Blaser Trading AG', fantasy_name: 'Blaser' }],
    })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
  })

  it('never hides an open request whose recipient cannot be resolved', async () => {
    fetchGroup.mockResolvedValue([lab])
    const { db } = fakeDb({
      claimed: [claimedRow],
      requests: [{ id: 'req', pre_approval_of: 'anchor', recipient_company_id: null, recipient_company_name: null }],
    })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'a buyer' }])
  })

  it('lists each company once', async () => {
    fetchGroup.mockResolvedValue([lab])
    const { db } = fakeDb({
      claimed: [claimedRow],
      requests: [
        { id: 'a', pre_approval_of: 'anchor', recipient_company_id: null, recipient_company_name: 'Blaser' },
        { id: 'b', pre_approval_of: 'anchor', recipient_company_id: null, recipient_company_name: 'Blaser' },
      ],
    })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
  })

  it('is empty when sys has no pre_approval_of column yet', async () => {
    fetchGroup.mockResolvedValue([lab])
    const { db } = fakeDb({ error: { code: '42703', message: 'no column' } })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([])
  })

  it('is empty when the group has no contract', async () => {
    fetchGroup.mockResolvedValue([{ ...lab, contract_id: null }])
    const { db } = fakeDb({ claimed: [claimedRow] })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([])
  })
})
