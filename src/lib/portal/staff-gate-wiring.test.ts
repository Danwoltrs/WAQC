import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  user: null as any, kind: 'staff' as any, profile: null as any, profileError: null as any,
  // The caller's laboratory and its type, as loadLabScope reads them; the
  // profile read for the scope fails when scopeError is set.
  labId: null as string | null, labType: null as string | null, scopeError: null as any,
}))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }) }))
vi.mock('@/lib/auth/access-kind', () => ({
  accessKindForUser: async () => { if (m.kind instanceof Error) throw m.kind; return m.kind },
}))
vi.mock('./qc-portal-gate', () => ({
  portalServiceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'laboratories') return { data: m.labType ? { type: m.labType } : null, error: null }
            // loadLabScope's read asks for laboratory_id; the gate's own does not.
            if (cols.includes('laboratory_id')) {
              return { data: m.profile && { ...m.profile, laboratory_id: m.labId }, error: m.scopeError }
            }
            return { data: m.profile, error: m.profileError }
          },
        }),
      }),
    }),
  }),
}))

import { requirePortalStaff } from './staff-gate'
import { PORTAL_ACCESS_HQ_ONLY } from '@/lib/auth/lab-scope'

beforeEach(() => {
  m.user = { id: 'u1' }; m.kind = 'staff'; m.profileError = null
  m.profile = { qc_role: 'global_admin', is_global_admin: true, full_name: 'Dan', email: 'd@w.com' }
  m.labId = null; m.labType = null; m.scopeError = null
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

  it("a confined lab's quality manager is refused with the Santos message", async () => {
    m.profile = { qc_role: 'lab_quality_manager', is_global_admin: false, full_name: null, email: 'gt@w.com' }
    m.labId = 'lab-gt'; m.labType = 'lab'
    const r = await requirePortalStaff()
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.response.status).toBe(403)
    expect((await r.response.json()).error).toBe(PORTAL_ACCESS_HQ_ONLY)
  })

  it('HQ, a global admin in any lab, and a manager with no lab pass', async () => {
    m.profile = { qc_role: 'lab_quality_manager', is_global_admin: false, full_name: null, email: 'hq@w.com' }
    m.labId = 'lab-hq'; m.labType = 'hq'
    expect(await status()).toBe(200)
    m.profile = { qc_role: 'global_quality_admin', is_global_admin: false, full_name: null, email: 'g@w.com' }
    m.labId = 'lab-gt'; m.labType = 'lab'
    expect(await status()).toBe(200)
    m.profile = { qc_role: 'lab_quality_manager', is_global_admin: false, full_name: null, email: 'n@w.com' }
    m.labId = null; m.labType = null
    expect(await status()).toBe(200)
  })

  it('503 when the laboratory scope cannot be read (fail closed, never "reads every lab")', async () => {
    m.profile = { qc_role: 'lab_quality_manager', is_global_admin: false, full_name: null, email: 'x@w.com' }
    m.scopeError = { message: 'db' }
    expect(await status()).toBe(503)
  })
})
