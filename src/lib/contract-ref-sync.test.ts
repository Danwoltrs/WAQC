import { describe, it, expect } from 'vitest'
import { chooseUniqueContractRefs, refDiffers, matchSysRefsByLink } from './contract-ref-sync'

describe('chooseUniqueContractRefs', () => {
  it('returns the refs when exactly one contract matches', () => {
    expect(chooseUniqueContractRefs([{ seller_reference: '4155261663', buyer_reference: 'IR0007882-1' }]))
      .toEqual({ seller_reference: '4155261663', buyer_reference: 'IR0007882-1' })
  })

  it('returns null when several contracts share the number (never guess)', () => {
    expect(chooseUniqueContractRefs([
      { seller_reference: '111', buyer_reference: 'A' },
      { seller_reference: '222', buyer_reference: 'B' },
    ])).toBeNull()
  })

  it('returns null when nothing matched', () => {
    expect(chooseUniqueContractRefs([])).toBeNull()
    expect(chooseUniqueContractRefs(null)).toBeNull()
  })

  it('coerces missing reference fields to null', () => {
    expect(chooseUniqueContractRefs([{ seller_reference: null as any, buyer_reference: undefined as any }]))
      .toEqual({ seller_reference: null, buyer_reference: null })
  })
})

describe('refDiffers', () => {
  it('is true when the stored value is stale', () => {
    expect(refDiffers('4155261514', '4155261663')).toBe(true)
  })

  it('is false when values match (ignoring surrounding whitespace)', () => {
    expect(refDiffers('4155261663', '  4155261663 ')).toBe(false)
  })

  it('never blanks out a stored ref when sys has no value', () => {
    expect(refDiffers('4155261663', null)).toBe(false)
    expect(refDiffers('4155261663', '   ')).toBe(false)
  })

  it('fills in an empty stored ref from sys', () => {
    expect(refDiffers(null, '4155261663')).toBe(true)
    expect(refDiffers('', '4155261663')).toBe(true)
  })
})

describe('matchSysRefsByLink', () => {
  const refs = (s: string | null, b: string | null) => ({ seller_reference: s, buyer_reference: b })

  it('prefers the contract FK over the number', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: 'c1', contractNumber: '41912/26' }],
      new Map([['c1', refs('BY-ID', 'B1')]]),
      new Map([['41912/26', [refs('BY-NUMBER', 'B2')]]]),
    )
    expect(m.get('k1')?.seller_reference).toBe('BY-ID')
  })

  it('resolves by number when the FK is missing or unmatched', () => {
    const m = matchSysRefsByLink(
      [{ key: 'k1', contractId: null, contractNumber: '41913/26' }],
      new Map(),
      new Map([['41913/26', [refs('4155261412', 'IR0007546-1')]]]),
    )
    expect(m.get('k1')).toEqual(refs('4155261412', 'IR0007546-1'))
  })

  it('refuses to guess when a number is ambiguous or absent', () => {
    const m = matchSysRefsByLink(
      [
        { key: 'dup', contractNumber: '41912/26' },
        { key: 'none', contractNumber: null },
      ],
      new Map(),
      new Map([['41912/26', [refs('A', null), refs('B', null)]]]),
    )
    expect(m.has('dup')).toBe(false)
    expect(m.has('none')).toBe(false)
  })

  it('keys a mother and its split separately', () => {
    const m = matchSysRefsByLink(
      [
        { key: 's1', contractNumber: '41912/26' },
        { key: 's1:sub1', contractNumber: '41913/26' },
      ],
      new Map(),
      new Map([
        ['41912/26', [refs('4155261411', 'IR0007545-1')]],
        ['41913/26', [refs('4155261412', 'IR0007546-1')]],
      ]),
    )
    expect(m.get('s1')?.seller_reference).toBe('4155261411')
    expect(m.get('s1:sub1')?.seller_reference).toBe('4155261412')
  })
})
