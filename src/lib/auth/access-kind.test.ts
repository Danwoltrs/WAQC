import { describe, expect, it } from 'vitest'
import { classifyAccessKind, parseAccessKind, resolveLandingPath } from './access-kind'

describe('classifyAccessKind (mirrors SQL waqc_access_kind)', () => {
  const k = (userType: string | null, qcRole: string | null, qcEnabled: boolean | null) =>
    classifyAccessKind({ userType, qcRole, qcEnabled })
  it('staff comes first: an external row does not demote an enabled staff role', () => {
    expect(k('external', 'lab_personnel', true)).toBe('staff')
    expect(k('internal', 'lab_personnel', true)).toBe('staff')
    expect(k(null, 'global_admin', true)).toBe('staff')
  })
  it('a staff role that is not enabled is not staff', () => {
    expect(k('external', 'lab_personnel', false)).toBe('external')
    expect(k('external', 'lab_personnel', null)).toBe('external')
    expect(k(null, 'lab_personnel', false)).toBe('none')
    expect(k(null, 'lab_personnel', null)).toBe('none')
  })
  it('external with no profile is external', () => {
    expect(k('external', null, null)).toBe('external')
  })
  it('no role, or a client role, without an external row is none', () => {
    expect(k('internal', 'client', true)).toBe('none')
    expect(k('internal', null, null)).toBe('none')
    expect(k('co_broker', null, null)).toBe('none')
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
