import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeDb } from './__fixtures__/fake-db'

vi.mock('./destinations', () => ({
  defaultDestination: vi.fn(async (_a: unknown, args: { clientId: string }) => ({
    companyId: args.clientId, companyName: 'Blaser', savedAddressId: null, lines: ['1 Road'],
    country: 'CH', recipientName: null, attention: null, phone: null, instructions: null,
  })),
}))

import { defaultDestination } from './destinations'
import { loadSellerRequestStates, loadGroupSellerRequestStates, saveSellerRequests } from './store'
import { sellerRequestsToDb } from './types'

function seed() {
  return {
    samples: [
      { id: 'lab', lab_source_sample_id: null, sample_type: 'pss', status: 'pending', client_id: 'blaser', quality_spec_id: 'q1', importer_id: 'imp1', roaster_id: 'r1', wolthers_contract_nr: 'C-1', deleted_at: null, seller_requests: null, created_at: '2026-01-01' },
      { id: 'sib', lab_source_sample_id: 'lab', sample_type: 'pss', status: 'pending', client_id: 'ahold', quality_spec_id: null, importer_id: null, roaster_id: null, wolthers_contract_nr: 'C-2', deleted_at: null, seller_requests: null, created_at: '2026-01-02' },
      { id: 'ss', lab_source_sample_id: 'lab', sample_type: 'ss', status: 'pending', client_id: 'ahold', quality_spec_id: null, importer_id: null, roaster_id: null, wolthers_contract_nr: 'C-3', deleted_at: null, seller_requests: null, created_at: '2026-01-03' },
    ],
    companies: [
      { id: 'blaser', name: 'Blaser Trading AG', fantasy_name: 'Blaser' },
      { id: 'ahold', name: 'Ahold Delhaize NV', fantasy_name: 'Ahold' },
    ],
    qc_client_settings: [
      { company_id: 'blaser', final_word: 'wolthers', final_word_fixed: false, buyer_sample_address_id: null, stuffing_request: 'off' },
      { company_id: 'ahold', final_word: 'wolthers', final_word_fixed: true, buyer_sample_address_id: null, stuffing_request: 'off' },
    ],
    client_qualities: [
      { id: 'q1', custom_name: 'Dulce', template: { name: 'Template' }, final_word: 'pre_approval', final_word_fixed: true, buyer_sample_address_id: null, stuffing_request: null },
    ],
  }
}

beforeEach(() => vi.clearAllMocks())

describe('loadGroupSellerRequestStates', () => {
  it('resolves each contract against its own client', async () => {
    const db = fakeDb(seed())
    const states = await loadGroupSellerRequestStates(db as any, 'sib')
    expect(states.map((s) => s.sampleId)).toEqual(['lab', 'sib'])
    const [blaser, ahold] = states
    expect(blaser.requests.buyerSample).not.toBeNull()
    expect(blaser.locks.buyerSample.locked).toBe(true)
    expect(blaser.clientName).toBe('Blaser')
    expect(blaser.importerId).toBe('imp1')
    expect(ahold.requests.buyerSample).toBeNull()
    expect(ahold.locks.buyerSample).toEqual({ locked: true, reason: 'Ahold: Wolthers has the final word' })
  })

  it('does not look up an address unless pre-approval or a stored buyer sample', async () => {
    const db = fakeDb(seed())
    await loadSellerRequestStates(db as any, ['sib'])
    expect(defaultDestination).not.toHaveBeenCalled()
  })
})

describe('guarded reads', () => {
  it('falls back to defaults when the settings columns are missing', async () => {
    const db = fakeDb(seed(), {
      missingColumns: { qc_client_settings: ['final_word'], client_qualities: ['final_word'], samples: ['seller_requests'] },
    })
    const states = await loadSellerRequestStates(db as any, ['lab', 'sib'])
    const lab = states.get('lab')!
    expect(lab.rules.finalWord).toBe('wolthers')
    expect(lab.rules.fixed).toBe(false)
    expect(lab.requests.buyerSample).toBeNull()
    expect(lab.requests.stuffing).toBe(false)
  })
})

describe('saveSellerRequests', () => {
  const incoming = (over: object) => ({ buyerSample: null, stuffing: false, setBy: 'spoof', setAt: 'spoof', ...over })

  it('refuses a change to a fixed tick and writes the locked value, stamping setBy/setAt', async () => {
    const data = seed()
    const db = fakeDb(data)
    const res = await saveSellerRequests(db as any, 'user-9', { lab: incoming({}) }, { allowedIds: new Set(['lab']) })
    expect(res.refused).toEqual({ lab: ['buyerSample'] })
    expect(res.saved).toEqual(['lab'])
    const stored = data.samples[0].seller_requests as any
    expect(stored.buyer_sample.company_name).toBe('Blaser')
    expect(stored.set_by).toBe('user-9')
    expect(stored.set_at).not.toBe('spoof')
  })

  it('does not write ids outside allowedIds', async () => {
    const db = fakeDb(seed())
    const res = await saveSellerRequests(db as any, 'u', { sib: incoming({ stuffing: true }) }, { allowedIds: new Set(['lab']) })
    expect(res.saved).toEqual([])
    expect(db.writes).toEqual([])
  })

  it('logs and omits a failed write without throwing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeDb(seed(), { failUpdate: (t, id) => t === 'samples' && id === 'sib' })
    const res = await saveSellerRequests(db as any, 'u', { sib: incoming({ stuffing: true }) }, { allowedIds: new Set(['sib']) })
    expect(res.saved).toEqual([])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('uses a stored buyer sample (round trip)', async () => {
    const data = seed()
    data.qc_client_settings[1].final_word_fixed = false
    ;(data.samples[1] as any).seller_requests = sellerRequestsToDb({
      buyerSample: { companyId: 'x', companyName: 'X', savedAddressId: null, lines: [], country: null, recipientName: null, attention: null, phone: null, instructions: null },
      stuffing: false, setBy: 'u', setAt: 't',
    })
    const db = fakeDb(data)
    const m = (await loadSellerRequestStates(db as any, ['sib'])).get('sib')!
    expect(m.requests.buyerSample?.companyName).toBe('X')
  })
})
