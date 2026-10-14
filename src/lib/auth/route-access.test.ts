import { describe, expect, it } from 'vitest'
import { decideRouteAccess, isApiPath, isPublicDocument, isPublicRoute, safeNextPath } from './route-access'

const allow = { action: 'allow' }
const deny = { action: 'deny', status: 403 }
const to = (path: string) => ({ action: 'redirect', to: path })

describe('isPublicRoute', () => {
  it('keeps today\'s public routes and adds the two new auth pages', () => {
    for (const p of ['/', '/auth/callback', '/auth/accept-invite', '/auth/portal-invite', '/auth/no-access',
      '/api/samples', '/certificate/SAG-1-26', '/embed/quadrant/1']) {
      expect(isPublicRoute(p)).toBe(true)
    }
    expect(isPublicRoute('/dashboard')).toBe(false)
    expect(isPublicRoute('/portal')).toBe(false)
  })
})

describe('decideRouteAccess', () => {
  it('not signed in: public allowed, the rest goes to sign-in', () => {
    expect(decideRouteAccess('/api/portal/accept', null)).toEqual(allow)
    expect(decideRouteAccess('/auth/portal-invite', null)).toEqual(allow)
    expect(decideRouteAccess('/dashboard', null)).toEqual(to('/'))
    expect(decideRouteAccess('/portal', null)).toEqual(to('/'))
  })

  it('staff: everything', () => {
    for (const p of ['/', '/dashboard', '/portal', '/api/samples', '/api/portal/me']) {
      expect(decideRouteAccess(p, 'staff')).toEqual(allow)
    }
  })

  it('external: portal, auth and public certificates only', () => {
    for (const p of ['/portal', '/portal/team', '/api/portal/samples', '/auth/no-access', '/certificate/X', '/api/certificate/X/pdf', '/embed/a']) {
      expect(decideRouteAccess(p, 'external')).toEqual(allow)
    }
    expect(decideRouteAccess('/', 'external')).toEqual(to('/portal'))
    expect(decideRouteAccess('/dashboard', 'external')).toEqual(to('/portal'))
    expect(decideRouteAccess('/portalx', 'external')).toEqual(to('/portal'))
    expect(decideRouteAccess('/api/samples', 'external')).toEqual(deny)
    expect(decideRouteAccess('/api/cupping/scores/aggregate', 'external')).toEqual(deny)
    expect(decideRouteAccess('/api/portalx', 'external')).toEqual(deny)
    expect(decideRouteAccess('/portal/', 'external')).toEqual(allow)
    expect(decideRouteAccess('/auth', 'external')).toEqual(allow)
    expect(decideRouteAccess('/api/embed/quadrant/1', 'external')).toEqual(allow)
    expect(decideRouteAccess('/api/certificates/X', 'external')).toEqual(deny)
  })

  it('none: the no-access page, accepting an invitation and getting a first staff profile', () => {
    for (const p of ['/auth/no-access', '/auth/callback', '/api/portal/accept', '/api/profiles/ensure', '/api/auth/invitation', '/certificate/X']) {
      expect(decideRouteAccess(p, 'none')).toEqual(allow)
    }
    expect(decideRouteAccess('/', 'none')).toEqual(to('/auth/no-access'))
    expect(decideRouteAccess('/portal', 'none')).toEqual(to('/auth/no-access'))
    expect(decideRouteAccess('/api/portal/me', 'none')).toEqual(deny)
    expect(decideRouteAccess('/api/samples', 'none')).toEqual(deny)
    expect(decideRouteAccess('/api/auth/other', 'none')).toEqual(deny)
  })
})

describe('isApiPath / isPublicDocument', () => {
  it('match whole segments only', () => {
    expect(isApiPath('/api')).toBe(true)
    expect(isApiPath('/api/x')).toBe(true)
    expect(isApiPath('/apix')).toBe(false)
    expect(isPublicDocument('/api/certificate/X/pdf')).toBe(true)
    expect(isPublicDocument('/api/certificates/X')).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('keeps same-site paths and drops everything else', () => {
    expect(safeNextPath('/portal/team')).toBe('/portal/team')
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('/\\evil.com')).toBe('/')
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('portal')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })
})
