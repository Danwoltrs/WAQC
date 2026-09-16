import { describe, it, expect } from 'vitest'
import { contractDisplayNumber, contractFamily } from './contract-family'

/**
 * sys links a contract split into separate contracts through
 * contracts.parent_contract_id: a suffix family shares one base number
 * (42089/26A, /26B, /26C) or a sibling gets a fresh number. A physical sample
 * registered against one member covers the others too, so intake proposes them.
 */
const parent = { id: 'p', contract_number: '42089/26', split_suffix: 'A', status: 'active', parent_contract_id: null }
const childB = { id: 'b', contract_number: '42089/26', split_suffix: 'B', status: 'active', parent_contract_id: 'p' }
const childC = { id: 'c', contract_number: '42089/26', split_suffix: 'C', status: 'active', parent_contract_id: 'p' }
const cancelled = { id: 'x', contract_number: '42089/26', split_suffix: 'D', status: 'cancelled', parent_contract_id: 'p' }
const stranger = { id: 's', contract_number: '42090/26', split_suffix: null, status: 'active', parent_contract_id: null }

describe('contractDisplayNumber', () => {
  it('prints the suffix after the year, and nothing when there is none', () => {
    expect(contractDisplayNumber(childB)).toBe('42089/26B')
    expect(contractDisplayNumber(stranger)).toBe('42090/26')
  })
})

describe('contractFamily', () => {
  it('from the parent: its active children, in order', () => {
    expect(contractFamily(parent, [childC, cancelled, childB, stranger]).map((m) => m.id)).toEqual(['b', 'c'])
  })
  it('from a child: the parent and the other active children, never itself', () => {
    expect(contractFamily(childB, [parent, childB, childC, cancelled]).map((m) => m.id)).toEqual(['p', 'c'])
  })
  it('a standalone contract has no family', () => {
    expect(contractFamily(stranger, [parent, childB])).toEqual([])
  })
  it('says what each member is to the linked contract', () => {
    expect(contractFamily(childB, [parent, childC]).map((m) => m.relation)).toEqual(['parent', 'sibling'])
    expect(contractFamily(parent, [childB]).map((m) => m.relation)).toEqual(['child'])
  })
})
