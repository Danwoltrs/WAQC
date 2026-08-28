import { describe, it, expect } from 'vitest'
import { formatQuantity, type CertificateSampleDetailsProps } from './certificate-sample-details'

const base: CertificateSampleDetailsProps = {
  bagsQuantityMt: null,
  bags: null,
  bagType: null,
  bagWeightKg: null,
  equivalent60kgBags: null,
  containerCount: null,
  sampleType: null,
  icoNumber: null,
}

describe('certificate quantity line', () => {
  describe('bulk prints containers + MT', () => {
    it('uses the stored container count', () => {
      expect(
        formatQuantity({ ...base, bagType: 'bulk', bagsQuantityMt: 43.2, containerCount: 2, bags: 720 }),
      ).toEqual({ mainValue: '2 containers in bulk', packagingInfo: '(43.2 MT)' })
    })

    it('estimates containers from the weight on a legacy row without container_count', () => {
      expect(formatQuantity({ ...base, bagType: 'bulk', bags: 720 })).toEqual({
        mainValue: '2 containers in bulk',
        packagingInfo: '(43.2 MT)',
      })
    })

    it('prints the singular for one container', () => {
      expect(
        formatQuantity({ ...base, bagType: 'bulk', bagsQuantityMt: 21.6, containerCount: 1 }),
      ).toEqual({ mainValue: '1 container in bulk', packagingInfo: '(21.6 MT)' })
    })

    it('never prints the legacy "720 × 21600 kg bulk bags" line', () => {
      // Bulk rows store bag_weight_kg = 21600 for the derivation trigger; the
      // old bags branch used to run after the bulk branch and overwrite it.
      const line = formatQuantity({
        ...base,
        bagType: 'bulk',
        bags: 720,
        bagWeightKg: 21600,
        bagsQuantityMt: 43.2,
        equivalent60kgBags: 720,
      })
      expect(line).toEqual({ mainValue: '2 containers in bulk', packagingInfo: '(43.2 MT)' })
      expect(`${line.mainValue} ${line.packagingInfo}`).not.toContain('21600')
    })
  })

  describe('bags are unchanged', () => {
    it('jute bags', () => {
      expect(
        formatQuantity({ ...base, bagType: 'jute_bag', bags: 720, bagWeightKg: 60, bagsQuantityMt: 43.2 }),
      ).toEqual({ mainValue: '43.2 MT', packagingInfo: '(720 × 60 kg jute bags)' })
    })

    it('big bags with a bag weight', () => {
      expect(
        formatQuantity({ ...base, bagType: 'big_bag', bags: 20, bagWeightKg: 1000, bagsQuantityMt: 20 }),
      ).toEqual({ mainValue: '20.0 MT', packagingInfo: '(20 × 1000 kg big bags)' })
    })

    it('legacy "big bags" spelling keeps the equivalent wording', () => {
      expect(
        formatQuantity({ ...base, bagType: 'big bags', bagsQuantityMt: 20, equivalent60kgBags: 333 }),
      ).toEqual({ mainValue: '20.0 MT', packagingInfo: '(in big bags, eq. 333 × 60 kg bags)' })
    })

    it('no quantity at all is N/A', () => {
      expect(formatQuantity(base)).toEqual({ mainValue: 'N/A', packagingInfo: null })
    })
  })
})
