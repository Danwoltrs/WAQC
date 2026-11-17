import { describe, it, expect } from 'vitest'
import { parseProfileInput, profileDbError } from './profile-input'

describe('parseProfileInput', () => {
  it('requires a name on create', () => {
    expect(parseProfileInput({ name: ' ' }, false)).toEqual({ ok: false, error: 'Name is required' })
  })
  it('on a partial update returns only the keys present', () => {
    expect(parseProfileInput({ is_active: false }, true)).toEqual({ ok: true, fields: { is_active: false } })
  })
  it('trims text and nulls blanks', () => {
    const r = parseProfileInput({ name: ' A ', origin: ' ', region: ' R ' }, false)
    expect(r.ok && r.fields).toMatchObject({ name: 'A', origin: null, region: 'R', description: null, notes: [] })
  })
})

describe('profileDbError', () => {
  it('maps known codes', () => {
    expect(profileDbError('23505')?.status).toBe(409)
    expect(profileDbError('42501')?.status).toBe(403)
    expect(profileDbError('XX000')).toBeNull()
  })
})
