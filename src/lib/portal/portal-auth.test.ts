// src/lib/portal/portal-auth.test.ts
import { describe, it, expect } from 'vitest'
import { isClientRole, resolveLandingPath } from './portal-auth'

describe('isClientRole', () => {
  it('is true only for the client role', () => {
    expect(isClientRole('client')).toBe(true)
    expect(isClientRole('lab_personnel')).toBe(false)
    expect(isClientRole(null)).toBe(false)
    expect(isClientRole(undefined)).toBe(false)
  })
})

describe('resolveLandingPath', () => {
  it('sends clients to /portal and everyone else to /dashboard', () => {
    expect(resolveLandingPath('client')).toBe('/portal')
    expect(resolveLandingPath('lab_personnel')).toBe('/dashboard')
    expect(resolveLandingPath(null)).toBe('/dashboard')
  })
})
