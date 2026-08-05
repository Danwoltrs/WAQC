import { describe, it, expect } from 'vitest'
import {
  withCertifiedMonth,
  formatLabelDate,
  formatSleeveQuantity,
  toSleeveSampleType,
  resolveQualityName,
  buildSleeveLabelFields,
  type SleeveLabelSource,
} from './sleeve-label-data'

const base: SleeveLabelSource = {
  sampleType: 'SS',
  containerNr: 'HASU 155.201-6',
  exporterSampleNumber: null,
  certificateNumbers: ['BR-036991/26'],
  certifiedAt: '2026-07-29T12:00:00.000Z',
  sellerName: 'OFI',
  sellerRef: null,
  clientName: 'OFI',
  clientRef: 'P-8037',
  roasterName: "Mother Parker's",
  quality: 'DDQ',
  bagCount: 333,
  bagWeightKg: 60,
  bagType: 'jute_bag',
  quantityMt: 20,
  equivalent60kgBags: 333,
}

describe('withCertifiedMonth', () => {
  it('inserts the month before the year segment', () => {
    expect(withCertifiedMonth('BR-036991/26', '2026-07-29T12:00:00.000Z')).toBe('BR-036991/JUL/26')
  })

  it('appends the month when the number has no year segment', () => {
    expect(withCertifiedMonth('37112', '2026-07-29T12:00:00.000Z')).toBe('37112/JUL')
  })

  it('returns the number untouched when there is no certified date', () => {
    expect(withCertifiedMonth('BR-036991/26', null)).toBe('BR-036991/26')
  })

  it('returns the number untouched when the date is unparseable', () => {
    expect(withCertifiedMonth('BR-036991/26', 'not-a-date')).toBe('BR-036991/26')
  })
})

describe('formatLabelDate', () => {
  it('formats as DD/Mon/YYYY', () => {
    expect(formatLabelDate('2026-07-29T12:00:00.000Z')).toBe('29/Jul/2026')
  })

  it('returns null for missing or invalid input', () => {
    expect(formatLabelDate(null)).toBeNull()
    expect(formatLabelDate('nope')).toBeNull()
  })
})

describe('formatSleeveQuantity', () => {
  it('formats standard bags', () => {
    expect(formatSleeveQuantity(base)).toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })

  it('formats bulk against the 60kg equivalent', () => {
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', quantityMt: 21.6, equivalent60kgBags: 360 }))
      .toBe('equiv. 360 bags in 60 kg | 21.6 MT')
  })

  it('derives MT when it is not stored', () => {
    expect(formatSleeveQuantity({ ...base, quantityMt: null }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })

  it('returns null when there is nothing to say', () => {
    expect(formatSleeveQuantity({ ...base, bagCount: null, bagWeightKg: null, equivalent60kgBags: null }))
      .toBeNull()
  })
})

describe('toSleeveSampleType', () => {
  it('maps the stored codes case-insensitively', () => {
    expect(toSleeveSampleType('pss')).toBe('PSS')
    expect(toSleeveSampleType('SS')).toBe('SS')
    expect(toSleeveSampleType('type')).toBe('Type Sample')
    expect(toSleeveSampleType('stocklot')).toBe('Stocklot')
  })

  it('defaults to PSS for unknown or missing values', () => {
    expect(toSleeveSampleType(null)).toBe('PSS')
    expect(toSleeveSampleType('mystery')).toBe('PSS')
  })
})

describe('resolveQualityName', () => {
  it('prefers the client custom name', () => {
    expect(resolveQualityName({ custom_name: 'DDQ', template: { name_en: 'Dunkin' } })).toBe('DDQ')
  })

  it('never concatenates the custom name and the template name', () => {
    // This is the "Dunkin - Dunkin" bug the old label printed.
    expect(resolveQualityName({ custom_name: 'Dunkin', template: { name_en: 'Dunkin' } })).toBe('Dunkin')
  })

  it('falls through the template locales', () => {
    expect(resolveQualityName({ custom_name: null, template: { name_en: null, name_pt: 'Duro' } })).toBe('Duro')
  })

  it('uses the fallback when there is no spec at all', () => {
    expect(resolveQualityName(null, 'Type A')).toBe('Type A')
  })

  it('returns null when nothing resolves', () => {
    expect(resolveQualityName(null, null)).toBeNull()
  })
})

describe('buildSleeveLabelFields', () => {
  it('leads with the container number for a shipment sample', () => {
    const f = buildSleeveLabelFields(base)
    expect(f.headline).toBe('HASU 155.201-6')
    expect(f.cert).toBe('BR-036991/JUL/26')
  })

  it('leads with the exporter sample number for a pre-shipment sample', () => {
    const f = buildSleeveLabelFields({
      ...base,
      sampleType: 'PSS',
      containerNr: null,
      exporterSampleNumber: 'CCT-2214/26',
    })
    expect(f.headline).toBe('CCT-2214/26')
  })

  it('appends the reference in parentheses only when present', () => {
    const f = buildSleeveLabelFields({ ...base, sellerName: 'Cocatrel', sellerRef: '34680' })
    expect(f.seller).toBe('Cocatrel (34680)')
    expect(f.client).toBe('OFI (P-8037)')
  })

  it('omits a party entirely when it has no name', () => {
    const f = buildSleeveLabelFields({ ...base, roasterName: null, clientName: '  ' })
    expect(f.roaster).toBeNull()
    expect(f.client).toBeNull()
  })

  it('comma-joins every certificate number, each with its month', () => {
    const f = buildSleeveLabelFields({
      ...base,
      certificateNumbers: ['BR-036991/26', 'BR-036992/26', 'BR-036993/26'],
    })
    expect(f.cert).toBe('BR-036991/JUL/26, BR-036992/JUL/26, BR-036993/JUL/26')
  })

  it('falls back to the certificate number as the headline and drops it from the cert field', () => {
    const f = buildSleeveLabelFields({ ...base, containerNr: null, exporterSampleNumber: null })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.cert).toBeNull()
  })

  it('keeps the remaining certificate numbers when the first became the headline', () => {
    const f = buildSleeveLabelFields({
      ...base,
      containerNr: null,
      exporterSampleNumber: null,
      certificateNumbers: ['BR-036991/26', 'BR-036992/26'],
    })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.cert).toBe('BR-036992/JUL/26')
  })

  it('renders Reference pending when nothing at all resolves', () => {
    const f = buildSleeveLabelFields({
      ...base,
      containerNr: null,
      exporterSampleNumber: null,
      certificateNumbers: [],
    })
    expect(f.headline).toBe('Reference pending')
    expect(f.cert).toBeNull()
  })

  it('never leaks the internal reference', () => {
    const f = buildSleeveLabelFields(base)
    expect(JSON.stringify(f)).not.toContain('SAN-')
  })
})
