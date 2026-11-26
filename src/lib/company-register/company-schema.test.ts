import { describe, expect, it } from 'vitest'
import { addressLines, addressPatch, companyPatchSchema, COMPANY_COLUMNS } from './company-schema'

const D = { street: 'Rua A', street_number: '10', neighbourhood: 'Centro', city: 'Santos', state: 'SP', zip_code: '11010-000' }

describe('companyPatchSchema address', () => {
  it('takes the columns sys uses and rejects the legacy address column', () => {
    const ok = companyPatchSchema.safeParse({ street: ' Rua A ', street_number: '10', neighbourhood: '', city: 'Santos' })
    expect(ok.success && ok.data).toMatchObject({ street: 'Rua A', street_number: '10', neighbourhood: null, city: 'Santos' })
    expect(companyPatchSchema.safeParse({ address: 'Rua A, 10' }).success).toBe(false)
  })
  it('keeps to the column lengths (country and state varchar(50), city varchar(100))', () => {
    expect(companyPatchSchema.safeParse({ country: 'x'.repeat(51) }).success).toBe(false)
    expect(companyPatchSchema.safeParse({ state: 'x'.repeat(51) }).success).toBe(false)
    expect(companyPatchSchema.safeParse({ city: 'x'.repeat(101) }).success).toBe(false)
    expect(companyPatchSchema.safeParse({ city: 'x'.repeat(100) }).success).toBe(true)
  })
  it('reads street, number and neighbourhood (and the legacy address for the fallback)', () => {
    const cols = COMPANY_COLUMNS.split(',').map((c) => c.trim())
    expect(cols).toEqual(expect.arrayContaining(['street', 'street_number', 'neighbourhood', 'address', 'city', 'state', 'zip_code']))
  })
})

describe('addressPatch', () => {
  it('Brazil sends the number as its own column', () => {
    expect(addressPatch(D, true)).toEqual(D)
  })
  it('outside Brazil folds a number into the street and clears the number', () => {
    expect(addressPatch(D, false)).toEqual({ ...D, street: 'Rua A, 10', street_number: null })
  })
  it('does not repeat a number the street already holds', () => {
    expect(addressPatch({ ...D, street: 'Rua A 10' }, false)).toMatchObject({ street: 'Rua A 10', street_number: null })
    expect(addressPatch({ ...D, street: '', street_number: '7' }, false)).toMatchObject({ street: '7', street_number: null })
  })
  it('only returns address keys', () => {
    expect(Object.keys(addressPatch({ ...D, name: 'X' } as any, true)).sort()).toEqual(
      ['city', 'neighbourhood', 'state', 'street', 'street_number', 'zip_code'],
    )
  })
})

describe('addressLines', () => {
  const C = { ...D, address: null }
  it('street and number, neighbourhood, then city state zip', () => {
    expect(addressLines(C)).toEqual(['Rua A, 10', 'Centro', 'Santos, SP, 11010-000'])
  })
  it('the legacy address only when street is empty', () => {
    expect(addressLines({ ...C, address: 'Old 1' })).toEqual(['Rua A, 10', 'Centro', 'Santos, SP, 11010-000'])
    expect(addressLines({ ...C, street: null, street_number: null, neighbourhood: null, address: 'Old 1' }))
      .toEqual(['Old 1', 'Santos, SP, 11010-000'])
  })
})
