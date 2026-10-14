import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ user: null as any, kind: 'staff' as any, profile: null as any, profileError: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }) }))
vi.mock('@/lib/auth/access-kind', () => ({
  accessKindForUser: async () => { if (m.kind instanceof Error) throw m.kind; return m.kind },
}))
vi.mock('./qc-portal-gate', () => ({
  portalServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.profile, error: m.profileError }) }) }) }),
  }),
}))

import { requirePortalStaff } from './staff-gate'

beforeEach(() => {
  m.user = { id: 'u1' }; m.kind = 'staff'; m.profileError = null
  m.profile = { qc_role: 'global_admin', is_global_admin: true, full_name: 'Dan', email: 'd@w.com' }
})

const status = async () => { const r = await requirePortalStaff(); return r.ok ? 200 : r.response.status }

describe('requirePortalStaff', () => {
  it('401 signed out, 403 non-staff, 503 when the access check or profile read fails', async () => {
    m.user = null
    expect(await status()).toBe(401)
    m.user = { id: 'u1' }; m.kind = 'external'
    expect(await status()).toBe(403)
    m.kind = new Error('db')
    expect(await status()).toBe(503)
    m.kind = 'staff'; m.profileError = { message: 'db' }
    expect(await status()).toBe(503)
  })
  it('403 for lab_personnel and finance, 200 for the managing roles', async () => {
    for (const qc_role of ['lab_personnel', 'finance']) {
      m.profile = { qc_role, is_global_admin: false, full_name: null, email: 'x@w.com' }
      expect(await status()).toBe(403)
    }
    for (const [qc_role, is_global_admin] of [['global_admin', true], ['global_quality_admin', false], ['lab_quality_manager', false], ['lab_personnel', true]] as const) {
      m.profile = { qc_role, is_global_admin, full_name: null, email: 'x@w.com' }
      expect(await status()).toBe(200)
    }
  })
})
