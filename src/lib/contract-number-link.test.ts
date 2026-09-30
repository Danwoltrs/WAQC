import { describe, it, expect } from 'vitest'
import { baseNumberOf, contractIdForWrite, pickContractForNumber } from './contract-number-link'

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

// A write that carries both a contract_id and a Wolthers number never stores
// the two contradicting each other. Prod 2026-09-16: SAN-00954/26 was picked
// onto 41865/26 and its number typed as 41871/26; the sys mirror had filed it
// on 41865/26 and the rejection followed the FK there.
describe('contractIdForWrite', () => {
  const k65 = c('c-41865', '41865/26')
  const k71 = c('c-41871', '41871/26')
  const fakeDb = (rows: ReturnType<typeof c>[]) => ({
    from: () => {
      const filters: Array<(r: ReturnType<typeof c>) => boolean> = []
      const chain: any = {
        select: () => chain,
        eq: (col: string, v: unknown) => { filters.push((r: any) => r[col] === v); return chain },
        in: (col: string, vs: unknown[]) => { filters.push((r: any) => vs.includes(r[col])); return chain },
        maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(ok),
      }
      return chain
    },
  })

  it('keeps a link its number agrees with, a split member by its printed number included', async () => {
    expect(await contractIdForWrite(fakeDb([k65, k71]) as any, { contract_id: 'c-41871', wolthers_contract_nr: '41871/26' })).toBe('c-41871')
    expect(await contractIdForWrite(fakeDb([A, B, C]) as any, { contract_id: 'c-b', wolthers_contract_nr: '42089/26B' })).toBe('c-b')
    expect(await contractIdForWrite(fakeDb([A, B, C]) as any, { contract_id: 'c-b', wolthers_contract_nr: '42089/26' })).toBe('c-b')
  })
  it('replaces a link the number contradicts with the contract the number names', async () => {
    expect(await contractIdForWrite(fakeDb([k65, k71]) as any, { contract_id: 'c-41865', wolthers_contract_nr: '41871/26' })).toBe('c-41871')
    expect(await contractIdForWrite(fakeDb([A, B, C]) as any, { contract_id: 'c-a', wolthers_contract_nr: '42089/26C' })).toBe('c-c')
  })
  it('drops a contradicted link when the number names no single live contract', async () => {
    expect(await contractIdForWrite(fakeDb([k65]) as any, { contract_id: 'c-41865', wolthers_contract_nr: '41871/26' })).toBeNull()
    expect(await contractIdForWrite(fakeDb([k65, A, B]) as any, { contract_id: 'c-41865', wolthers_contract_nr: '42089/26' })).toBeNull()
  })
  it('leaves a write with no number, or no link, as it came', async () => {
    expect(await contractIdForWrite(fakeDb([k65]) as any, { contract_id: 'c-41865', wolthers_contract_nr: '  ' })).toBe('c-41865')
    expect(await contractIdForWrite(fakeDb([k65, k71]) as any, { contract_id: null, wolthers_contract_nr: '41871/26' })).toBeNull()
  })
  it('keeps a link whose contract it cannot read: no contradiction is proven', async () => {
    expect(await contractIdForWrite(fakeDb([k71]) as any, { contract_id: 'c-hidden', wolthers_contract_nr: '41871/26' })).toBe('c-hidden')
  })
})
