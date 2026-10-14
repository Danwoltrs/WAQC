import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accessKindForUser, classifyAccessKind, parseAccessKind, resolveLandingPath } from './access-kind'

describe('classifyAccessKind (mirrors SQL waqc_access_kind)', () => {
  const k = (
    userType: string | null,
    userStatus: string | null,
    qcRole: string | null,
    qcEnabled: boolean | null,
    isGlobalAdmin: boolean | null = null,
  ) => classifyAccessKind({ userType, userStatus, qcRole, qcEnabled, isGlobalAdmin })
  it('a disabled sys account is none, whatever else it holds', () => {
    expect(k('internal', 'disabled', 'lab_personnel', true)).toBe('none')
    expect(k('external', 'disabled', 'global_admin', true, true)).toBe('none')
    expect(k('internal', 'disabled', 'global_admin', false, true)).toBe('none')
    expect(k('external', 'disabled', null, null)).toBe('none')
    expect(k('internal', 'disabled', null, null)).toBe('none')
  })
  it('a global admin is staff whatever qc_enabled says', () => {
    expect(k('internal', 'active', 'global_admin', false)).toBe('staff')
    expect(k('internal', 'active', 'global_quality_admin', null)).toBe('staff')
    expect(k(null, null, null, false, true)).toBe('staff')
    expect(k('internal', 'active', 'lab_personnel', false, true)).toBe('staff')
    expect(k('internal', 'active', 'client', false, true)).toBe('staff')
    expect(k('external', 'pending', 'global_admin', false)).toBe('staff')
  })
  it('a non-global staff role is staff only with qc_enabled true', () => {
    expect(k('internal', 'active', 'lab_personnel', true)).toBe('staff')
    expect(k('internal', 'active', 'lab_personnel', true, false)).toBe('staff')
    expect(k('internal', 'active', 'lab_personnel', false, false)).toBe('none')
    expect(k(null, null, 'lab_personnel', false)).toBe('none')
    expect(k(null, null, 'lab_personnel', null)).toBe('none')
    expect(k('external', 'active', 'lab_personnel', false)).toBe('external')
    expect(k('external', 'pending', 'lab_personnel', null)).toBe('external')
  })
  it('staff comes before external: an external row does not demote staff', () => {
    expect(k('external', 'active', 'lab_personnel', true)).toBe('staff')
    expect(k('external', 'pending', 'lab_personnel', true)).toBe('staff')
    expect(k('external', 'invited', 'lab_personnel', true)).toBe('staff')
  })
  it('external at any status other than disabled is external', () => {
    expect(k('external', 'active', null, null)).toBe('external')
    expect(k('external', 'pending', null, null)).toBe('external')
    expect(k('external', 'invited', null, null)).toBe('external')
    expect(k('external', null, null, null)).toBe('external')
  })
  it('no role, or a client role, without an external row is none', () => {
    expect(k('internal', 'active', 'client', true)).toBe('none')
    expect(k('internal', 'active', 'client', true, false)).toBe('none')
    expect(k('internal', 'active', null, null)).toBe('none')
    expect(k('co_broker', 'active', null, null)).toBe('none')
  })
})

type Read = { data: Record<string, unknown> | null; error: { message: string } | null }

/** A service-role stand-in: one maybeSingle() answer per table, and the reads it saw. */
function fakeAdmin(answers: Record<string, Read>) {
  const reads: { table: string; columns: string; column: string; value: string }[] = []
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              reads.push({ table, columns, column, value })
              return { maybeSingle: async () => answers[table] ?? { data: null, error: null } }
            },
          }
        },
      }
    },
  }
  return { admin: client as unknown as SupabaseClient<any>, reads }
}

describe('accessKindForUser', () => {
  const USER = '11111111-1111-4111-8111-111111111111'

  it('reads type and status from user_profiles and role and flags from profiles, by user id', async () => {
    const { admin, reads } = fakeAdmin({
      user_profiles: { data: { user_type: 'internal', status: 'active' }, error: null },
      profiles: { data: { qc_role: 'lab_personnel', qc_enabled: true, is_global_admin: false }, error: null },
    })
    await expect(accessKindForUser(admin, USER)).resolves.toBe('staff')
    expect(reads).toEqual(expect.arrayContaining([
      { table: 'user_profiles', columns: 'user_type, status', column: 'id', value: USER },
      { table: 'profiles', columns: 'qc_role, qc_enabled, is_global_admin', column: 'id', value: USER },
    ]))
    expect(reads).toHaveLength(2)
  })

  it('a global admin with qc_enabled false is staff', async () => {
    const { admin } = fakeAdmin({
      user_profiles: { data: { user_type: 'internal', status: 'active' }, error: null },
      profiles: { data: { qc_role: 'global_admin', qc_enabled: false, is_global_admin: true }, error: null },
    })
    await expect(accessKindForUser(admin, USER)).resolves.toBe('staff')
  })

  it('is_global_admin alone (no role, qc_enabled false) is staff', async () => {
    const { admin } = fakeAdmin({
      user_profiles: { data: null, error: null },
      profiles: { data: { qc_role: null, qc_enabled: false, is_global_admin: true }, error: null },
    })
    await expect(accessKindForUser(admin, USER)).resolves.toBe('staff')
  })

  it('a disabled account with an enabled staff profile is none', async () => {
    const { admin } = fakeAdmin({
      user_profiles: { data: { user_type: 'internal', status: 'disabled' }, error: null },
      profiles: { data: { qc_role: 'global_admin', qc_enabled: true, is_global_admin: true }, error: null },
    })
    await expect(accessKindForUser(admin, USER)).resolves.toBe('none')
  })

  it('an active external with no profile is external; no rows at all is none', async () => {
    const external = fakeAdmin({
      user_profiles: { data: { user_type: 'external', status: 'active' }, error: null },
      profiles: { data: null, error: null },
    })
    await expect(accessKindForUser(external.admin, USER)).resolves.toBe('external')
    const nobody = fakeAdmin({})
    await expect(accessKindForUser(nobody.admin, USER)).resolves.toBe('none')
  })

  it('fails closed: a failed user_profiles read throws instead of deciding', async () => {
    const { admin } = fakeAdmin({
      user_profiles: { data: null, error: { message: 'boom' } },
      profiles: { data: { qc_role: 'lab_personnel', qc_enabled: true }, error: null },
    })
    await expect(accessKindForUser(admin, USER)).rejects.toThrow(/access kind: user_profiles read failed/)
  })

  it('fails closed: a failed profiles read throws instead of deciding', async () => {
    const { admin } = fakeAdmin({
      user_profiles: { data: { user_type: 'external', status: 'active' }, error: null },
      profiles: { data: null, error: { message: 'boom' } },
    })
    await expect(accessKindForUser(admin, USER)).rejects.toThrow(/access kind: profiles read failed/)
  })
})

describe('parseAccessKind', () => {
  it('accepts the three kinds and maps anything else to none', () => {
    expect(parseAccessKind('staff')).toBe('staff')
    expect(parseAccessKind('external')).toBe('external')
    expect(parseAccessKind('admin')).toBe('none')
    expect(parseAccessKind(null)).toBe('none')
  })
})

describe('resolveLandingPath', () => {
  it('lands each kind on its home', () => {
    expect(resolveLandingPath('external')).toBe('/portal')
    expect(resolveLandingPath('staff')).toBe('/dashboard')
    expect(resolveLandingPath('none')).toBe('/auth/no-access')
  })
})
