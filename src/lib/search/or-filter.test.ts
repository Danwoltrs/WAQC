import { describe, it, expect } from 'vitest'
import { sanitizeOrTerm, buildOrIlike, quoteOrValue, buildOrEq } from './or-filter'

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

describe('quoteOrValue / buildOrEq', () => {
  it('quotes the value so PostgREST delimiters inside it are literal', () => {
    expect(quoteOrValue('HASU 155.201-6')).toBe('"HASU 155.201-6"')
    expect(quoteOrValue('a,b(c)')).toBe('"a,b(c)"')
  })

  it('escapes quotes and backslashes rather than letting them close the value', () => {
    expect(quoteOrValue('say "hi"')).toBe('"say \\"hi\\""')
    expect(quoteOrValue('back\\slash')).toBe('"back\\\\slash"')
  })

  it('keeps wildcards literal — an exact match must not become a pattern', () => {
    expect(quoteOrValue('100%_pure')).toBe('"100%_pure"')
  })

  it('builds one eq term per column', () => {
    expect(buildOrEq(['container_nr', 'ico_number'], '002/1649/0185')).toBe(
      'container_nr.eq."002/1649/0185",ico_number.eq."002/1649/0185"'
    )
  })
})
