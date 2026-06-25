import { describe, it, expect } from 'vitest'
import { sanitizeOrTerm, buildOrIlike } from './or-filter'

describe('sanitizeOrTerm', () => {
  it('strips PostgREST delimiters and ILIKE wildcards', () => {
    expect(sanitizeOrTerm('ab%c_(d),e')).toBe('abcde')
  })
  it('trims surrounding whitespace', () => {
    expect(sanitizeOrTerm('  42305  ')).toBe('42305')
  })
})

describe('buildOrIlike', () => {
  it('builds a comma-joined ilike expression for each field', () => {
    expect(buildOrIlike(['tracking_number', 'wolthers_contract_nr'], 'abc')).toBe(
      'tracking_number.ilike.%abc%,wolthers_contract_nr.ilike.%abc%'
    )
  })
})
