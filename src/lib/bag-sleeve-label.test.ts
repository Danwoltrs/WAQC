import { describe, it, expect } from 'vitest'
import {
  bagSleeveContracts,
  bagSleeveHeadline,
  bagSleeveQualityDescription,
  bagSleeveTypeLine,
} from '@/lib/bag-sleeve-label'

describe('bagSleeveHeadline', () => {
  it('leads with the buyer contract number, whatever else the lot carries', () => {
    expect(bagSleeveHeadline({
      buyer_contract_nr: '105950',
      container_nr: 'TEMU 565.799-2',
      exporter_sample_number: 'S-1548/26',
      certificate_number: 'SAG-011960/26',
    })).toBe('105950')
  })

  it.each([
    [{ exporter_sample_number: '520/26', container_nr: 'TEMU 565.799-2' }, '520/26'],
    [{ container_nr: 'TEMU 565.799-2', ico_number: '002/4600/3508' }, 'TEMU 565.799-2'],
    [{ ico_number: '002/4600/3508', certificate_number: 'SAG-011960/26' }, '002/4600/3508'],
    [{ certificate_number: 'RM1-001270/26' }, 'RM1-001270/26'],
    [{ buyer_contract_nr: '  ' }, 'Sample'],
    [{}, 'Sample'],
  ])('without a buyer number: bagSleeveHeadline(%j)', (s, out) => expect(bagSleeveHeadline(s)).toBe(out))
})

describe('bagSleeveTypeLine', () => {
  it('joins the sample number to the type', () => {
    expect(bagSleeveTypeLine('PSS', '123453', '105950')).toBe('PSS - 123453')
    expect(bagSleeveTypeLine('SS', ' 520/26 ', '105950')).toBe('SS - 520/26')
  })

  it('is the bare type without a sample number, or when the number is the headline', () => {
    expect(bagSleeveTypeLine('PSS', null, '105950')).toBe('PSS')
    expect(bagSleeveTypeLine('Type Sample', 'ST-12', 'ST-12')).toBe('Type Sample')
  })
})

describe('bagSleeveContracts', () => {
  const s = {
    wolthers_contract_nr: '41127/25',
    buyer_contract_nr: '105950',
    exporter_contract_nr: 'E-1',
    roaster_contract_nr: null,
  }

  it('drops the buyer number when it is the headline', () => {
    expect(bagSleeveContracts(s, '105950')).toEqual([
      { type: 'Wolthers', value: '41127/25' },
      { type: 'Exporter', value: 'E-1' },
    ])
  })

  it('keeps it when something else leads', () => {
    expect(bagSleeveContracts(s, 'X')).toContainEqual({ type: 'Importer', value: '105950' })
  })
})

describe('bagSleeveQualityDescription', () => {
  it('prefers the contract text, then the template description, then its name', () => {
    const q = { template_description: 'Template desc', template_name: 'Blaser Dulce 17/18', short_name: 'Blaser Dulce 17/18' }
    expect(bagSleeveQualityDescription({ ...q, contract_text: 'Brazil NY 2/3, Screen 17/18, Fine Cup.' }))
      .toBe('Brazil NY 2/3, Screen 17/18, Fine Cup.')
    expect(bagSleeveQualityDescription(q)).toBe('Template desc')
  })

  it('is null when it would only repeat the short name', () => {
    expect(bagSleeveQualityDescription({ template_name: 'Blaser Dulce 17/18', short_name: 'blaser dulce 17/18.' })).toBeNull()
    expect(bagSleeveQualityDescription({ template_name: 'N/A' })).toBeNull()
    expect(bagSleeveQualityDescription({})).toBeNull()
  })
})
