import { describe, it, expect } from 'vitest'
import {
  averageAttributeScores,
  averageCvaScore,
  buildScoreResolution,
  cupperAttributeScores,
  hasCommodityFinals,
  includedRows,
  overallFromFinals,
  parseScoreResolution,
  snapToIncrement,
  snapToQuarter,
} from './score-resolution'

const RESOLVED_AT = '2026-09-10T12:00:00.000Z'

const panel = [
  { cupper_id: 'a', scores: { Body: 7, Acidity: 8 }, cva_score: 84 },
  { cupper_id: 'b', scores: { Body: 7.5, Acidity: 8.5 }, cva_score: 86 },
  { cupper_id: 'c', scores: { Body: 8, Acidity: 9 }, cva_score: 88.5 },
]

describe('snapToIncrement', () => {
  it('rounds half-up onto the grid', () => {
    expect(snapToIncrement(8.125, 0.25)).toBe(8.25)
    expect(snapToIncrement(8.124, 0.25)).toBe(8)
    expect(snapToIncrement(7.3, 0.5)).toBe(7.5)
  })
  it('falls back to 0.25 for a zero or negative increment', () => {
    expect(snapToIncrement(8.13, 0)).toBe(8.25)
  })
})

describe('averageAttributeScores', () => {
  it('is the panel mean, snapped per attribute', () => {
    // Body: (7 + 7.5 + 8) / 3 = 7.5   Acidity: (8 + 8.5 + 9) / 3 = 8.5
    expect(averageAttributeScores(panel)).toEqual({ Body: 7.5, Acidity: 8.5 })
  })

  it('averages an attribute only over the cuppers who scored it', () => {
    // A cupper who left Acidity blank still counts on Body — the same way a
    // partially filled card behaves on the cupping screen.
    const partial = [
      { cupper_id: 'a', scores: { Body: 7, Acidity: 8 } },
      { cupper_id: 'b', scores: { Body: 8 } },
    ]
    expect(averageAttributeScores(partial)).toEqual({ Body: 7.5, Acidity: 8 })
  })

  it('ignores non-numeric values', () => {
    const dirty = [{ cupper_id: 'a', scores: { Body: 7, Flavor_descriptor: 'nutty' } }]
    expect(averageAttributeScores(dirty)).toEqual({ Body: 7 })
  })

  it('skips a CVA envelope entirely', () => {
    // A specialty row's `scores` is a whole CvaAssessment, whose top-level
    // numerics (version / score / u / d) would otherwise be averaged into
    // attribute rails: a "version" axis at 1.00 and a "score" axis at 86.25
    // drawn on a 0-5 scale, on every specialty certificate.
    const cva = [{
      cupper_id: 'a',
      scores: { protocol: 'cva', version: 1, score: 86.25, u: 0, d: 0 },
    }]
    expect(averageAttributeScores(cva)).toEqual({})
    expect(cupperAttributeScores(cva, 'a')).toEqual({})
  })

  it('honours a per-attribute increment', () => {
    // Body mean 7.5 on a 1.0 grid snaps to 8 (half-up); Acidity keeps 0.25.
    expect(averageAttributeScores(panel, { Body: 1 })).toEqual({ Body: 8, Acidity: 8.5 })
  })
})

describe('includedRows', () => {
  it('drops the excluded cuppers and keeps OCR rows with no cupper', () => {
    const withOcr = [...panel, { cupper_id: null, scores: { Body: 2 } }]
    expect(includedRows(withOcr, ['b']).map(r => r.cupper_id)).toEqual(['a', 'c', null])
  })
  it('is a no-op with nothing excluded', () => {
    expect(includedRows(panel)).toHaveLength(3)
  })
})

describe('cupperAttributeScores', () => {
  it('takes one cupper verbatim, but still on the grid', () => {
    expect(cupperAttributeScores(panel, 'b')).toEqual({ Body: 7.5, Acidity: 8.5 })
    expect(cupperAttributeScores(panel, 'b', { Body: 1 })).toEqual({ Body: 8, Acidity: 8.5 })
  })
  it('is empty for a cupper who is not on the panel', () => {
    expect(cupperAttributeScores(panel, 'nobody')).toEqual({})
  })
})

describe('averageCvaScore', () => {
  it('is the mean rounded to 0.25 (SCA-104 §5.5)', () => {
    // (84 + 86 + 88.5) / 3 = 86.1666… -> 86.25
    expect(averageCvaScore(panel)).toBe(86.25)
    expect(snapToQuarter(86.1666)).toBe(86.25)
  })
  it('drops unscored cards instead of counting them as zero', () => {
    // An unfinished CVA card writes cva_score null. Counting it would drag a
    // passing lot under its mark.
    expect(averageCvaScore([{ cupper_id: 'a', cva_score: 86 }, { cupper_id: 'b', cva_score: null }])).toBe(86)
  })
  it('is null when nobody has scored', () => {
    expect(averageCvaScore([{ cupper_id: 'a', cva_score: null }])).toBeNull()
  })
})

describe('overallFromFinals', () => {
  it('is the SUM of the attribute finals, to 2 decimals', () => {
    expect(overallFromFinals({ Body: 7.5, Acidity: 8.5 })).toBe(16)
    expect(overallFromFinals({ a: 0.1, b: 0.2 })).toBe(0.3)
  })
  it('is null with nothing to add', () => {
    expect(overallFromFinals({})).toBeNull()
  })
})

