import { describe, it, expect } from 'vitest'
import { buildScoreResolution, parseScoreResolution } from './score-resolution'

/**
 * The agreed cup profile word is part of the panel's resolution, frozen next
 * to the attribute finals. Before this the certificate took the MOST COMMON
 * word across cuppers, which for two cuppers who disagree is whichever was
 * inserted first.
 */
const rows = [
  { cupper_id: 'a', scores: { Flavor: 3.5, Flavor_descriptor: 'Soft' } },
  { cupper_id: 'b', scores: { Flavor: 3.5, Flavor_descriptor: 'Softish' } },
]

describe('score resolution: flavor descriptor', () => {
  it('freezes the validator\'s choice', () => {
    const r = buildScoreResolution({
      protocol: 'commodity', mode: 'average', rows, flavorDescriptor: 'Softish',
      resolvedBy: 'v', resolvedAt: '2026-09-16T00:00:00Z',
    })
    expect(r.flavor_descriptor).toBe('Softish')
    // The word never becomes an attribute final.
    expect(r.final_scores).toEqual({ Flavor: 3.5 })
  })

  it('records no word when none was agreed', () => {
    const r = buildScoreResolution({
      protocol: 'commodity', mode: 'average', rows,
      resolvedBy: 'v', resolvedAt: '2026-09-16T00:00:00Z',
    })
    expect(r.flavor_descriptor).toBeNull()
  })

  it('reads the frozen word back, and nothing but a word', () => {
    expect(parseScoreResolution({ mode: 'average', flavor_descriptor: ' Soft ' })?.flavor_descriptor).toBe('Soft')
    expect(parseScoreResolution({ mode: 'average', flavor_descriptor: 0 })?.flavor_descriptor).toBeNull()
    expect(parseScoreResolution({ mode: 'average' })?.flavor_descriptor).toBeNull()
  })
})
