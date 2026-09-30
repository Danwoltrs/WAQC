import { describe, it, expect } from 'vitest'
import { resolveSampleReference, formatSampleReference, sampleIdentifier, sampleLabel, sampleLabelText } from './sample-reference'

const SAN = 'SAN-00612/26'

describe('resolveSampleReference', () => {
  it('leads a shipment sample with its container and keeps the ICO alongside', () => {
    expect(
      resolveSampleReference({
        sample_type: 'ss',
        container_nr: 'HASU 155.201-6',
        ico_number: '002/1649/0185',
        tracking_number: SAN,
      })
    ).toEqual({ primary: 'HASU 155.201-6', secondary: '002/1649/0185', isInternal: false })
  })

  it('falls back to the ICO for a shipment sample with no container yet', () => {
    expect(
      resolveSampleReference({ sample_type: 'ss', ico_number: '002/1649/0185', tracking_number: SAN })
    ).toEqual({ primary: '002/1649/0185', secondary: null, isInternal: false })
  })

  it("uses the exporter's own sample number for a pre-shipment sample", () => {
    expect(
      resolveSampleReference({ sample_type: 'pss', exporter_sample_number: '032/26', tracking_number: SAN })
    ).toEqual({ primary: '032/26', secondary: null, isInternal: false })
  })

  it('never returns the internal SAN number while any real identifier exists', () => {
    const cases: Array<Record<string, string>> = [
      { sample_type: 'pss', exporter_sample_number: '032/26' },
      { sample_type: 'ss', container_nr: 'HASU 155.201-6' },
      { sample_type: 'ss', ico_number: '002/1649/0185' },
      // Declared type and populated field disagree — still not the lab number.
      { sample_type: 'pss', container_nr: 'HASU 155.201-6' },
      { sample_type: 'ss', exporter_sample_number: '032/26' },
    ]
    for (const c of cases) {
      const ref = resolveSampleReference({ ...c, tracking_number: SAN })
      expect(ref.primary).not.toBe(SAN)
      expect(ref.isInternal).toBe(false)
    }
  })

  it('falls back to the lab number only when the lot carries nothing else, and says so', () => {
    expect(resolveSampleReference({ sample_type: 'type', tracking_number: SAN })).toEqual({
      primary: SAN,
      secondary: null,
      isInternal: true,
    })
  })

  it('treats blank strings as absent', () => {
    expect(
      resolveSampleReference({ sample_type: 'pss', exporter_sample_number: '   ', tracking_number: SAN }).isInternal
    ).toBe(true)
  })

  it('joins both identifiers for display', () => {
    expect(
      formatSampleReference({ sample_type: 'ss', container_nr: 'HASU 155.201-6', ico_number: '002/1649/0185' })
    ).toBe('HASU 155.201-6 · 002/1649/0185')
    expect(formatSampleReference({ sample_type: 'pss', exporter_sample_number: '032/26' })).toBe('032/26')
  })
})

describe('sampleIdentifier', () => {
  it('takes the container, then the ICO, then the exporter sample number', () => {
    expect(sampleIdentifier({ container_nr: 'MSKU 1', ico_number: '002/1/1', exporter_sample_number: '143/26' }))
      .toEqual({ tag: 'CTR', value: 'MSKU 1' })
    expect(sampleIdentifier({ ico_number: '002/1/1', exporter_sample_number: '143/26' }))
      .toEqual({ tag: 'ICO', value: '002/1/1' })
    expect(sampleIdentifier({ exporter_sample_number: ' 144/26 ' })).toEqual({ tag: 'SMP', value: '144/26' })
  })

  it('is null for a lot with no identifier of its own', () => {
    expect(sampleIdentifier({ container_nr: ' ', ico_number: null })).toBeNull()
  })
})

describe('sampleLabel', () => {
  it('names a certified sample by its certificate number', () => {
    expect(sampleLabel({ certificate_id: 'c1', certificate_number: 'BR-037415/26', exporter_sample_number: '143/26' }))
      .toEqual({ tag: null, value: 'BR-037415/26' })
  })

  it("names every contract of a lot by its own sample number before certification", () => {
    // Prod 2026-09-30: contract #2 of a Dunkin PSS listed as SAN-01171/26
    // although its sample number, 144/26, was typed at intake.
    expect(sampleLabel({ certificate_id: null, certificate_number: null, exporter_sample_number: '144/26' }))
      .toEqual({ tag: 'SMP', value: '144/26' })
  })

  it('ignores a certificate number without a certificate', () => {
    expect(sampleLabel({ certificate_id: null, certificate_number: 'BR-1/26', ico_number: '002/1/1' }))
      .toEqual({ tag: 'ICO', value: '002/1/1' })
  })

  it('never falls back to the SAN lab number', () => {
    expect(sampleLabel({ tracking_number: SAN } as never)).toBeNull()
    expect(sampleLabelText({ tracking_number: SAN } as never)).toBe('Sample')
  })

  it('prints the tag beside the value', () => {
    expect(sampleLabelText({ exporter_sample_number: '144/26' })).toBe('SMP 144/26')
    expect(sampleLabelText({ certificate_id: 'c1', certificate_number: 'BR-037415/26' })).toBe('BR-037415/26')
  })
})
