import { describe, it, expect } from 'vitest'
import { companyNameToSlug } from './company-slug'

describe('companyNameToSlug', () => {
  it('lowercases and hyphenates a fantasy name', () => {
    expect(companyNameToSlug('Arvid Nordquist')).toBe('arvid-nordquist')
  })

  it('strips accents so the url stays ascii', () => {
    expect(companyNameToSlug('Cooxupé')).toBe('cooxupe')
  })

  it('drops punctuation rather than encoding it', () => {
    expect(companyNameToSlug('Ahold Delhaize Coffee Company B.V.')).toBe('ahold-delhaize-coffee-company-b-v')
  })

  it('collapses runs of separators and trims the edges', () => {
    expect(companyNameToSlug('  W&A   QC  ')).toBe('w-a-qc')
  })

  it('returns null for a name that slugifies to nothing', () => {
    expect(companyNameToSlug('  ---  ')).toBeNull()
    expect(companyNameToSlug(null)).toBeNull()
    expect(companyNameToSlug(undefined)).toBeNull()
  })
})
