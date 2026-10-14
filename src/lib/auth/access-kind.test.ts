import { describe, expect, it } from 'vitest'
import { classifyAccessKind, parseAccessKind, resolveLandingPath } from './access-kind'

describe('classifyAccessKind (mirrors SQL waqc_access_kind)', () => {
  it('external always wins', () => {
    expect(classifyAccessKind({ userType: 'external', qcRole: 'global_admin' })).toBe('external')
  })
  it('a staff role makes staff', () => {
    expect(classifyAccessKind({ userType: 'internal', qcRole: 'lab_personnel' })).toBe('staff')
    expect(classifyAccessKind({ userType: null, qcRole: 'global_admin' })).toBe('staff')
  })
  it('no role, or a client role, is none', () => {
    expect(classifyAccessKind({ userType: 'internal', qcRole: null })).toBe('none')
    expect(classifyAccessKind({ userType: null, qcRole: 'client' })).toBe('none')
    expect(classifyAccessKind({ userType: 'co_broker', qcRole: null })).toBe('none')
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
