import { describe, expect, it } from 'vitest'
import { toScreenLimits } from './sample-limits'

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
