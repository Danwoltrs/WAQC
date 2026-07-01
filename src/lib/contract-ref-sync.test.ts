import { describe, it, expect } from 'vitest'
import { chooseUniqueContractRefs, refDiffers } from './contract-ref-sync'

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
