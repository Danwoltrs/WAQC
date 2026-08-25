import { describe, it, expect } from 'vitest'
import { resolveSampleReference, formatSampleReference } from './sample-reference'

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
