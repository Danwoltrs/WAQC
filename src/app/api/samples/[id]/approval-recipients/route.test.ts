import { describe, it, expect, vi } from 'vitest'

const m = vi.hoisted(() => ({
  profile: { laboratory_id: 'co', qc_role: 'lab_personnel', is_global_admin: false } as any,
  sampleLab: 'hq' as string,
  adminTouched: 0,
}))

// The session client answers the profile, laboratory and sample reads that
// labWriteBlock makes; the service-role client must not be reached on a refusal.
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      const row =
        table === 'profiles' ? m.profile : table === 'laboratories' ? { type: 'lab' } : { laboratory_id: m.sampleLab }
      const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) }
      return chain
    },
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({ canUserManageSample: async () => ({ allowed: true }) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    m.adminTouched++
    throw new Error('service role must not be used for a refused caller')
  },
}))

import { GET } from './route'

describe('GET approval-recipients: lab scope', () => {
  it('403 for a Colombia caller asking about an HQ sample, before any contact is read', async () => {
    const res = await GET({} as never, { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(403)
    expect(m.adminTouched).toBe(0)
  })
})
