import { describe, it, expect } from 'vitest'
import {
  certificatesToTinSampleIds,
  certificatesToBagSleeveEntries,
  type PrintSelectionCertificate,
} from './print-selection'

const cert = (
  sample_id: string | null,
  sample_contract_id: string | null = null,
): PrintSelectionCertificate => ({ sample_id, sample_contract_id })

describe('certificatesToTinSampleIds', () => {
  it('returns one id for a mother certificate', () => {
    expect(certificatesToTinSampleIds([cert('s1')])).toEqual(['s1'])
  })

  it('collapses a mother and its splits to one id (one tin covers the lot)', () => {
    const selection = [cert('s1'), cert('s1', 'c1'), cert('s1', 'c2'), cert('s1', 'c3')]
    expect(certificatesToTinSampleIds(selection)).toEqual(['s1'])
  })

  it('collapses splits to their lot even when the mother is not selected', () => {
    expect(certificatesToTinSampleIds([cert('s1', 'c1'), cert('s1', 'c2')])).toEqual(['s1'])
  })

  it('keeps one id per lot, in first-seen order, across lots', () => {
    const selection = [cert('s2', 'c9'), cert('s1'), cert('s2'), cert('s1', 'c1')]
    expect(certificatesToTinSampleIds(selection)).toEqual(['s2', 's1'])
  })

  it('drops certificates with no linked sample', () => {
    expect(certificatesToTinSampleIds([cert(null), cert('s1'), cert(null, 'c1')])).toEqual(['s1'])
  })

  it('returns an empty array for an empty selection', () => {
    expect(certificatesToTinSampleIds([])).toEqual([])
  })
})

describe('certificatesToBagSleeveEntries', () => {
  it('maps a mother certificate to an entry with no contractId', () => {
    expect(certificatesToBagSleeveEntries([cert('s1')], true)).toEqual([
      { id: 's1', includeQrCode: true },
    ])
  })

  it('maps a split certificate to an entry carrying its contractId', () => {
    expect(certificatesToBagSleeveEntries([cert('s1', 'c1')], true)).toEqual([
      { id: 's1', contractId: 'c1', includeQrCode: true },
    ])
  })

  it('does NOT collapse a mother and its splits — each gets its own sleeve', () => {
    const selection = [cert('s1'), cert('s1', 'c1'), cert('s1', 'c2')]
    expect(certificatesToBagSleeveEntries(selection, true)).toEqual([
      { id: 's1', includeQrCode: true },
      { id: 's1', contractId: 'c1', includeQrCode: true },
      { id: 's1', contractId: 'c2', includeQrCode: true },
    ])
  })

  it('applies includeQrCode across the whole batch', () => {
    const selection = [cert('s1'), cert('s1', 'c1')]
    expect(certificatesToBagSleeveEntries(selection, false)).toEqual([
      { id: 's1', includeQrCode: false },
      { id: 's1', contractId: 'c1', includeQrCode: false },
    ])
  })

  it('drops certificates with no linked sample', () => {
    expect(certificatesToBagSleeveEntries([cert(null), cert('s1')], true)).toEqual([
      { id: 's1', includeQrCode: true },
    ])
  })

  it('deduplicates a lot/contract pair listed twice', () => {
    const selection = [cert('s1', 'c1'), cert('s1', 'c1')]
    expect(certificatesToBagSleeveEntries(selection, true)).toEqual([
      { id: 's1', contractId: 'c1', includeQrCode: true },
    ])
  })
})
