import { describe, it, expect } from 'vitest'
import { splitSearchTerms } from './search-terms'

describe('splitSearchTerms', () => {
  it.each([
    ['S-1548, S-1547; 520/26', ['S-1548', 'S-1547', '520/26']],
    ['S-1548\r\nS-1547\n\n', ['S-1548', 'S-1547']],
    ['S-1548 S-1547 520/26', ['S-1548', 'S-1547', '520/26']],
    ['Comexim EU', ['Comexim EU']],
    ['Wolthers 43020', ['Wolthers 43020']],
    ['TEMU 565.799-2', ['TEMU 565.799-2']],
    [' , ,42270 ,', ['42270']],
    ['S-1548, s-1548', ['S-1548']],
    ['', []],
  ])('splitSearchTerms(%j)', (input, terms) => {
    expect(splitSearchTerms(input)).toEqual({ terms, capped: false })
  })

  it('keeps the first 50 terms and says it cut', () => {
    const input = Array.from({ length: 60 }, (_, i) => `S-${1000 + i}`).join(',')
    const r = splitSearchTerms(input)
    expect(r.terms).toHaveLength(50)
    expect(r.terms[49]).toBe('S-1049')
    expect(r.capped).toBe(true)
  })
})
