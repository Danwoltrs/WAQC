import { describe, it, expect } from 'vitest'
import { substringFilter } from './searchable-select-filter'

describe('substringFilter', () => {
  it('shows every option when the search is empty', () => {
    expect(substringFilter('BR-036991/26 · Comexim', '', ['41946/26'])).toBe(1)
    expect(substringFilter('anything', '   ', undefined)).toBe(1)
  })

  it('matches a contract number contained in the keywords', () => {
    expect(substringFilter('BR-036991/26 · Comexim · Brazil', '41946', ['41946/26'])).toBe(1)
  })

  it('matches text contained in the visible label', () => {
    expect(substringFilter('BR-036991/26 · Comexim · Brazil', 'comexim', [])).toBe(1)
  })

  it('matches when a keyword actually contains the contract number', () => {
    expect(substringFilter('SAX-011715/26 · Veloso · Brazil', '40994', ['41946/26', '40994/26'])).toBe(1)
  })

  it('hides options when the search is not a contiguous substring (no fuzzy noise)', () => {
    // "40994" is a fuzzy subsequence across these digits but never a real substring.
    expect(substringFilter('SAX-011715/26 · Veloso · Brazil', '40994', ['41946/26', '42276/26'])).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(substringFilter('br-036991/26', 'BR-036991', [])).toBe(1)
  })
})
