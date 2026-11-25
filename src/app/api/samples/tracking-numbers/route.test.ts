import { describe, it, expect, vi } from 'vitest'

/**
 * The format shown for a tracking number is the sample's own laboratory's
 * settings row; a laboratory with none gets the default, never another lab's.
 */

const state = vi.hoisted(() => ({ settings: [] as any[] }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: async () => ({ data: 'CERT-000001', error: null }),
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: { name: 'Co', fantasy_name: null, qc_settings: state.settings }, error: null }),
      }
      return q
    },
  }),
}))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body }) as any
const DEFAULT = 'WAQC-{lab}-{year}-{seq:05d}'

describe('POST /api/samples/tracking-numbers', () => {
  it('names the format of the sample\'s own laboratory', async () => {
    state.settings = [
      { laboratory_id: 'lab-hq', tracking_number_format: 'B-{seq}' },
      { laboratory_id: 'lab-co', tracking_number_format: 'CO-{seq}' },
    ]
    const body = await (await POST(req({ client_id: 'c', laboratory_id: 'lab-co' }))).json()
    expect(body.format_used).toBe('CO-{seq}')
  })

  it('gives a laboratory with no row the default format, not HQ\'s', async () => {
    state.settings = [{ laboratory_id: 'lab-hq', tracking_number_format: 'B-{seq}' }]
    const body = await (await POST(req({ client_id: 'c', laboratory_id: 'lab-co' }))).json()
    expect(body.format_used).toBe(DEFAULT)
  })
})
