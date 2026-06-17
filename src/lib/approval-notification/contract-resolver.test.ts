// src/lib/approval-notification/contract-resolver.test.ts
import { describe, it, expect } from 'vitest'
import { contractLookup, pickContract } from './contract-resolver'

describe('contractLookup', () => {
  it('prefers contract_id when present', () => {
    expect(contractLookup({ contract_id: 'k1', wolthers_contract_nr: '41423/25' }))
      .toEqual({ column: 'id', value: 'k1' })
  })
  it('falls back to the wolthers number when contract_id is null', () => {
    expect(contractLookup({ contract_id: null, wolthers_contract_nr: '41423/25' }))
      .toEqual({ column: 'contract_number', value: '41423/25' })
  })
  it('matches a number with a QC suffix verbatim', () => {
    expect(contractLookup({ contract_id: null, wolthers_contract_nr: '42066/26QC' }))
      .toEqual({ column: 'contract_number', value: '42066/26QC' })
  })
  it('returns null when there is no contract reference at all', () => {
    expect(contractLookup({ contract_id: null, wolthers_contract_nr: null })).toBeNull()
  })
})

describe('pickContract', () => {
  it('returns null for no rows', () => {
    expect(pickContract([])).toBeNull()
  })
  it('returns the only row', () => {
    expect(pickContract([{ id: 'a' }])).toEqual({ id: 'a' })
  })
  it('deterministically picks the lexically-greatest id on multiple matches', () => {
    expect(pickContract([{ id: 'a' }, { id: 'c' }, { id: 'b' }])).toEqual({ id: 'c' })
  })
  it('prefers a status:active row over a non-active one even when the active row has a lexically-smaller id', () => {
    expect(pickContract([{ id: 'a', status: 'active' }, { id: 'z', status: 'superseded' }])).toEqual({ id: 'a', status: 'active' })
  })
  it('among multiple active rows, prefers the most recent updated_at', () => {
    expect(pickContract([
      { id: 'a', status: 'active', updated_at: '2026-01-01' },
      { id: 'b', status: 'active', updated_at: '2026-06-01' },
    ])).toEqual({ id: 'b', status: 'active', updated_at: '2026-06-01' })
  })
})
