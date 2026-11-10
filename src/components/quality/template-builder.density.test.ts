import { describe, it, expect } from 'vitest'
import { carryDensityLimits } from './template-builder'

describe('carryDensityLimits', () => {
  it('keeps both density limits of the template being edited', () => {
    const out = carryDensityLimits({ moisture_max: 12 }, { density_min: 0.65, density_max: 0.72 })
    expect(out).toEqual({ moisture_max: 12, density_min: 0.65, density_max: 0.72 })
  })
  it('keeps a one-sided limit', () => {
    expect(carryDensityLimits({}, { density_min: 0.65 })).toEqual({ density_min: 0.65 })
  })
  it('a template without them does not gain them', () => {
    expect(carryDensityLimits({ moisture_max: 12 }, { moisture_max: 11 })).toEqual({ moisture_max: 12 })
    expect(carryDensityLimits({}, undefined)).toEqual({})
  })
})
