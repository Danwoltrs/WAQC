import { describe, it, expect } from 'vitest'
import { bagSleeveHeadline } from '@/lib/bag-sleeve-label'

describe('bagSleeveHeadline', () => {
  it.each([
    [{ container_nr: 'TEMU 565.799-2', certificate_number: 'BR-037529/26' }, 'TEMU 565.799-2'],
    [{ exporter_sample_number: '520/26', certificate_number: 'SAG-011960/26' }, '520/26'],
    [{ certificate_number: 'RM1-001270/26' }, 'RM1-001270/26'],
    [{}, 'Sample'],
  ])('bagSleeveHeadline(%j)', (s, out) => expect(bagSleeveHeadline(s)).toBe(out))
})
