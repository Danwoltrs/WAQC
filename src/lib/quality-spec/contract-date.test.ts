import { describe, it, expect } from 'vitest'
import { parseContractDate, contractDatesOf, CONTRACT_DATE_ERROR } from './contract-date'

describe('parseContractDate', () => {
  it('accepts a real calendar date', () => {
    expect(parseContractDate('2026-08-15')).toEqual({ ok: true, value: '2026-08-15' })
    expect(parseContractDate('2028-02-29')).toEqual({ ok: true, value: '2028-02-29' })
  })

  it('reads null, undefined and empty as a cleared date', () => {
    expect(parseContractDate(null)).toEqual({ ok: true, value: null })
    expect(parseContractDate(undefined)).toEqual({ ok: true, value: null })
    expect(parseContractDate('')).toEqual({ ok: true, value: null })
    expect(parseContractDate('  ')).toEqual({ ok: true, value: null })
  })

  it('rejects another format, an impossible date and a non-string', () => {
    for (const bad of ['15/08/2026', '2026-8-15', '2026-02-30', '2026-13-01', '2027-02-29', '2026-08-15T00:00:00Z', 20260815, {}]) {
      expect(parseContractDate(bad)).toEqual({ ok: false })
    }
  })

  it('names the format in its error', () => {
    expect(CONTRACT_DATE_ERROR).toBe('Contract date must be YYYY-MM-DD')
  })
})

describe('contractDatesOf', () => {
  it('normalises the rows that name a date and leaves the rest untouched', () => {
    const plain = { buyer_contract_nr: 'C' }
    const res = contractDatesOf([{ contract_date: '2026-08-15' }, { contract_date: '' }, plain])
    expect(res).toEqual({ ok: true, contracts: [{ contract_date: '2026-08-15' }, { contract_date: null }, plain] })
    if (res.ok) expect(res.contracts![2]).toBe(plain)
  })

  it('fails on any bad row', () => {
    expect(contractDatesOf([{ contract_date: '2026-08-15' }, { contract_date: '15/08/2026' }])).toEqual({ ok: false })
  })

  it('passes a body without contracts', () => {
    expect(contractDatesOf(undefined)).toEqual({ ok: true })
  })
})
