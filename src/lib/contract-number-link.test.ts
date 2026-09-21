import { describe, it, expect } from 'vitest'
import { baseNumberOf, pickContractForNumber } from './contract-number-link'

// The rule a corrected Wolthers number follows on edit, the same one intake
// applies: exactly one live contract by number links; a split family's bare
// number keeps the member the sample already sits on; anything else unlinks.
const c = (id: string, contract_number: string, split_suffix: string | null = null, status = 'active') =>
  ({ id, contract_number, split_suffix, status })
const solo = c('c-1', '41871/26')
const dead = c('c-x', '41871/26', null, 'cancelled')
const A = c('c-a', '42089/26', 'A')
const B = c('c-b', '42089/26', 'B')
const C = c('c-c', '42089/26', 'C')

describe('baseNumberOf', () => {
  it('strips one family letter after the year, and nothing else', () => {
    expect(baseNumberOf('42089/26B')).toBe('42089/26')
    expect(baseNumberOf(' 42089/26b ')).toBe('42089/26')
    expect(baseNumberOf('42089/26')).toBeNull()
    expect(baseNumberOf('41871')).toBeNull()
  })
})

describe('pickContractForNumber', () => {
  it('links the one live contract carrying the number, ignoring a cancelled twin', () => {
    expect(pickContractForNumber([solo, dead], '41871/26', null).contractId).toBe('c-1')
  })
  it('links the member of a split family by its printed number', () => {
    expect(pickContractForNumber([A, B, C], '42089/26C', 'c-a').contractId).toBe('c-c')
  })
  it('keeps the current member when only the family number is given', () => {
    expect(pickContractForNumber([A, B, C], '42089/26', 'c-b').contractId).toBe('c-b')
  })
  it('unlinks on a family number when the sample sits on none of its members', () => {
    expect(pickContractForNumber([A, B, C], '42089/26', 'c-1').contractId).toBeNull()
    expect(pickContractForNumber([A, B, C], '42089/26', null).contractId).toBeNull()
  })
  it('unlinks on a number no live contract carries', () => {
    expect(pickContractForNumber([dead], '41871/26', 'c-x').contractId).toBeNull()
    expect(pickContractForNumber([solo], '99999/26', 'c-1').contractId).toBeNull()
  })
  it('reads the number case- and whitespace-insensitively', () => {
    expect(pickContractForNumber([A, B, C], ' 42089/26b ', null).contractId).toBe('c-b')
  })
})
