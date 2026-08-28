import { describe, it, expect } from 'vitest'
import {
  withCertifiedMonth,
  formatLabelDate,
  formatSleeveQuantity,
  sumSleeveQuantityMt,
  groupSleeveQuantity,
  orderSleeveCertificates,
  compressCertificateNumbers,
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

  it('prints bulk as containers, the agreed wording on every surface', () => {
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', quantityMt: 43.2, containerCount: 2, equivalent60kgBags: 720 }))
      .toBe('2 containers in bulk (43.2 MT)')
  })

  it('estimates the container count for a bulk lot that never stored one', () => {
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', quantityMt: 21.6, containerCount: null, equivalent60kgBags: 360 }))
      .toBe('1 container in bulk (21.6 MT)')
  })

  it('derives MT when it is not stored', () => {
    expect(formatSleeveQuantity({ ...base, quantityMt: null }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })

  it('returns null when there is nothing to say', () => {
    expect(formatSleeveQuantity({ ...base, bagCount: null, bagWeightKg: null, equivalent60kgBags: null }))
      .toBeNull()
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', bagCount: null, quantityMt: null, equivalent60kgBags: null }))
      .toBeNull()
  })

  it('falls through to the bag-derived figure when the stored MT is zero', () => {
    // A stored 0 means "not filled in". Printing "0.0 MT" on a tin holding
    // 333 bags is worse than deriving it.
    expect(formatSleeveQuantity({ ...base, quantityMt: 0 }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
    expect(formatSleeveQuantity({ ...base, bagType: 'bulk', quantityMt: 0, equivalent60kgBags: 360 }))
      .toBe('1 container in bulk (21.6 MT)')
  })

  it('prints the whole group total, not just the lab unit', () => {
    // One tin covers the whole lot: 8 MT lab unit + 6 + 6 siblings.
    const quantityMt = sumSleeveQuantityMt([8, 6, 6])
    expect(formatSleeveQuantity({ ...base, quantityMt }))
      .toBe('333 bags in 60 kg jute bags | 20.0 MT')
  })
})

describe('sumSleeveQuantityMt', () => {
  it('sums the lab unit and every sibling', () => {
    expect(sumSleeveQuantityMt([8, 6, 6])).toBe(20)
  })

  it('returns the lab unit figure when there are no siblings', () => {
    expect(sumSleeveQuantityMt([19.2])).toBe(19.2)
  })

  it('ignores members with no stored tonnage', () => {
    expect(sumSleeveQuantityMt([8, null, 6, undefined])).toBe(14)
  })

  it('sums the siblings when only the lab unit is missing', () => {
    expect(sumSleeveQuantityMt([null, 6, 6])).toBe(12)
  })

  it('returns null when nothing at all is stored, so the caller derives it', () => {
    expect(sumSleeveQuantityMt([])).toBeNull()
    expect(sumSleeveQuantityMt([undefined, null, undefined])).toBeNull()
  })
})

describe('groupSleeveQuantity', () => {
  const labUnit = { bag_type: 'jute_bag', bag_count: 333, bag_weight_kg: 60, bags_quantity_mt: 20, equivalent_60kg_bags: 333 }

  it('is the lab unit alone for a single-contract sample', () => {
    expect(groupSleeveQuantity([labUnit])).toEqual({
      bagType: 'jute_bag', bagCount: 333, bagWeightKg: 60, quantityMt: 20, containerCount: null, equivalent60kgBags: 333,
    })
  })

  it('adds every sibling — each contract is its own coffee', () => {
    const q = groupSleeveQuantity([
      labUnit,
      { bag_type: 'jute_bag', bag_count: 100, bag_weight_kg: 60, bags_quantity_mt: 6, equivalent_60kg_bags: 100 },
      { bag_type: 'jute_bag', bag_count: 100, bag_weight_kg: 60, bags_quantity_mt: 6, equivalent_60kg_bags: 100 },
    ])
    expect(q.bagCount).toBe(533)
    expect(q.quantityMt).toBe(32)
    expect(q.equivalent60kgBags).toBe(533)
    expect(q.bagWeightKg).toBe(60)
  })

  it('totals the containers of a bulk group and prints them as one line', () => {
    const q = groupSleeveQuantity([
      { bag_type: 'bulk', bag_count: 360, bag_weight_kg: 21600, bags_quantity_mt: 21.6, container_count: 1, equivalent_60kg_bags: 360 },
      { bag_type: 'bulk', bag_count: 720, bag_weight_kg: 21600, bags_quantity_mt: 43.2, container_count: 2, equivalent_60kg_bags: 720 },
    ])
    expect(q.containerCount).toBe(3)
    expect(q.quantityMt).toBeCloseTo(64.8)
    expect(formatSleeveQuantity({ ...base, ...q })).toBe('3 containers in bulk (64.8 MT)')
  })

  it('estimates a bulk member that never stored its container count', () => {
    const q = groupSleeveQuantity([
      { bag_type: 'bulk', bag_count: 360, bag_weight_kg: 21600, bags_quantity_mt: 21.6, container_count: null, equivalent_60kg_bags: 360 },
      { bag_type: 'bulk', bag_count: 720, bag_weight_kg: 21600, bags_quantity_mt: 43.2, container_count: 2, equivalent_60kg_bags: 720 },
    ])
    expect(q.containerCount).toBe(3)
  })

  it('takes the bag type and weight from the lab unit, which comes first', () => {
    const q = groupSleeveQuantity([
      { bag_type: 'pp_bag', bag_count: 10, bag_weight_kg: 69, bags_quantity_mt: 0.69, equivalent_60kg_bags: 12 },
      { bag_type: 'jute_bag', bag_count: 10, bag_weight_kg: 60, bags_quantity_mt: 0.6, equivalent_60kg_bags: 10 },
    ])
    expect(q.bagType).toBe('pp_bag')
    expect(q.bagWeightKg).toBe(69)
  })

  it('leaves everything null for an empty group, so nothing prints', () => {
    expect(groupSleeveQuantity([])).toEqual({
      bagType: null, bagCount: null, bagWeightKg: null, quantityMt: null, containerCount: null, equivalent60kgBags: null,
    })
  })
})

describe('orderSleeveCertificates', () => {
  // A contract group: the lab unit `s1` and three siblings pointing at it.
  const labCert = { sample_id: 's1', certificate_number: 'BR-036991/26', created_at: '2026-07-29T12:00:00.000Z' }
  const certA = { sample_id: 's-a', certificate_number: 'BR-036992/26', created_at: '2026-07-29T12:00:01.000Z' }
  const certB = { sample_id: 's-b', certificate_number: 'BR-036993/26', created_at: '2026-07-29T12:00:01.000Z' }
  const certC = { sample_id: 's-c', certificate_number: 'BR-036994/26', created_at: '2026-07-29T12:00:01.000Z' }

  const labUnit = { id: 's1', lab_source_sample_id: null, contract_ordinal: 1 }
  const siblings = (...entries: Array<[string, number | null]>) =>
    entries.map(([id, contract_ordinal]) => ({ id, lab_source_sample_id: 's1', contract_ordinal }))

  it('leads with the lab unit certificate', () => {
    const { numbers } = orderSleeveCertificates([certA, labCert], [...siblings(['s-a', 2]), labUnit])
    expect(numbers[0]).toBe('BR-036991/26')
  })

  it('orders sibling certificates by contract_ordinal', () => {
    // Same created_at for all three — the timestamp cannot break the tie.
    const { numbers } = orderSleeveCertificates(
      [labCert, certC, certA, certB],
      [labUnit, ...siblings(['s-a', 2], ['s-b', 3], ['s-c', 4])],
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26', 'BR-036993/26', 'BR-036994/26'])
  })

  it('is stable regardless of the order the rows or members arrive in', () => {
    const one = orderSleeveCertificates([labCert, certA, certB, certC], [labUnit, ...siblings(['s-a', 2], ['s-b', 3], ['s-c', 4])])
    const two = orderSleeveCertificates([certC, certB, labCert, certA], [...siblings(['s-c', 4], ['s-b', 3]), labUnit, ...siblings(['s-a', 2])])
    expect(one.numbers).toEqual(two.numbers)
  })

  it('puts the lab unit first even when its contract_ordinal was never set', () => {
    // Single-contract samples predating the migration keep a NULL ordinal.
    const { numbers } = orderSleeveCertificates(
      [certA, labCert],
      [...siblings(['s-a', 2]), { id: 's1', lab_source_sample_id: null, contract_ordinal: null }],
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })

  it('keeps siblings with an unknown contract_ordinal last, in their incoming order', () => {
    const { numbers } = orderSleeveCertificates(
      [labCert, certB, certC, certA],
      [labUnit, ...siblings(['s-a', 2], ['s-b', null], ['s-c', null])],
    )
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26', 'BR-036993/26', 'BR-036994/26'])
  })

  it('takes the certified date from the lab unit certificate', () => {
    const { certifiedAt } = orderSleeveCertificates([certA, labCert], [labUnit, ...siblings(['s-a', 2])])
    expect(certifiedAt).toBe('2026-07-29T12:00:00.000Z')
  })

  it('falls back to the first row when the lab unit has no certificate', () => {
    const { numbers, certifiedAt } = orderSleeveCertificates(
      [certA, certB],
      [labUnit, ...siblings(['s-a', 2], ['s-b', 3])],
    )
    expect(numbers).toEqual(['BR-036992/26', 'BR-036993/26'])
    expect(certifiedAt).toBe('2026-07-29T12:00:01.000Z')
  })

  it('returns nothing for a sample with no certificates', () => {
    expect(orderSleeveCertificates([], [labUnit])).toEqual({ numbers: [], certifiedAt: null })
  })

  it('skips a certificate row that has no number', () => {
    const unnumbered = { sample_id: 's-a', certificate_number: null, created_at: '2026-07-29T12:00:01.000Z' }
    const { numbers } = orderSleeveCertificates([labCert, unnumbered, certB], [labUnit, ...siblings(['s-a', 2], ['s-b', 3])])
    expect(numbers).toEqual(['BR-036991/26', 'BR-036993/26'])
  })

  it('never prints a member internal tracking number in place of a missing certificate', () => {
    // A sibling's tracking_number is its own SAN- lab number, minted like any
    // sample's. Only the certificates table holds official numbers.
    const uncertified = { ...siblings(['s-a', 2])[0], tracking_number: 'SAN-00999/26' }
    const { numbers } = orderSleeveCertificates([labCert], [labUnit, uncertified])
    expect(numbers).toEqual(['BR-036991/26'])
  })

  it('keeps a certificate whose sample did not come back among the members', () => {
    const { numbers } = orderSleeveCertificates([labCert, certA], [labUnit])
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })

  it('never prints the same number twice', () => {
    const dup = { sample_id: 's-b', certificate_number: 'BR-036992/26', created_at: '2026-07-29T12:00:01.000Z' }
    const { numbers } = orderSleeveCertificates([labCert, certA, dup], [labUnit, ...siblings(['s-a', 2], ['s-b', 3])])
    expect(numbers).toEqual(['BR-036991/26', 'BR-036992/26'])
  })
})

describe('compressCertificateNumbers', () => {
  it('collapses a consecutive run', () => {
    expect(compressCertificateNumbers([
      'BR-036992/JUL/26', 'BR-036993/JUL/26', 'BR-036994/JUL/26',
    ])).toEqual(['BR-036992-036994/JUL/26'])
  })

  it('leaves a pair written out in full', () => {
    // Two numbers always fit; a range would only make them harder to read back.
    expect(compressCertificateNumbers(['BR-036992/JUL/26', 'BR-036993/JUL/26']))
      .toEqual(['BR-036992/JUL/26', 'BR-036993/JUL/26'])
  })

  it('breaks a run at a gap', () => {
    expect(compressCertificateNumbers([
      'BR-036992/JUL/26', 'BR-036993/JUL/26', 'BR-036994/JUL/26',
      'BR-036999/JUL/26', 'BR-037000/JUL/26', 'BR-037001/JUL/26',
    ])).toEqual(['BR-036992-036994/JUL/26', 'BR-036999-037001/JUL/26'])
  })

  it('never merges across different prefixes or months', () => {
    expect(compressCertificateNumbers([
      'BR-036992/JUL/26', 'SAG-036993/JUL/26', 'SAG-036994/JUL/26',
    ])).toEqual(['BR-036992/JUL/26', 'SAG-036993/JUL/26', 'SAG-036994/JUL/26'])

    expect(compressCertificateNumbers([
      'BR-036992/JUL/26', 'BR-036993/AUG/26', 'BR-036994/AUG/26',
    ])).toEqual(['BR-036992/JUL/26', 'BR-036993/AUG/26', 'BR-036994/AUG/26'])
  })

  it('reads the sequence past a digit-bearing prefix', () => {
    expect(compressCertificateNumbers([
      'BD1-001133/AUG/26', 'BD1-001134/AUG/26', 'BD1-001135/AUG/26',
    ])).toEqual(['BD1-001133-001135/AUG/26'])
  })

  it('handles the rejected R- prefix', () => {
    expect(compressCertificateNumbers([
      'R-SAK-011717/JUL/26', 'R-SAK-011718/JUL/26', 'R-SAK-011719/JUL/26',
    ])).toEqual(['R-SAK-011717-011719/JUL/26'])
  })

  it('never merges across a padding change', () => {
    // 099 -> 100 widens the field; a range would misstate the numbers.
    expect(compressCertificateNumbers(['BR-098/26', 'BR-099/26', 'BR-0100/26']))
      .toEqual(['BR-098/26', 'BR-099/26', 'BR-0100/26'])
  })

  it('passes through numbers it cannot parse', () => {
    expect(compressCertificateNumbers(['PENDING', 'BR-036992/JUL/26']))
      .toEqual(['PENDING', 'BR-036992/JUL/26'])
  })

  it('is a no-op on an empty list', () => {
    expect(compressCertificateNumbers([])).toEqual([])
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

  it("prints our own contract number", () => {
    const f = buildSleeveLabelFields({ ...base, wolthersContractNrs: ['45123/26'] })
    expect(f.wolthers).toBe('45123/26')
  })

  it('prints our contract number once when the splits all share it', () => {
    const f = buildSleeveLabelFields({
      ...base,
      wolthersContractNrs: ['45123/26', '45123/26', ' 45123/26 '],
    })
    expect(f.wolthers).toBe('45123/26')
  })

  it('prints every distinct contract number a split brought with it', () => {
    const f = buildSleeveLabelFields({
      ...base,
      wolthersContractNrs: ['45123/26', '45124/26'],
    })
    expect(f.wolthers).toBe('45123/26, 45124/26')
  })

  it('picks up a split contract number when the mother has none', () => {
    const f = buildSleeveLabelFields({ ...base, wolthersContractNrs: [null, '45124/26'] })
    expect(f.wolthers).toBe('45124/26')
  })

  it('omits our contract number when the lot has none anywhere', () => {
    expect(buildSleeveLabelFields(base).wolthers).toBeNull()
    expect(buildSleeveLabelFields({ ...base, wolthersContractNrs: ['  ', null] }).wolthers).toBeNull()
  })

  it('keeps the sub-contract certificate numbers, each with its month', () => {
    const f = buildSleeveLabelFields({
      ...base,
      certificateNumbers: ['BR-036991/26', 'BR-036992/26', 'BR-036993/26'],
    })
    expect(f.headline).toBe('BR-036991/JUL/26')
    expect(f.cert).toBe('BR-036992/JUL/26, BR-036993/JUL/26')
  })

  it('collapses a long run of sub-contract numbers into a range', () => {
    // Nine splits written out in full overflow the two lines the label has, so
    // the tail was ellipsised away — the numbers the field exists to show.
    const f = buildSleeveLabelFields({
      ...base,
      certificateNumbers: [
        'SAG-011692/26', 'SAG-011693/26', 'SAG-011694/26', 'SAG-011695/26',
        'SAG-011696/26', 'SAG-011697/26', 'SAG-011698/26', 'SAG-011699/26',
        'SAG-011700/26', 'SAG-011701/26',
      ],
    })
    expect(f.headline).toBe('SAG-011692/JUL/26')
    expect(f.cert).toBe('SAG-011693-011701/JUL/26')
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
