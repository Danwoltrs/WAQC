import { describe, it, expect } from 'vitest'
import { contractQualityFullText } from './contract-quality-text'

// Cape Horn's catalogue on sys (2026-09-29): #41770/26 stores the short name.
const CATALOGUE = [
  { short_name: '15/16 FC', full_description: 'Brazil Arabica Unwashed Coffee - NY 2/3 , Screen 15/16, Strictly Soft, Fine Cup' },
  { short_name: '17/18 FC', full_description: 'Brazil Arabica Unwashed Coffee - NY 2/3, Screen 17/18, Strictly Soft, Fine Cup.' },
]

describe('contractQualityFullText', () => {
  it('swaps the short name for the buyer catalogue’s full description and adds the crop, as the Sale Confirmation does', () => {
    expect(contractQualityFullText({ description: '15/16 FC', qualities: CATALOGUE, crop: '2026/2027' }))
      .toBe('Brazil Arabica Unwashed Coffee - NY 2/3 , Screen 15/16, Strictly Soft, Fine Cup, Crop 2026/2027.')
  })

  it('matches the short name loosely (case, trailing period) and composes without a crop', () => {
    expect(contractQualityFullText({ description: '17/18 fc.', qualities: CATALOGUE, crop: null }))
      .toBe('Brazil Arabica Unwashed Coffee - NY 2/3, Screen 17/18, Strictly Soft, Fine Cup.')
  })

  it('keeps a contract that already holds the full description', () => {
    expect(contractQualityFullText({ description: CATALOGUE[1].full_description, qualities: CATALOGUE, crop: '2026' }))
      .toBe('Brazil Arabica Unwashed Coffee - NY 2/3, Screen 17/18, Strictly Soft, Fine Cup, Crop 2026.')
  })

  it('prefers a legacy contract’s own Sale Confirmation wording', () => {
    expect(contractQualityFullText({ description: '15/16 FC', scText: 'Brazil NY 2/3 15/16 FC own wording', qualities: CATALOGUE, crop: null }))
      .toBe('Brazil NY 2/3 15/16 FC own wording.')
  })

  it('is null when there is nothing fuller than the short name', () => {
    expect(contractQualityFullText({ description: '14/16 GC', qualities: CATALOGUE, crop: '2026' })).toBeNull()
    expect(contractQualityFullText({ description: '', qualities: CATALOGUE, crop: '2026' })).toBeNull()
    expect(contractQualityFullText({ description: 'X', qualities: [{ short_name: 'X', full_description: 'X' }], crop: null })).toBeNull()
  })
})
