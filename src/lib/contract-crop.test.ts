import { describe, it, expect } from 'vitest'
import { contractCropYear, cropForShipmentMonth } from './contract-crop'

// 2026-09-29: the crop dropdown stayed on "Select..." for contracts whose
// sys crop was not written as "26/27" (or was blank).
describe('contractCropYear', () => {
  it('keeps a crop written the way the dropdown lists it', () => {
    expect(contractCropYear('26/27')).toBe('26/27')
    expect(contractCropYear(' 26 / 27 ')).toBe('26/27')
  })

  it('shortens a long crop or a bare year', () => {
    expect(contractCropYear('2026/27')).toBe('26/27')
    expect(contractCropYear('2026/2027')).toBe('26/27')
    expect(contractCropYear('2026-27')).toBe('26/27')
    expect(contractCropYear('2026')).toBe('26/27')
  })

  it('reads "current" and "new" at the contract date', () => {
    expect(contractCropYear('current', { contractDate: '2026-10-02' })).toBe('26/27')
    expect(contractCropYear('new', { contractDate: '2026-10-02' })).toBe('27/28')
    expect(contractCropYear('current', { contractDate: '2026-07-15' })).toBe('25/26')
    expect(contractCropYear('new', { contractDate: '2026-07-15' })).toBe('26/27')
    expect(contractCropYear('current', {})).toBeNull()
  })

  it('keeps a seller\'s choice or a blend as written', () => {
    expect(contractCropYear("26/27 or 27/28 at seller's choice")).toBe("26/27 or 27/28 at seller's choice")
  })

  it('takes the shipment month\'s crop when the contract has none', () => {
    expect(contractCropYear(null, { shipmentMonth: '2026-10-01' })).toBe('26/27')
    expect(contractCropYear('', { shipmentMonth: '2027-03-01' })).toBe('26/27')
    expect(contractCropYear(null, { shipmentMonth: '2026-07-01' })).toBeNull()
    expect(contractCropYear(null, {})).toBeNull()
  })
})

describe('cropForShipmentMonth', () => {
  it('follows the sys rule: Sep..May one crop, Jun..Aug the seller\'s choice', () => {
    expect(cropForShipmentMonth('2026-09')).toBe('26/27')
    expect(cropForShipmentMonth('2027-05')).toBe('26/27')
    expect(cropForShipmentMonth('2027-06')).toBeNull()
    expect(cropForShipmentMonth('2027-09')).toBe('27/28')
  })
})
