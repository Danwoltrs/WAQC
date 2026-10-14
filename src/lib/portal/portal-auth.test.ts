// src/lib/portal/portal-auth.test.ts
import { describe, it, expect } from 'vitest'
import { isClientRole } from './portal-auth'

describe('isClientRole', () => {
  it('is true only for the client role', () => {
    expect(isClientRole('client')).toBe(true)
    expect(isClientRole('lab_personnel')).toBe(false)
    expect(isClientRole(null)).toBe(false)
    expect(isClientRole(undefined)).toBe(false)
  })
})
