// src/lib/approval-notification/contract-resolver.test.ts
import { describe, it, expect } from 'vitest'
import { acceptFkRow, contractLookup, pickContract } from './contract-resolver'

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

describe('acceptFkRow', () => {
  // Prod 2026-08-24: SAN-00609/26 carried wolthers_contract_nr 41868/26 while its
  // contract_id pointed at 41869/26. Following the FK wrote the approved PSS onto
  // 41869/26, so 41868/26 read a red "request sample" with an approved PSS in hand.
  it('refuses a FK row whose contract_number contradicts the sample number', () => {
    expect(acceptFkRow(
      { id: 'c-41869', contract_number: '41869/26' },
      { contract_id: 'c-41869', wolthers_contract_nr: '41868/26' },
    )).toBeNull()
  })
  it('accepts a FK row that agrees with the sample number', () => {
    const row = { id: 'c-41868', contract_number: '41868/26' }
    expect(acceptFkRow(row, { contract_id: 'c-41868', wolthers_contract_nr: '41868/26' })).toEqual(row)
  })
  it('accepts when the sample carries no number to contradict the FK', () => {
    const row = { id: 'c-1', contract_number: '41868/26' }
    expect(acceptFkRow(row, { contract_id: 'c-1', wolthers_contract_nr: null })).toEqual(row)
  })
  it('accepts when the FK row carries no number', () => {
    const row = { id: 'c-1', contract_number: null }
    expect(acceptFkRow(row, { contract_id: 'c-1', wolthers_contract_nr: '41868/26' })).toEqual(row)
  })
  it('ignores surrounding whitespace on both sides', () => {
    const row = { id: 'c-1', contract_number: ' 41868/26 ' }
    expect(acceptFkRow(row, { contract_id: 'c-1', wolthers_contract_nr: '41868/26' })).toEqual(row)
  })
  it('returns null for a missing row', () => {
    expect(acceptFkRow(undefined, { contract_id: 'c-1', wolthers_contract_nr: '41868/26' })).toBeNull()
  })
})
