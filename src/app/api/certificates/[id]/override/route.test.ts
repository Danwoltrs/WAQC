import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Override Status is an ordinary decision. On a lot approved with comments it
 * must clear `samples.approved_with_comments`, or the buyer's certificate and
 * QR page keep printing the issued (adjusted) values on a lot staff have since
 * rejected, or re-approved on its real numbers.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => state.db.from(table) }),
}))
vi.mock('@/lib/sample-group', () => ({
  groupSampleIds: async (_db: any, id: string) => [id, 'sibling-1'],
}))
vi.mock('@/lib/certificate-storage', () => ({ invalidateCertificatePdf: async () => {} }))
vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: async () => {},
}))

import { PATCH } from './route'

type Row = Record<string, any>

function fakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; values: any; ids?: any[] }> = []
  const client: any = {
    writes,
    auth: { getUser: async () => ({ data: { user: { id: 'staff-1' } }, error: null }) },
    from(table: string) {
      const filters: Array<[string, any[]]> = []
      let pending: { table: string; values: any; ids?: any[] } | null = null
      const run = () => {
        let rows = [...(tables[table] ?? [])]
        for (const [op, args] of filters) {
          if (op === 'eq') rows = rows.filter((r) => r[args[0]] === args[1])
          if (op === 'neq') rows = rows.filter((r) => r[args[0]] !== args[1])
          if (op === 'in') rows = rows.filter((r) => (args[1] as any[]).includes(r[args[0]]))
        }
        return rows
      }
      const chain: any = {
        then(resolve: (v: any) => void) { resolve({ data: pending ? null : run(), error: null }) },
        single: async () => {
          const row = run()[0] ?? null
          return { data: row, error: row ? null : { code: 'PGRST116', message: 'none' } }
        },
        update(values: any) {
          pending = { table, values }
          writes.push(pending)
          return chain
        },
        select: () => chain,
        eq: (...args: any[]) => { filters.push(['eq', args]); if (pending) pending.ids = [args[1]]; return chain },
        neq: (...args: any[]) => { filters.push(['neq', args]); return chain },
        in: (...args: any[]) => { filters.push(['in', args]); if (pending) pending.ids = args[1]; return chain },
      }
      return chain
    },
  }
  return client
}

const patch = (status: 'approved' | 'rejected') =>
  PATCH(
    new NextRequest('http://localhost/api/certificates/cert-1/override', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, comment: 'Scr. 18' }),
    }),
    { params: Promise.resolve({ id: 'cert-1' }) },
  )

const seed = () =>
  fakeDb({
    certificates: [{ id: 'cert-1', certificate_number: 'SAX-011863/26', sample_id: 'lot-1', is_rejected: false }],
    samples: [
      { id: 'lot-1', status: 'approved', approved_with_comments: true },
      { id: 'sibling-1', status: 'approved', approved_with_comments: true },
    ],
  })

describe('PATCH /api/certificates/[id]/override on a lot approved with comments', () => {
  it.each(['rejected', 'approved'] as const)('clears approved_with_comments group-wide when overriding to %s', async (status) => {
    state.db = seed()
    const res = await patch(status)
    expect(res.status).toBe(200)
    const cleared = state.db.writes.filter(
      (w: any) => w.table === 'samples' && w.values.approved_with_comments === false,
    )
    expect(cleared).toHaveLength(1)
    expect(cleared[0].ids).toEqual(['lot-1', 'sibling-1'])
  })

  it('still flips the sample status for the whole group', async () => {
    state.db = seed()
    await patch('rejected')
    expect(state.db.writes).toContainEqual(
      expect.objectContaining({
        table: 'samples',
        values: expect.objectContaining({ status: 'rejected', workflow_stage: 'rejected' }),
        ids: ['lot-1', 'sibling-1'],
      }),
    )
  })
})
