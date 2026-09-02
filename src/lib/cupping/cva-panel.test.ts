import { describe, it, expect } from 'vitest'
import { panelStats, DEFAULT_SPREAD_MAX } from './cva-panel'

const s = (cupper_id: string, cva_score: number | null) => ({ cupper_id, cva_score })

describe('panelStats', () => {
  it('averages the recorded scores and measures their spread', () => {
    const out = panelStats([s('a', 86.25), s('b', 84), s('c', 87.75)], 3)
    expect(out.mean).toBe(86)
    expect(out.spread).toBe(3.75)
  })

  it('flags a spread wider than the threshold and names the furthest cupper', () => {
    const out = panelStats([s('a', 86.25), s('b', 84), s('c', 87.75)], 3)
    expect(out.flagged).toBe(true)
    expect(out.outliers).toEqual(['b'])
  })

  it('does not flag a spread exactly on the threshold', () => {
    const out = panelStats([s('a', 84), s('b', 87)], 3)
    expect(out.spread).toBe(3)
    expect(out.flagged).toBe(false)
    expect(out.outliers).toEqual([])
  })

  it('ignores cuppers who opened the lot but recorded no score', () => {
    const out = panelStats([s('a', 86), s('b', null), s('c', 88)], 3)
    expect(out.recorded).toBe(2)
    expect(out.mean).toBe(87)
    expect(out.spread).toBe(2)
  })

  it('treats a single recorded score as no spread at all', () => {
    const out = panelStats([s('a', 86), s('b', null)], 3)
    expect(out).toMatchObject({ recorded: 1, mean: 86, spread: 0, flagged: false, outliers: [] })
  })

  it('survives a panel where nobody has scored yet', () => {
    const out = panelStats([s('a', null), s('b', null)], 3)
    expect(out).toMatchObject({ recorded: 0, mean: null, spread: 0, flagged: false, outliers: [] })
  })

  it('names every cupper tied at the furthest distance from the mean', () => {
    const out = panelStats([s('a', 80), s('b', 90), s('c', 85)], 3)
    expect(out.mean).toBe(85)
    expect(out.outliers.sort()).toEqual(['a', 'b'])
  })

  it('defaults the threshold to three points', () => {
    expect(DEFAULT_SPREAD_MAX).toBe(3)
  })
})
