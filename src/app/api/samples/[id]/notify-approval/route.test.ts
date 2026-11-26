import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => {
  const caller = {
    profile: { laboratory_id: 'lab-gt', qc_role: 'lab_manager', is_global_admin: false } as Record<string, unknown>,
    labType: 'lab' as string | null,
    sampleLab: 'hq' as string | null,
  }
  // The caller's session client: what labWriteBlock reads.
  const serverFrom = (table: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => ({
      data:
        table === 'profiles' ? caller.profile
        : table === 'laboratories' ? { type: caller.labType }
        : table === 'samples' ? { laboratory_id: caller.sampleLab }
        : null,
      error: null,
    })
    return q
  }
  // The service-role client: every table it touches is recorded.
  const adminTables: string[] = []
  const adminFrom = (table: string) => {
    adminTables.push(table)
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.single = async () => ({ data: null, error: null })
    q.maybeSingle = async () => ({ data: null, error: null })
    return q
  }
  const sendMail = vi.fn(async () => null)
  return { caller, serverFrom, adminTables, adminFrom, sendMail }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: h.adminFrom }) }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'tech@wolthers.com' } } }) },
    from: h.serverFrom,
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ canUserManageSample: async () => ({ allowed: true }) }))
vi.mock('@/lib/graph/send', () => ({ sendMail: h.sendMail }))
vi.mock('@/lib/certificate-storage', () => ({ getCachedCertificatePdf: async () => null, uploadCertificatePdf: async () => {} }))
vi.mock('@/lib/certificate-render', () => ({ renderCertificatePdfBuffer: async () => Buffer.from('%PDF-1.4') }))

import { POST } from './route'
import { OTHER_LAB_WRITE_ERROR } from '@/lib/auth/lab-scope'

const ctx = { params: Promise.resolve({ id: 'sample-hq' }) }
const send = () =>
  POST(
    new NextRequest('http://x', {
      method: 'POST',
      body: JSON.stringify({ panels: [{ side: 'buyer', to: ['buyer@example.com'], subject: 'S', bodyText: 'B' }] }),
    }),
    ctx,
  )

beforeEach(() => {
  h.caller.profile = { laboratory_id: 'lab-gt', qc_role: 'lab_manager', is_global_admin: false }
  h.caller.labType = 'lab'
  h.caller.sampleLab = 'hq'
  h.adminTables.length = 0
  h.sendMail.mockClear()
})

describe('POST /api/samples/[id]/notify-approval: the sending lab', () => {
  it("refuses a confined lab's caller a Santos sample; the service role reads and sends nothing", async () => {
    const res = await send()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(OTHER_LAB_WRITE_ERROR)
    expect(h.adminTables).toEqual([])
    expect(h.sendMail).not.toHaveBeenCalled()
  })

  it('lets a confined lab through for its own sample', async () => {
    h.caller.sampleLab = 'lab-gt'
    const res = await send()
    // Past the gate: the service role looks the sample up (none here, so 404).
    expect(res.status).toBe(404)
    expect(h.adminTables).toContain('samples')
  })
})
