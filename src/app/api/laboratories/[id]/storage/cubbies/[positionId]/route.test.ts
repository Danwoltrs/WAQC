import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

const ctx = { params: Promise.resolve({ id: 'lab', positionId: 'p1' }) }

describe('GET cubby contents', () => {
  it('lists the cubby samples without selecting the SAN number', async () => {
    state.db = fakeSupabase({
      tables: {
        profiles: { qc_role: 'lab_personnel', laboratory_id: 'lab' },
        storage_positions: { id: 'p1', position_code: 'B-C4', laboratory_id: 'lab' },
        samples: [{ id: 's1', storage_position_id: 'p1', wolthers_contract_nr: '42273/26', container_nr: 'HASU 1', ico_number: null, exporter_sample_number: null, client: null }],
        certificates: [{ id: 'c1', sample_id: 's1', certificate_number: 'SAG-011895/26' }],
      },
    })
    const res = await GET({} as any, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cubby).toEqual({ id: 'p1', code: 'B-C4' })
    expect(body.samples[0].label).toBe('SAG-011895/26')
    const sampleSelect = state.db.calls.find((c: any) => c.table === 'samples' && c.op === 'select')
    expect(String(sampleSelect.args[0])).not.toContain('tracking_number')
  })

  it('answers 404 for a cubby of another lab', async () => {
    state.db = fakeSupabase({
      tables: {
        profiles: { is_global_admin: true },
        storage_positions: { id: 'p1', position_code: 'B-C4', laboratory_id: 'other-lab' },
      },
    })
    expect((await GET({} as any, ctx)).status).toBe(404)
  })
})
