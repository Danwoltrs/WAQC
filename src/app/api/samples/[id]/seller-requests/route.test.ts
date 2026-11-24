import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeDb } from '@/lib/seller-requests/__fixtures__/fake-db'

const state = vi.hoisted(() => ({ db: null as any, staff: true, user: { id: 'u1' } as any }))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => state.staff }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.db }))
vi.mock('@/lib/seller-requests/destinations', () => ({ defaultDestination: vi.fn(async () => null) }))

import { GET } from './route'

beforeEach(() => {
  state.staff = true
  state.user = { id: 'u1' }
  state.db = fakeDb({
    samples: [
      { id: 'lab', lab_source_sample_id: null, sample_type: 'pss', status: 'pending', client_id: 'a', wolthers_contract_nr: 'C-1', deleted_at: null, created_at: '1' },
      { id: 'sib', lab_source_sample_id: 'lab', sample_type: 'pss', status: 'pending', client_id: 'b', wolthers_contract_nr: 'C-2', deleted_at: null, created_at: '2' },
      { id: 'ss', lab_source_sample_id: 'lab', sample_type: 'ss', status: 'pending', client_id: 'b', wolthers_contract_nr: 'C-3', deleted_at: null, created_at: '3' },
    ],
    companies: [{ id: 'a', fantasy_name: 'A' }, { id: 'b', fantasy_name: 'B' }],
    qc_client_settings: [], client_qualities: [],
  })
})

const call = () => GET(new NextRequest('http://localhost/api/samples/lab/seller-requests'), { params: Promise.resolve({ id: 'lab' }) })

describe('GET /api/samples/[id]/seller-requests', () => {
  it('403 for non-staff', async () => {
    state.staff = false
    expect((await call()).status).toBe(403)
  })
  it('401 without a session', async () => {
    state.user = null
    expect((await call()).status).toBe(401)
  })
  it('returns the PSS members of the group only', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toHaveLength(2)
    expect(body.members.map((m: any) => m.sampleId)).toEqual(['lab', 'sib'])
  })
})
