import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  staff: true,
  labBlock: null as string | null,
  certificate: null as Record<string, unknown> | null,
  // What the guarded UPDATE of the certificate returns (null = nobody was waiting any more).
  finalized: { id: 'c1', certificate_number: '000123-COL/26', finalized_at: '2026-11-19T12:00:00Z' } as Record<string, unknown> | null,
  sampleError: null as unknown,
  writes: [] as Array<{ table: string; values: Record<string, unknown>; filters: unknown[][] }>,
  events: [] as unknown[],
}))

vi.mock('@/lib/auth/sample-access', () => ({ isInternalStaff: async () => h.staff }))
vi.mock('@/lib/auth/lab-scope', () => ({ labWriteBlock: async () => h.labBlock }))
vi.mock('@/lib/certificate-storage', () => ({ invalidateCertificatePdf: async () => {} }))
vi.mock('@/lib/sample-events', () => ({ logSampleEvent: async (_db: unknown, e: unknown) => { h.events.push(e) } }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: h.certificate, error: null }) }
      return chain
    },
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const write = { table, values: {} as Record<string, unknown>, filters: [] as unknown[][] }
      const chain: any = {
        update(values: Record<string, unknown>) { write.values = values; h.writes.push(write); return chain },
        eq: (...a: unknown[]) => (write.filters.push(['eq', ...a]), chain),
        is: (...a: unknown[]) => (write.filters.push(['is', ...a]), chain),
        not: (...a: unknown[]) => (write.filters.push(['not', ...a]), chain),
        select: () => chain,
        maybeSingle: async () => ({ data: h.finalized, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: table === 'samples' ? h.sampleError : null }),
      }
      return chain
    },
  }),
}))

import { POST } from './route'

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/certificates/c1/finalize', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'c1' }) },
  )

const waiting = { id: 'c1', certificate_number: '000123-COL/26', sample_id: 's1', status: 'draft', standby_at: '2026-11-10T10:00:00Z', finalized_at: null, voided_at: null }

beforeEach(() => {
  h.user = { id: 'u1' }
  h.staff = true
  h.labBlock = null
  h.certificate = { ...waiting }
  h.finalized = { id: 'c1', certificate_number: '000123-COL/26', finalized_at: '2026-11-19T12:00:00Z' }
  h.sampleError = null
  h.writes.length = 0
  h.events.length = 0
})

describe('POST /api/certificates/[id]/finalize', () => {
  it('makes the pre-certificate final: issued, same number, container on the lot, who and when recorded', async () => {
    const res = await call({ container_nr: ' msku 123456-7 ' })
    expect(res.status).toBe(200)
    expect((await res.json()).certificate).toMatchObject({ certificate_number: '000123-COL/26', container_nr: 'MSKU1234567' })

    const cert = h.writes.find((w) => w.table === 'certificates')!
    expect(cert.values).toMatchObject({ status: 'issued', finalized_by: 'u1', finalized_container: 'MSKU1234567' })
    expect(cert.values.certificate_number).toBeUndefined()
    // Only a certificate still waiting is taken.
    expect(cert.filters).toContainEqual(['is', 'finalized_at', null])
    expect(cert.filters).toContainEqual(['not', 'standby_at', 'is', null])

    const sample = h.writes.find((w) => w.table === 'samples')!
    expect(sample.values).toEqual({ container_nr: 'MSKU1234567' })
    expect(sample.filters).toContainEqual(['eq', 'id', 's1'])

    expect(h.events).toEqual([expect.objectContaining({ event_type: 'certificate_finalized', actor_user_id: 'u1', certificate_id: 'c1' })])
  })

  it('needs a container number', async () => {
    expect((await call({ container_nr: '  ' })).status).toBe(400)
    expect((await call({})).status).toBe(400)
    expect(h.writes).toHaveLength(0)
  })

  it('refuses a certificate that is not waiting: already final, never on standby, or voided', async () => {
    h.certificate = { ...waiting, finalized_at: '2026-11-12T10:00:00Z', status: 'issued' }
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(409)
    h.certificate = { ...waiting, standby_at: null, status: 'issued' }
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(409)
    h.certificate = { ...waiting, voided_at: '2026-11-12T10:00:00Z' }
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(409)
    expect(h.writes).toHaveLength(0)
  })

  it('two people at once: the second finds nothing waiting and changes nothing on the lot', async () => {
    h.finalized = null
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(409)
    expect(h.writes.some((w) => w.table === 'samples')).toBe(false)
  })

  it('HQ looking at another laboratory cannot finalize there', async () => {
    h.labBlock = 'This sample belongs to another laboratory: it can be viewed from here, not changed'
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(403)
    expect(h.writes).toHaveLength(0)
  })

  it('a certificate the caller cannot read is not found; only lab staff finalize', async () => {
    h.certificate = null
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(404)
    h.certificate = { ...waiting }
    h.staff = false
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(403)
    h.user = null
    expect((await call({ container_nr: 'MSKU1234567' })).status).toBe(401)
  })

  it('puts the certificate back on standby when the container cannot be saved on the lot', async () => {
    h.sampleError = { message: 'boom' }
    const res = await call({ container_nr: 'MSKU1234567' })
    expect(res.status).toBe(500)
    const undo = h.writes.filter((w) => w.table === 'certificates')[1]
    expect(undo.values).toMatchObject({ status: 'draft', finalized_at: null, finalized_by: null, finalized_container: null })
    expect(h.events).toHaveLength(0)
  })
})
