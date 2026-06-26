// Test runner: npx vitest run src/lib/approval-notification/initials.test.ts

import { describe, it, expect } from 'vitest'
import { initialsFromProfile } from './initials'

describe('initialsFromProfile', () => {
  it('first+last preferred over full_name', () => {
    expect(initialsFromProfile({ first_name: 'Anderson', last_name: 'Nascimento', full_name: 'Anderson' })).toBe('AN')
  })

  it('falls back to full_name when first/last are null', () => {
    expect(initialsFromProfile({ first_name: null, last_name: null, full_name: 'Maria Silva' })).toBe('MS')
  })

  it('single name yields single initial', () => {
    expect(initialsFromProfile({ first_name: 'Cher', last_name: null, full_name: null })).toBe('C')
  })

  it('all null/empty yields null', () => {
    expect(initialsFromProfile({ first_name: null, last_name: null, full_name: null })).toBeNull()
  })
})
