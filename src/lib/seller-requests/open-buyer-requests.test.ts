import { describe, it, expect, vi } from 'vitest'

const fetchGroup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sample-group', () => ({ fetchGroup }))

import { findOpenBuyerRequests } from './open-buyer-requests'

function fakeDb(requests: Array<Record<string, unknown>>, companies: Array<Record<string, unknown>> = [], error?: { code: string; message: string }) {
  const filters: Array<[string, string, unknown]> = []
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([table, c, v]); return q },
        in: (c: string, v: unknown) => { filters.push([table, c, v]); return q },
        not: (c: string, _o: string, v: unknown) => { filters.push([table, c, v]); return q },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(
            table === 'companies'
              ? { data: companies, error: null }
              : error ? { data: null, error } : { data: requests, error: null },
          ).then(res, rej),
      })
      return q
    },
  }
  return { db, filters }
}

describe('findOpenBuyerRequests', () => {
  it('names the recipient of each still-requested buyer request on the group contracts', async () => {
    fetchGroup.mockResolvedValue([{ id: 's1', contract_id: 'c1' }, { id: 's2', contract_id: 'c2' }, { id: 's3', contract_id: null }])
    const { db, filters } = fakeDb([{ id: 'req', recipient_company_id: null, recipient_company_name: 'Blaser' }])
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
    expect(filters).toContainEqual(['shipment_samples', 'contract_id', ['c1', 'c2']])
    expect(filters).toContainEqual(['shipment_samples', 'status', 'requested'])
  })

  it('uses the company display name for a recipient company id', async () => {
    fetchGroup.mockResolvedValue([{ id: 's1', contract_id: 'c1' }])
    const { db } = fakeDb(
      [{ id: 'req', recipient_company_id: 'co1', recipient_company_name: null }],
      [{ id: 'co1', name: 'Blaser Trading AG', fantasy_name: 'Blaser' }],
    )
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
  })

  it('lists each company once', async () => {
    fetchGroup.mockResolvedValue([{ id: 's1', contract_id: 'c1' }])
    const { db } = fakeDb([
      { id: 'a', recipient_company_id: null, recipient_company_name: 'Blaser' },
      { id: 'b', recipient_company_id: null, recipient_company_name: 'Blaser' },
    ])
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([{ company: 'Blaser' }])
  })

  it('is empty when sys has no pre_approval_of column yet', async () => {
    fetchGroup.mockResolvedValue([{ id: 's1', contract_id: 'c1' }])
    const { db } = fakeDb([], [], { code: '42703', message: 'no column' })
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([])
  })

  it('is empty when the group has no contract', async () => {
    fetchGroup.mockResolvedValue([{ id: 's1', contract_id: null }])
    const { db } = fakeDb([{ id: 'req', recipient_company_name: 'Blaser' }])
    expect(await findOpenBuyerRequests(db as never, 's1')).toEqual([])
  })
})
