import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => {
  const caller = {
    profile: { laboratory_id: 'hq', qc_role: 'lab_manager', is_global_admin: false } as Record<string, unknown>,
    labType: 'hq' as string | null,
    sampleLab: 'lab-gt' as string | null,
  }
  // Every table read past the lab check is recorded.
  const tablesAfterGate: string[] = []
  const from = (table: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.in = () => q
    q.update = () => q
    q.maybeSingle = async () => ({
      data:
        table === 'profiles' ? caller.profile
        : table === 'laboratories' ? { type: caller.labType }
        : table === 'samples' ? { laboratory_id: caller.sampleLab }
        : null,
      error: null,
    })
    q.single = async () => {
      tablesAfterGate.push(table)
      return { data: null, error: { message: 'none' } }
    }
    return q
  }
  const send = vi.fn(async () => ({ error: null }))
  return { caller, from, tablesAfterGate, send }
})

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: h.from,
  }),
}))
vi.mock('@/lib/sample-utils', () => ({ resolveSampleId: async (_db: unknown, id: string) => ({ id }) }))
vi.mock('@/lib/auth/sample-access', () => ({ canUserManageSample: async () => ({ allowed: true }) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: h.send } } }))

import { POST } from './route'
import { OTHER_LAB_WRITE_ERROR } from '@/lib/auth/lab-scope'

const ctx = { params: Promise.resolve({ id: 'sample-gt' }) }
const post = () => POST(new NextRequest('http://x', { method: 'POST', body: '{}' }), ctx)

beforeEach(() => {
  h.caller.profile = { laboratory_id: 'hq', qc_role: 'lab_manager', is_global_admin: false }
  h.caller.labType = 'hq'
  h.caller.sampleLab = 'lab-gt'
  h.tablesAfterGate.length = 0
  h.send.mockClear()
})

describe('POST /api/samples/[id]/send-to-recipients: the sending lab', () => {
  it("refuses HQ another laboratory's sample (looking, not working): nothing is read on or mailed", async () => {
    const res = await post()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(OTHER_LAB_WRITE_ERROR)
    expect(h.tablesAfterGate).toEqual([])
    expect(h.send).not.toHaveBeenCalled()
  })

  it("refuses a confined lab's caller a Santos sample", async () => {
    h.caller.profile = { laboratory_id: 'lab-gt', qc_role: 'lab_manager', is_global_admin: false }
    h.caller.labType = 'lab'
    h.caller.sampleLab = 'hq'
    expect((await post()).status).toBe(403)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('lets the sample\'s own laboratory through', async () => {
    h.caller.sampleLab = 'hq'
    const res = await post()
    expect(res.status).toBe(404)
    expect(h.tablesAfterGate).toContain('samples')
  })
})
