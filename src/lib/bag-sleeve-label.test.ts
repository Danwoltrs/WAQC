import { describe, it, expect } from 'vitest'
import { bagSleeveHeadline } from '@/lib/bag-sleeve-label'

describe('bagSleeveHeadline', () => {
  it.each([
    [{ container_nr: 'TEMU 565.799-2', certificate_number: 'BR-037529/26' }, 'TEMU 565.799-2'],
    [{ exporter_sample_number: '520/26', certificate_number: 'SAG-011960/26' }, '520/26'],
    [{ certificate_number: 'RM1-001270/26' }, 'RM1-001270/26'],
    [{}, 'Sample'],
  ])('bagSleeveHeadline(%j)', (s, out) => expect(bagSleeveHeadline(s)).toBe(out))

  it('a PSS leads with the exporter sample number, even when it carries a container', () => {
    expect(bagSleeveHeadline({
      sample_type: 'pss',
      container_nr: 'TEMU 565.799-2',
      ico_number: '002/4600/3508',
      exporter_sample_number: 'S-1548/26',
      certificate_number: 'SAG-011960/26',
    })).toBe('S-1548/26')
  })

  it('a PSS without a sample number falls back to its container, then its ICO', () => {
    expect(bagSleeveHeadline({ sample_type: 'pss', container_nr: 'TEMU 565.799-2', ico_number: '002/4600/3508' }))
      .toBe('TEMU 565.799-2')
    expect(bagSleeveHeadline({ sample_type: 'pss', ico_number: '002/4600/3508', certificate_number: 'SAG-011960/26' }))
      .toBe('002/4600/3508')
    expect(bagSleeveHeadline({ sample_type: 'pss', certificate_number: 'SAG-011960/26' })).toBe('SAG-011960/26')
  })

  it('an SS leads with its container, then its ICO, then the exporter sample number', () => {
    const ss = {
      sample_type: 'ss',
      container_nr: 'TEMU 565.799-2',
      ico_number: '002/4600/3508',
      exporter_sample_number: 'S-1548/26',
      certificate_number: 'BR-037529/26',
    }
    expect(bagSleeveHeadline(ss)).toBe('TEMU 565.799-2')
    expect(bagSleeveHeadline({ ...ss, container_nr: null })).toBe('002/4600/3508')
    expect(bagSleeveHeadline({ ...ss, container_nr: null, ico_number: '' })).toBe('S-1548/26')
  })
})
