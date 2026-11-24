import { describe, expect, it } from 'vitest'
import { buildScreenAdjustmentRows, buildToleranceBlock } from './tolerance-comment-block'
import type { ToleranceItem } from '@/lib/tolerance/types'

const screen: ToleranceItem = {
  key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution',
  direction: 'min', actual: 27.2, limit: 30, gap: 2.8, tolerance: 5,
}

describe('buildToleranceBlock', () => {
  it('states actual, required and gap for each item', () => {
    const html = buildToleranceBlock([screen], ['Melhorar peneira 18.'], false)
    expect(html).toContain('Screen 18')
    expect(html).toContain('27.2%')
    expect(html).toContain('30%')
    expect(html).toContain('Melhorar peneira 18.')
  })

  it('adds the additional sample request when ticked', () => {
    const html = buildToleranceBlock([screen], [], true)
    expect(html).toMatch(/amostra adicional/i)
  })

  it('omits the additional sample request when not ticked', () => {
    expect(buildToleranceBlock([screen], [], false)).not.toMatch(/amostra adicional/i)
  })

  it('returns an empty string when there is nothing to say', () => {
    expect(buildToleranceBlock([], [], false)).toBe('')
  })
})

describe('screen adjustment table', () => {
  // R-SAX-011863: Screen 18 at 25% against a 30% minimum, 5 points short.
  const sax: ToleranceItem = {
    key: 'screen_Screen 18_min', label: 'Screen 18', quadrant: 'distribution',
    direction: 'min', actual: 25, limit: 30, gap: 5, tolerance: 5,
  }
  const rows = buildScreenAdjustmentRows(
    { '17': 71, '18': 25, Pan: 4 },
    { '17': 66 - 1e-6, '18': 30 + 1e-6, Pan: 4 },
    [
      { screen_size: 'Pan', max: 10 },
      { screen_size: 'Screen 18', min: 30 },
    ],
  )

  it('lists every sieve, largest first, with sample, requirement and adjusted', () => {
    expect(rows).toEqual([
      { sieve: '18', sample: 25, requirement: 'mín. 30%', adjusted: 30, short: true },
      { sieve: '17', sample: 71, requirement: null, adjusted: 66, short: false },
      { sieve: 'Fundo', sample: 4, requirement: 'máx. 10%', adjusted: 4, short: false },
    ])
  })

  it('renders the table instead of the single-item screen row, and asks to meet the standard', () => {
    const html = buildToleranceBlock([sax], [], false, rows)
    expect(html).toMatch(/Peneira[\s\S]*Sua amostra[\s\S]*Exigido[\s\S]*Ajustado/)
    expect(html).toContain('66.0%')
    expect(html).toContain('máx. 10%')
    expect(html).not.toContain('Diferença')
    expect(html).toMatch(/atender ao padrão exigido/)
  })

  it('keeps defect items in their own table next to the screen table', () => {
    const defects: ToleranceItem = {
      key: 'total_defects', label: 'Total defects', quadrant: 'defects',
      direction: 'max', actual: 14, limit: 12, gap: 2, tolerance: 5,
    }
    const html = buildToleranceBlock([sax, defects], [], false, rows)
    expect(html).toContain('Total defects')
    expect(html).toContain('Diferença')
    expect(html).toContain('Ajustado')
  })

  it('falls back to the item rows when no table could be built', () => {
    expect(buildToleranceBlock([sax], [], false, [])).toContain('Diferença')
  })
})

import golden from './tolerance-pt-golden.json'

describe('language', () => {
  const items = [
    { key: 'a', label: 'Screen 18', quadrant: 'distribution', direction: 'min', actual: 25, limit: 30, gap: 5, tolerance: 5 },
    { key: 'b', label: 'Defects', quadrant: 'defects', direction: 'max', actual: 12, limit: 8, gap: 4, tolerance: 5 },
  ] as ToleranceItem[]
  const limits = [{ screen_size: 'Pan', max: 10 }, { screen_size: 'Screen 18', min: 30 }, { screen_size: 'Screen 17', min: 5, max: 80 }]
  const actual = { '17': 71, '18': 25, Pan: 4 }
  const issued = { '17': 66, '18': 30, Pan: 4 }

  it('default (no lang) is byte-identical to the PT output before the change', () => {
    const rows = buildScreenAdjustmentRows(actual, issued, limits)
    expect(rows).toEqual(golden.rows)
    expect(buildToleranceBlock(items, ['Obs <1>'], true, rows)).toBe(golden.block)
    expect(buildToleranceBlock(items, [], false)).toBe(golden.plain)
  })

  it('English block has no Portuguese', () => {
    const rows = buildScreenAdjustmentRows(actual, issued, limits, 'en')
    expect(rows.map((r) => r.sieve)).toEqual(['18', '17', 'Pan'])
    expect(rows[0].requirement).toBe('min. 30%')
    expect(rows[2].requirement).toBe('max. 10%')
    const html = buildToleranceBlock(items, [], true, rows, 'en')
    expect(html).toContain('Approved with comments')
    expect(html).toContain('Your sample')
    expect(html).toContain('Please adjust the screen classification to meet the required standard.')
    expect(html).toContain('Please send an additional sample.')
    expect(html).toContain('max. 8')
    expect(html).not.toMatch(/Aprovado|Peneira|Sua amostra|Exigido|Favor/)
  })
})
