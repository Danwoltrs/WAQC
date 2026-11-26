import { describe, it, expect, vi } from 'vitest'
import { fetchShareWithAllClients, shareKey, buildOwnedPanels } from './send-queue'
import { panelKey } from './batch-send'

const db = (result: { data: unknown; error: unknown }) =>
  ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = () => q
      q.eq = () => Promise.resolve(result)
      return q
    },
  }) as never

describe('fetchShareWithAllClients', () => {
  it('returns the (client, lab) pairs that share with every party', async () => {
    const set = await fetchShareWithAllClients(
      db({ data: [{ company_id: 'c1', laboratory_id: 'hq' }], error: null }),
      [{ company_id: 'c1', laboratory_id: 'hq' }, { company_id: 'c2', laboratory_id: 'hq' }],
    )
    expect([...set]).toEqual([shareKey('c1', 'hq')])
  })
  it('only the sample\'s own lab counts: a flag on HQ does not reach a Colombia sample', async () => {
    const rows = db({ data: [{ company_id: 'c1', laboratory_id: 'hq' }], error: null })
    const hq = await fetchShareWithAllClients(rows, [{ company_id: 'c1', laboratory_id: 'hq' }])
    const co = await fetchShareWithAllClients(rows, [{ company_id: 'c1', laboratory_id: 'co' }])
    expect(hq.has(shareKey('c1', 'hq'))).toBe(true)
    expect(co.has(shareKey('c1', 'co'))).toBe(false)
    expect(co.size).toBe(0)
  })
  it('fails closed: a read error gives an empty set, so the PDF stays with the client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const set = await fetchShareWithAllClients(db({ data: null, error: { message: 'boom' } }), [{ company_id: 'c1', laboratory_id: 'hq' }])
    expect(set.size).toBe(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
  it('does not query when there are no clients', async () => {
    expect((await fetchShareWithAllClients(db({ data: [], error: null }), [])).size).toBe(0)
  })
})

describe('buildOwnedPanels: each laboratory\'s emails go to the contacts it owns', () => {
  const hq = { id: 'k1', company_id: 'ahold', email: 'hq@ahold.nl', name: 'Hq', role: null, is_primary: null, is_group: false, routing_purposes: ['qc_certificates'] }
  const co = { id: 'k2', company_id: 'ahold', email: 'co@ahold.nl', name: 'Co', role: null, is_primary: null, is_group: false, routing_purposes: ['qc_certificates'] }

  it('an HQ sample resolves only the HQ contact; a Colombia sample only its own', () => {
    // The fetch is owner-filtered, so each owner's rows hold only its contacts.
    const { panelsByCompany, savedContacts } = buildOwnedPanels(
      new Map([[null, [hq]], ['co', [co]]]), ['ahold'], () => 'Ahold',
    )
    expect(panelsByCompany.get(panelKey('ahold', null))!.to.map((c) => c.email)).toEqual(['hq@ahold.nl'])
    expect(panelsByCompany.get(panelKey('ahold', 'co'))!.to.map((c) => c.email)).toEqual(['co@ahold.nl'])
    expect(Object.keys(savedContacts.ahold).sort()).toEqual(['co@ahold.nl', 'hq@ahold.nl'])
  })
  it('a queue with one HQ sample reads HQ contacts only', () => {
    const { panelsByCompany, savedContacts } = buildOwnedPanels(new Map([[null, [hq]]]), ['ahold'], () => 'Ahold')
    expect(panelsByCompany.get('ahold')!.to.map((c) => c.email)).toEqual(['hq@ahold.nl'])
    expect(Object.keys(savedContacts.ahold)).toEqual(['hq@ahold.nl'])
  })
})