describe('buildScoreResolution', () => {
  it('averages the panel by default and records who counted', () => {
    const r = buildScoreResolution({
      protocol: 'commodity',
      mode: 'average',
      rows: panel,
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    expect(r.mode).toBe('average')
    expect(r.final_scores).toEqual({ Body: 7.5, Acidity: 8.5 })
    expect(r.overall_score).toBe(16)
    expect(r.included_cupper_ids).toEqual(['a', 'b', 'c'])
    expect(r.excluded_cupper_ids).toEqual([])
    expect(r.source_cupper_id).toBeNull()
    expect(r.resolved_by).toBe('user-1')
  })

  it('re-averages without an excluded cupper', () => {
    const r = buildScoreResolution({
      protocol: 'commodity',
      mode: 'average',
      rows: panel,
      excludedCupperIds: ['c'],
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    // Body: (7 + 7.5) / 2 = 7.25   Acidity: (8 + 8.5) / 2 = 8.25
    expect(r.final_scores).toEqual({ Body: 7.25, Acidity: 8.25 })
    expect(r.excluded_cupper_ids).toEqual(['c'])
    expect(r.included_cupper_ids).toEqual(['a', 'b'])
  })

  it('takes one cupper wholesale when asked', () => {
    const r = buildScoreResolution({
      protocol: 'commodity',
      mode: 'cupper',
      rows: panel,
      sourceCupperId: 'c',
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    expect(r.mode).toBe('cupper')
    expect(r.source_cupper_id).toBe('c')
    expect(r.final_scores).toEqual({ Body: 8, Acidity: 9 })
  })

  it('applies the validator overrides last, and recomputes the overall from them', () => {
    const r = buildScoreResolution({
      protocol: 'commodity',
      mode: 'average',
      rows: panel,
      overrides: { Body: 6.5 },
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    expect(r.final_scores).toEqual({ Body: 6.5, Acidity: 8.5 })
    expect(r.overall_score).toBe(15)
  })

  it('never builds attribute finals for the CVA protocol', () => {
    // Even handed commodity-shaped rows, a cva resolution must carry no
    // attribute values: hasCommodityFinals is the gate every reader uses, and a
    // non-empty final_scores here would put these numbers on the certificate.
    const r = buildScoreResolution({
      protocol: 'cva',
      mode: 'average',
      rows: panel,
      overrides: { Body: 9 },
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    expect(r.final_scores).toEqual({})
    expect(hasCommodityFinals(r)).toBe(false)
  })

  it('averages the CVA panel and leaves commodity finals empty', () => {
    const r = buildScoreResolution({
      protocol: 'cva',
      mode: 'average',
      rows: panel.map(({ cupper_id, cva_score }) => ({ cupper_id, cva_score })),
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    expect(r.cva_score).toBe(86.25)
    expect(r.overall_score).toBeNull()
    expect(r.final_scores).toEqual({})
  })

  it('takes the chosen cupper\'s CVA score, excluding nobody else\'s influence', () => {
    const r = buildScoreResolution({
      protocol: 'cva',
      mode: 'cupper',
      rows: panel.map(({ cupper_id, cva_score }) => ({ cupper_id, cva_score })),
      sourceCupperId: 'a',
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    expect(r.cva_score).toBe(84)
  })
})

describe('parseScoreResolution', () => {
  it('round-trips what buildScoreResolution produced', () => {
    const built = buildScoreResolution({
      protocol: 'commodity',
      mode: 'average',
      rows: panel,
      excludedCupperIds: ['b'],
      resolvedBy: 'user-1',
      resolvedAt: RESOLVED_AT,
    })
    const parsed = parseScoreResolution(JSON.parse(JSON.stringify(built)))
    expect(parsed).toEqual(built)
  })

  it('returns null for anything it does not recognise, so the caller falls back', () => {
    // A certificate with no scores at all is a far worse outcome than one
    // derived the legacy way, so an unreadable blob must read as "absent".
    expect(parseScoreResolution(null)).toBeNull()
    expect(parseScoreResolution('average')).toBeNull()
    expect(parseScoreResolution([])).toBeNull()
    expect(parseScoreResolution({})).toBeNull()
    expect(parseScoreResolution({ mode: 'master' })).toBeNull()
  })

  it('coerces numeric strings and drops junk values', () => {
    const parsed = parseScoreResolution({
      mode: 'average',
      final_scores: { Body: '7.5', Acidity: 8, Junk: 'nutty' },
      overall_score: '15.5',
    })
    expect(parsed?.final_scores).toEqual({ Body: 7.5, Acidity: 8 })
    expect(parsed?.overall_score).toBe(15.5)
    expect(parsed?.increment).toBe(0.25)
  })
})

describe('hasCommodityFinals', () => {
  it('is false for null, and for a resolution carrying no attribute values', () => {
    expect(hasCommodityFinals(null)).toBe(false)
    expect(hasCommodityFinals(parseScoreResolution({ mode: 'average', final_scores: {} }))).toBe(false)
  })
  it('is true once there is a value to print', () => {
    expect(hasCommodityFinals(parseScoreResolution({ mode: 'average', final_scores: { Body: 7 } }))).toBe(true)
  })
  it('is FALSE for a cva resolution however it was shaped', () => {
    // The second lock. buildScoreResolution already refuses to write attribute
    // values for a CVA lot; this makes a hand-written or legacy-shaped row
    // unreadable as commodity finals too, so the envelope's struct fields can
    // never reach a certificate as cupping attributes.
    const cva = parseScoreResolution({
      mode: 'average',
      protocol: 'cva',
      final_scores: { version: 1, score: 86.25, u: 0, d: 0 },
    })
    expect(cva?.protocol).toBe('cva')
    expect(hasCommodityFinals(cva)).toBe(false)
  })
})
