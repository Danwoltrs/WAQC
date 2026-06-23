// src/lib/portal/portal-contracts.test.ts
import { describe, it, expect } from 'vitest'
import { groupSamplesByContract } from './portal-contracts'

describe('groupSamplesByContract', () => {
  it('groups samples by contract number with status rollups and distinct origins', () => {
    const out = groupSamplesByContract([
      { wolthers_contract_nr: '4220', status: 'approved', origin: 'Brazil' },
      { wolthers_contract_nr: '4220', status: 'rejected', origin: 'Brazil' },
      { wolthers_contract_nr: '4231', status: 'received', origin: 'Colombia' },
    ])
    expect(out).toEqual([
      { contractNumber: '4220', sampleCount: 2, approved: 1, rejected: 1, pending: 0, origins: ['Brazil'] },
      { contractNumber: '4231', sampleCount: 1, approved: 0, rejected: 0, pending: 1, origins: ['Colombia'] },
    ])
  })

  it('buckets samples without a contract number under "Unassigned"', () => {
    const out = groupSamplesByContract([{ wolthers_contract_nr: null, status: 'approved', origin: 'Peru' }])
    expect(out[0].contractNumber).toBe('Unassigned')
  })
})
