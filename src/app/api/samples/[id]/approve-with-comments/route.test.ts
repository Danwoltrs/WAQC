import { describe, expect, it } from 'vitest'
import { buildDecision } from './route'

describe('buildDecision', () => {
  const items = [
    { key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution' as const,
      direction: 'min' as const, actual: 27.2, limit: 30, gap: 2.8, tolerance: 5 },
  ]

  it('records every metric with its gap and tolerance', () => {
    const d = buildDecision({
      items,
      issued: { screen_percentages: { '18': 30 }, defects: null },
      comments: ['Melhorar peneira 18 para no minimo 30%.'],
      requestAdditionalSample: true,
      userId: 'user-1',
    })
    expect(d.metrics).toHaveLength(1)
    expect(d.metrics[0]).toMatchObject({ key: 'screen_18_min', gap: 2.8, tolerance: 5 })
    expect(d.issued_values.screen_percentages).toEqual({ '18': 30 })
    expect(d.request_additional_sample).toBe(true)
    expect(d.decided_by).toBe('user-1')
  })

  it('drops blank comment lines', () => {
    const d = buildDecision({
      items, issued: { screen_percentages: null, defects: null },
      comments: ['  ', 'Reduzir fundo.'], requestAdditionalSample: false, userId: 'u',
    })
    expect(d.comments).toEqual(['Reduzir fundo.'])
  })
})
