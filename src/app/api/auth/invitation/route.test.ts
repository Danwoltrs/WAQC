import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ row: null as any, eqs: [] as Array<[string, unknown]>, selected: '' }))

vi.mock('@/lib/portal/qc-portal-gate', () => ({
  portalServiceClient: () => ({
    from: () => ({
      select: (cols: string) => {
        state.selected = cols
        const q: any = {
          eq: (c: string, v: unknown) => { state.eqs.push([c, v]); return q },
          maybeSingle: async () => ({ data: state.row, error: null }),
        }
        return q
      },
    }),
  }),
}))

import { GET } from './route'
import { NextRequest } from 'next/server'

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/auth/invitation${qs}`))
const future = () => new Date(Date.now() + 86_400_000).toISOString()
const TOKEN = 'abcdefghij1234567890'

beforeEach(() => { state.row = null; state.eqs = []; state.selected = '' })

describe('GET /api/auth/invitation', () => {
  it('answers a generic 404 for a missing or short token without querying', async () => {
    const res = await call('')
    expect(res.status).toBe(404)
    expect(state.selected).toBe('')
    expect((await call('?token=short')).status).toBe(404)
  })

  it('answers a generic 404 for an unknown, used or expired-status token and never echoes it', async () => {
    const res = await call(`?token=${TOKEN}`)
    expect(res.status).toBe(404)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain(TOKEN)
    expect(state.eqs).toContainEqual(['invitation_token', TOKEN])
    expect(state.eqs).toContainEqual(['status', 'pending'])
  })

  it('returns only the page fields for a valid pending staff invitation', async () => {
    state.row = {
      id: 'i1', email: 'a@b.com', first_name: 'A', last_name: 'B', qc_role: 'lab_personnel',
      laboratory_id: 'lab1', is_cupper: true, is_q_grader: false, qc_enabled: true,
      status: 'pending', expires_at: future(),
    }
    const res = await call(`?token=${TOKEN}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(state.row)
    expect(state.selected).not.toContain('invitation_token')
    expect(state.selected).not.toContain('*')
  })

  it('refuses an external-role invitation with the generic 404', async () => {
    state.row = { id: 'i2', email: 'c@d.com', qc_role: 'client', expires_at: future() }
    expect((await call(`?token=${TOKEN}`)).status).toBe(404)
  })

  it('answers 410 when the pending invitation is past its expiry', async () => {
    state.row = { id: 'i3', email: 'e@f.com', qc_role: 'lab_personnel', expires_at: new Date(Date.now() - 1000).toISOString() }
    expect((await call(`?token=${TOKEN}`)).status).toBe(410)
  })
})
