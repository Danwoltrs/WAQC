import { describe, it, expect } from 'vitest'
import {
  withCertifiedMonth,
  formatLabelDate,
  formatSleeveQuantity,
  sumSleeveQuantityMt,
  orderSleeveCertificates,
  toSleeveSampleType,
  resolveQualityName,
  resolveCompanyName,
  buildSleeveLabelFields,
  type SleeveLabelSource,
} from './sleeve-label-data'

const base: SleeveLabelSource = {
  sampleType: 'SS',
  containerNr: 'HASU 155.201-6',
  icoNumber: null,
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

  it('uses the laboratory local date, not UTC, across the midnight boundary', () => {
    // 2026-07-01T01:30Z is 30 June 22:30 in Santos.
    expect(withCertifiedMonth('BR-036991/26', '2026-07-01T01:30:00.000Z')).toBe('BR-036991/JUN/26')
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

  it('formats the laboratory local day across the midnight boundary', () => {
    expect(formatLabelDate('2026-07-01T01:30:00.000Z')).toBe('30/Jun/2026')
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

  it('falls through to the bag-derived figure when the stored MT is zero', () => {
    // A stored 0 means "not filled in". Printing "0.0 MT" on a tin holding
    // 333 bags is worse than deriving it.
    expect(formatSleeveQuantity({ ...base, quantityMt: 0 }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', quantityMt: 0, equivalent60kgBags: 360 }))
      .toBe('equiv. 360 bags in 60 kg | 21.6 MT')
  })

  it('prints the mother plus sub-contract total, not just the mother', () => {
    // One tin covers the whole lot: 8 MT mother + 6 + 6 sub-contracts.
    const quantityMt = sumSleeveQuantityMt(8, [6, 6])
    expect(formatSleeveQuantity({ ...base, quantityMt }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })
})

describe('sumSleeveQuantityMt', () => {
  it('sums the mother and every sub-contract', () => {
    expect(sumSleeveQuantityMt(8, [6, 6])).toBe(20)
  })

  it('returns the mother figure when there are no sub-contracts', () => {
    expect(sumSleeveQuantityMt(19.2, [])).toBe(19.2)
  })

  it('ignores sub-contracts with no stored tonnage', () => {
    expect(sumSleeveQuantityMt(8, [null, 6, undefined])).toBe(14)
  })

  it('sums the sub-contracts when only the mother is missing', () => {
    expect(sumSleeveQuantityMt(null, [6, 6])).toBe(12)
  })

  it('returns null when nothing at all is stored, so the caller derives it', () => {
    expect(sumSleeveQuantityMt(null, [])).toBeNull()
    expect(sumSleeveQuantityMt(undefined, [null, undefined])).toBeNull()
  })
})

describe('orderSleeveCertificates', () => {
  const mother = { sample_contract_id: null, certificate_number: 'BR-036991/26', created_at: '2026-07-29T12:00:00.000Z' }
  const subA = { sample_contract_id: 'c-a', certificate_number: 'BR-036992/26', created_at: '2026-07-29T12:00:01.000Z' }
  const subB = { sample_contract_id: 'c-b', certificate_number: 'BR-036993/26', created_at: '2026-07-29T12:00:01.000Z' }
  const subC = { sample_contract_id: 'c-c', certificate_number: 'BR-036994/26', created_at: '2026-07-29T12:00:01.000Z' }

  const contracts = (...entries: Array<[string, number | null, string?]>) =>
    entries.map(([id, sort_order, tracking_number]) => ({ id, sort_order, tracking_number }))

  it('leads with the mother certificate', () => {
    const { numbers } = orderSleeveCertificates([subA, mother], contracts(['c-a', 0]))
    expect(numbers[0]).toBe('BR-036991/26')
  })

  it('orders sub-contract certificates by their sub-contract sort_order', () => {
    // Same created_at for all three — the timestamp cannot break the tie.
    const { numbers } = orderSleeveCertificates(
      [mother, subC, subA, subB],
      contracts(['c-a', 0], ['c-b', 1], ['c-c', 2]),
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26', 'BR-036993/26', 'BR-036994/26'])
  })

  it('is stable regardless of the order the rows arrive in', () => {
    const subs = contracts(['c-a', 0], ['c-b', 1], ['c-c', 2])
    const one = orderSleeveCertificates([mother, subA, subB, subC], subs)
    const two = orderSleeveCertificates([subC, subB, mother, subA], subs)
    expect(one.numbers).toEqual(two.numbers)
  })

  it('keeps sub-contracts with an unknown sort_order last, in their incoming order', () => {
    const { numbers } = orderSleeveCertificates(
      [mother, subB, subC, subA],
      contracts(['c-a', 0], ['c-b', null], ['c-c', null]),
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26', 'BR-036993/26', 'BR-036994/26'])
  })

  it('takes the certified date from the mother certificate', () => {
    const { certifiedAt } = orderSleeveCertificates([subA, mother], contracts(['c-a', 0]))
    expect(certifiedAt).toBe('2026-07-29T12:00:00.000Z')
  })

  it('falls back to the first row when there is no mother certificate', () => {
    const { numbers, certifiedAt } = orderSleeveCertificates(
      [subA, subB],
      contracts(['c-a', 0], ['c-b', 1]),
    )
    expect(numbers).toEqual(['BR-036992/26', 'BR-036993/26'])
    expect(certifiedAt).toBe('2026-07-29T12:00:01.000Z')
  })

  it('returns nothing for a sample with no certificates', () => {
    expect(orderSleeveCertificates([], [])).toEqual({ numbers: [], certifiedAt: null })
  })

  it('falls back to the sub-contract number when the split has no certificate row', () => {
    // The tin showed the mother's number alone for a lot covering several
    // contracts, because the splits' certificate rows were never created.
    const { numbers } = orderSleeveCertificates(
      [mother],
      contracts(['c-a', 0, 'BR-036992/26'], ['c-b', 1, 'BR-036993/26']),
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26', 'BR-036993/26'])
  })

  it('falls back to the sub-contract number when the certificate row has no number', () => {
    const unnumbered = { sample_contract_id: 'c-a', certificate_number: null, created_at: '2026-07-29T12:00:01.000Z' }
    const { numbers } = orderSleeveCertificates(
      [mother, unnumbered],
      contracts(['c-a', 0, 'BR-036992/26']),
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })

  it('prefers the certificate row over the mirrored sub-contract number', () => {
    const { numbers } = orderSleeveCertificates([mother, subA], contracts(['c-a', 0, 'STALE-1/26']))
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })

  it('keeps a certificate whose sub-contract did not come back', () => {
    const { numbers } = orderSleeveCertificates([mother, subA], [])
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })

  it('never prints the same number twice', () => {
    const { numbers } = orderSleeveCertificates(
      [mother, subA],
      contracts(['c-a', 0, 'BR-036992/26'], ['c-b', 1, 'BR-036992/26']),
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })

  it('skips a split that has no number anywhere yet', () => {
    const { numbers } = orderSleeveCertificates([mother], contracts(['c-a', 0], ['c-b', 1, 'BR-036993/26']))
    expect(numbers).toEqual(['BR-036991/26', 'BR-036993/26'])
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
  it('leads with the certificate number and drops the container to the line below', () => {
    const f = buildSleeveLabelFields(base)
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.references).toEqual([{ label: 'Container: ', value: 'HASU 155.201-6' }])
    // The headline took the only certificate, so nothing is left to repeat.
    expect(f.cert).toBeNull()
  })

  it('prints the container AND the ICO for a shipment sample', () => {
    const f = buildSleeveLabelFields({ ...base, icoNumber: '021/1234/0001' })
    expect(f.references).toEqual([
      { label: 'Container: ', value: 'HASU 155.201-6' },
      { label: 'ICO: ', value: '021/1234/0001' },
    ])
  })

  it('omits the ICO when the shipment sample has none', () => {
    const f = buildSleeveLabelFields({ ...base, icoNumber: '   ' })
    expect(f.references).toEqual([{ label: 'Container: ', value: 'HASU 155.201-6' }])
  })

  it('labels a pre-shipment sample reference as a sample number', () => {
    const f = buildSleeveLabelFields({
      ...base,
      sampleType: 'PSS',
      containerNr: null,
      exporterSampleNumber: 'CCT-2214/26',
    })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.references).toEqual([{ label: 'Sample: ', value: 'CCT-2214/26' }])
  })

  it('leads a pre-shipment sample with its own number, container and ICO after', () => {
    const f = buildSleeveLabelFields({
      ...base,
      sampleType: 'PSS',
      exporterSampleNumber: 'CCT-2214/26',
      icoNumber: '021/1234/0001',
    })
    expect(f.references).toEqual([
      { label: 'Sample: ', value: 'CCT-2214/26' },
      { label: 'Container: ', value: 'HASU 155.201-6' },
      { label: 'ICO: ', value: '021/1234/0001' },
    ])
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

  it('keeps the sub-contract certificate numbers, each with its month', () => {
    const f = buildSleeveLabelFields({
      ...base,
      certificateNumbers: ['BR-036991/26', 'BR-036992/26', 'BR-036993/26'],
    })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.cert).toBe('BR-036992/JUL/26, BR-036993/JUL/26')
  })

  it('promotes the reference to the headline when there is no certificate yet', () => {
    const f = buildSleeveLabelFields({ ...base, certificateNumbers: [], icoNumber: '021/1234/0001' })
    expect(f.headline).toBe('HASU 155.201-6')
    // Promoted, so the container is not also printed on the line below — but
    // the ICO still is.
    expect(f.references).toEqual([{ label: 'ICO: ', value: '021/1234/0001' }])
    expect(f.cert).toBeNull()
  })

  it('renders Reference pending when nothing at all resolves', () => {
    const f = buildSleeveLabelFields({
      ...base,
      containerNr: null,
      icoNumber: null,
      exporterSampleNumber: null,
      certificateNumbers: [],
    })
    expect(f.headline).toBe('Reference pending')
    expect(f.references).toEqual([])
    expect(f.cert).toBeNull()
  })

  it('never leaks the internal reference', () => {
    const f = buildSleeveLabelFields(base)
    expect(JSON.stringify(f)).not.toContain('SAN-')
  })
})

describe('resolveCompanyName', () => {
  it('prefers the trade name', () => {
    expect(resolveCompanyName({ name: 'Syngenta AVC SA', fantasy_name: 'Syngenta' })).toBe('Syngenta')
  })

  it('falls back to the legal name when there is no trade name', () => {
    expect(resolveCompanyName({ name: 'Blaser Trading AG', fantasy_name: null })).toBe('Blaser Trading AG')
  })

  it('treats a blank trade name as absent', () => {
    expect(resolveCompanyName({ name: 'Cocatrel', fantasy_name: '   ' })).toBe('Cocatrel')
  })

  it('returns null when the company is missing entirely', () => {
    expect(resolveCompanyName(null)).toBeNull()
    expect(resolveCompanyName(undefined)).toBeNull()
  })

  it('returns null when neither name is set', () => {
    expect(resolveCompanyName({ name: null, fantasy_name: null })).toBeNull()
  })
})
