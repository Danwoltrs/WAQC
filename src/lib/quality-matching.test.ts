import { describe, it, expect } from 'vitest'
import { matchQuality, type QualitySpecCandidate } from './quality-matching'

// Helper: build a candidate with sensible nulls.
const spec = (over: Partial<QualitySpecCandidate> & { id: string }): QualitySpecCandidate => ({
  custom_name: null,
  quality_code: null,
  template_name: null,
  ...over,
})

describe('matchQuality', () => {
  it('worked example: "NY 2/3 17/18 FC" auto-selects "17/18 FC", not the 14/16 spec', () => {
    const specs = [
      spec({ id: 'a', custom_name: '17/18 FC' }),
      spec({ id: 'b', custom_name: '14/16 Fine Cup' }),
    ]
    const m = matchQuality('NY 2/3 17/18 FC', specs)
    expect(m.confidence).toBe('high')
    expect(m.matched).toBe(true)
    expect(m.spec_id).toBe('a')
    expect(m.spec_label).toBe('17/18 FC')
    expect(m.source_text).toBe('NY 2/3 17/18 FC')
  })

  it('expands the FC abbreviation to match a "Fine Cup" spec name', () => {
    const specs = [spec({ id: 'a', custom_name: '17/18 Fine Cup' })]
    expect(matchQuality('17/18 FC', specs).spec_id).toBe('a')
  })

  it('matches across spec fields (screen in quality_code, cup in template name)', () => {
    const specs = [
      spec({ id: 'a', custom_name: 'Floriana Premium', quality_code: '17/18', template_name: 'Brazil Fine Cup' }),
    ]
    expect(matchQuality('17/18 FC', specs).spec_id).toBe('a')
  })

  it('disqualifies a screen-size mismatch (14/16 contract must not pick a 17/18 spec)', () => {
    const specs = [spec({ id: 'a', custom_name: '17/18 FC' })]
    const m = matchQuality('14/16 FC', specs)
    expect(m.confidence).toBe('none')
    expect(m.spec_id).toBeNull()
  })

  it('picks the screen-matching spec when a mismatched one is also present', () => {
    const specs = [
      spec({ id: 'a', custom_name: '14/16 Fine Cup' }),
      spec({ id: 'b', custom_name: '17/18 FC' }),
    ]
    expect(matchQuality('17/18 FC', specs).spec_id).toBe('b')
  })

  it('strips NY defect grades and matches on screen alone', () => {
    const specs = [spec({ id: 'a', custom_name: '17/18' })]
    const m = matchQuality('NY 2 17/18', specs)
    expect(m.confidence).toBe('high')
    expect(m.spec_id).toBe('a')
  })

  it('exact cup match with no screen size is high confidence', () => {
    const specs = [spec({ id: 'a', custom_name: 'Fine Cup' })]
    expect(matchQuality('Fine Cup', specs).confidence).toBe('high')
  })

  it('matches the plus screen-size form (16+)', () => {
    const specs = [spec({ id: 'a', custom_name: '16+ Fine Cup' })]
    expect(matchQuality('16+ FC', specs).spec_id).toBe('a')
  })

  it('ambiguous tie (two identical specs) does not auto-select', () => {
    const specs = [
      spec({ id: 'a', custom_name: '17/18 FC' }),
      spec({ id: 'b', custom_name: '17/18 FC' }),
    ]
    const m = matchQuality('17/18 FC', specs)
    expect(m.confidence).toBe('low')
    expect(m.spec_id).toBeNull()
  })

  it('screen present on contract but absent of cup detail across specs -> no auto-select', () => {
    const specs = [
      spec({ id: 'a', custom_name: '17/18 FC' }),
      spec({ id: 'b', custom_name: '17/18 GC' }),
    ]
    // contract gives only the screen size -> can't disambiguate FC vs GC
    expect(matchQuality('17/18', specs).confidence).toBe('low')
  })

  it('different cup tokens with no screen -> no match', () => {
    const specs = [spec({ id: 'a', custom_name: 'Good Cup' })]
    expect(matchQuality('Fine Cup', specs).confidence).toBe('none')
  })

  it('empty spec list -> none', () => {
    expect(matchQuality('17/18 FC', []).confidence).toBe('none')
  })

  it('null / empty contract text -> none', () => {
    expect(matchQuality(null, [spec({ id: 'a', custom_name: '17/18 FC' })]).confidence).toBe('none')
    expect(matchQuality('', [spec({ id: 'a', custom_name: '17/18 FC' })]).confidence).toBe('none')
  })
})
