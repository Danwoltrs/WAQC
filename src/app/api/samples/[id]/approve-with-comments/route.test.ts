import { describe, expect, it } from 'vitest'
import { buildDecision, toScreenLimits } from './route'

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

describe('toScreenLimits', () => {
  it('reads a legacy-only min/max', () => {
    const template = { screen_size_requirements: { '18': { min_percent: 30, max_percent: 80 } } }
    expect(toScreenLimits({}, template)).toEqual([{ screen_size: '18', min: 30, max: 80 }])
  })

  it('reads a constraints-only min/max', () => {
    const parameters = {
      screen_size_requirements: {
        constraints: [{ screen_size: '18', constraint_type: 'range', min_value: 25, max_value: 75 }],
      },
    }
    expect(toScreenLimits(parameters, {})).toEqual([{ screen_size: '18', min: 25, max: 75 }])
  })

  it('takes the strictest bound when both formats configure the same size', () => {
    // Legacy is the tighter minimum (30 > 25); constraints is the tighter
    // maximum (75 < 80). The gate evaluates both independently and requires
    // both to pass, so the adjuster must satisfy the intersection of the two.
    const template = { screen_size_requirements: { '18': { min_percent: 30, max_percent: 80 } } }
    const parameters = {
      screen_size_requirements: {
        constraints: [{ screen_size: '18', constraint_type: 'range', min_value: 25, max_value: 75 }],
      },
    }
    expect(toScreenLimits(parameters, template)).toEqual([{ screen_size: '18', min: 30, max: 75 }])
  })

  it('takes the strictest bound the other way round too', () => {
    // Now constraints has the tighter minimum and legacy has the tighter maximum.
    const template = { screen_size_requirements: { '18': { min_percent: 20, max_percent: 60 } } }
    const parameters = {
      screen_size_requirements: {
        constraints: [{ screen_size: '18', constraint_type: 'range', min_value: 28, max_value: 90 }],
      },
    }
    expect(toScreenLimits(parameters, template)).toEqual([{ screen_size: '18', min: 28, max: 60 }])
  })

  it('skips an exact constraint — evaluateTolerance never offers one to aim at', () => {
    const parameters = {
      screen_size_requirements: {
        constraints: [
          { screen_size: '18', constraint_type: 'exact', min_value: 50 },
          { screen_size: '16', constraint_type: 'minimum', min_value: 10 },
        ],
      },
    }
    expect(toScreenLimits(parameters, {})).toEqual([{ screen_size: '16', min: 10 }])
  })
})
