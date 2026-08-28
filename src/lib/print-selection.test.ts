import { describe, it, expect } from 'vitest'
import {
  certificatesToTinSampleIds,
  certificatesToBagSleeveEntries,
  type PrintSelectionCertificate,
} from './print-selection'

/** A certificate on a lab unit (`labSource` null) or on a contract sibling that points at one. */
const cert = (
  sample_id: string | null,
  labSource: string | null = null,
): PrintSelectionCertificate => ({
  sample_id,
  sample: sample_id ? { lab_source_sample_id: labSource } : null,
})

describe('certificatesToTinSampleIds', () => {
  it('returns one id for a lab-unit certificate', () => {
    expect(certificatesToTinSampleIds([cert('s1')])).toEqual(['s1'])
  })

  it('collapses a lab unit and its siblings to the lab unit (one tin covers the lot)', () => {
    const selection = [cert('s1'), cert('s2', 's1'), cert('s3', 's1'), cert('s4', 's1')]
    expect(certificatesToTinSampleIds(selection)).toEqual(['s1'])
  })

  it('collapses siblings to their lab unit even when the lab unit is not selected', () => {
    expect(certificatesToTinSampleIds([cert('s2', 's1'), cert('s3', 's1')])).toEqual(['s1'])
  })

  it('keeps one id per lot, in first-seen order, across lots', () => {
    const selection = [cert('s9', 's2'), cert('s1'), cert('s2'), cert('s5', 's1')]
    expect(certificatesToTinSampleIds(selection)).toEqual(['s2', 's1'])
  })

  it('treats a certificate row without an embedded sample as a lab unit', () => {
    // A caller that did not embed `sample` still gets one tin per sample id.
    expect(certificatesToTinSampleIds([{ sample_id: 's1', sample: null }, { sample_id: 's1' }])).toEqual(['s1'])
  })

  it('drops certificates with no linked sample', () => {
    expect(certificatesToTinSampleIds([cert(null), cert('s1'), cert(null, 's1')])).toEqual(['s1'])
  })

  it('returns an empty array for an empty selection', () => {
    expect(certificatesToTinSampleIds([])).toEqual([])
  })
})

describe('certificatesToBagSleeveEntries', () => {
  it('maps a lab-unit certificate to an entry on its sample', () => {
    expect(certificatesToBagSleeveEntries([cert('s1')], true)).toEqual([
      { id: 's1', includeQrCode: true },
    ])
  })

  it('maps a sibling certificate to an entry on the SIBLING, not its lab unit', () => {
    expect(certificatesToBagSleeveEntries([cert('s2', 's1')], true)).toEqual([
      { id: 's2', includeQrCode: true },
    ])
  })

  it('does NOT collapse a lab unit and its siblings — each certificate gets its own sleeve', () => {
    const selection = [cert('s1'), cert('s2', 's1'), cert('s3', 's1')]
    expect(certificatesToBagSleeveEntries(selection, true)).toEqual([
      { id: 's1', includeQrCode: true },
      { id: 's2', includeQrCode: true },
      { id: 's3', includeQrCode: true },
    ])
  })

  it('applies includeQrCode across the whole batch', () => {
    const selection = [cert('s1'), cert('s2', 's1')]
    expect(certificatesToBagSleeveEntries(selection, false)).toEqual([
      { id: 's1', includeQrCode: false },
      { id: 's2', includeQrCode: false },
    ])
  })

  it('drops certificates with no linked sample', () => {
    expect(certificatesToBagSleeveEntries([cert(null), cert('s1')], true)).toEqual([
      { id: 's1', includeQrCode: true },
    ])
  })

  it('deduplicates a sample listed twice', () => {
    const selection = [cert('s2', 's1'), cert('s2', 's1')]
    expect(certificatesToBagSleeveEntries(selection, true)).toEqual([
      { id: 's2', includeQrCode: true },
    ])
  })

  it('never emits a contractId — a sleeve is addressed by its sample alone', () => {
    const [entry] = certificatesToBagSleeveEntries([cert('s2', 's1')], true)
    expect(entry).not.toHaveProperty('contractId')
  })
})
