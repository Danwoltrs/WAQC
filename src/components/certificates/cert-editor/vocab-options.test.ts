import { describe, it, expect } from 'vitest'
import { cropYearOptions, mergeProcessingOptions } from './vocab-options'

describe('cropYearOptions', () => {
  it('after May shows the new crop year as latest', () => {
    // June 2026 (month index 5 >= 4 = May)
    expect(cropYearOptions(new Date(2026, 5, 26))).toEqual(['26/27', '25/26', '24/25', '23/24'])
  })
  it('before May keeps the prior crop as latest', () => {
    // April 2026 (month index 3 < 4)
    expect(cropYearOptions(new Date(2026, 3, 15))).toEqual(['25/26', '24/25', '23/24', '22/23'])
  })
  it('rolls over in May of the next year', () => {
    expect(cropYearOptions(new Date(2027, 4, 1))).toEqual(['27/28', '26/27', '25/26', '24/25'])
  })
  it('pads single-digit years', () => {
    expect(cropYearOptions(new Date(2009, 5, 1))).toEqual(['09/10', '08/09', '07/08', '06/07'])
  })
  it('appends a current value older than the window', () => {
    expect(cropYearOptions(new Date(2026, 5, 26), '20/21')).toEqual(['26/27', '25/26', '24/25', '23/24', '20/21'])
  })
  it('does not duplicate a current value already in the window', () => {
    expect(cropYearOptions(new Date(2026, 5, 26), '25/26')).toEqual(['26/27', '25/26', '24/25', '23/24'])
  })
})

describe('mergeProcessingOptions', () => {
  it('keeps base order, appends distinct extras alphabetically', () => {
    expect(mergeProcessingOptions(['Natural', 'Washed'], ['Honey', 'Natural'])).toEqual(['Natural', 'Washed', 'Honey'])
  })
  it('appends a current value not present', () => {
    expect(mergeProcessingOptions(['Natural'], [], 'Anaerobic')).toEqual(['Natural', 'Anaerobic'])
  })
  it('dedupes a current value already present', () => {
    expect(mergeProcessingOptions(['Natural', 'Washed'], ['Washed'], 'Natural')).toEqual(['Natural', 'Washed'])
  })
  it('ignores blank values', () => {
    expect(mergeProcessingOptions(['Natural'], ['', '  '], '')).toEqual(['Natural'])
  })
})
