import { describe, expect, it, vi } from 'vitest'

const r = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => r)

import { toScreenLimits, computeIssuedValuesForSample } from './sample-limits'

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

describe('computeIssuedValuesForSample reads the lot version', () => {
  /** Only quality_assessments is read from the db now; the spec comes from the resolver. */
  const db = (greenBean: Record<string, unknown>) => {
    const chain: any = {}
    for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain
    chain.single = async () => ({ data: { green_bean_data: greenBean }, error: null })
    return { from: () => chain } as any
  }
  const version = (template: Record<string, unknown> | null) => ({
    id: 'spec-1', custom_name: null, quality_code: null, template_id: 'tpl', cups_per_sample: null,
    discrepancy_threshold: null, custom_parameters: {},
    template: template && { id: 'tpl', name: 'T', name_en: null, description: null, parameters: {}, ...template },
    version: { id: 'v2', versionNo: 2, effectiveFrom: '2026-10-01', pinned: true },
  })

  it("aims the adjustment at the version's screen minimum", async () => {
    r.resolveSampleSpec.mockResolvedValue(version({ screen_size_requirements: { '18': { min_percent: 30 } } }))
    const out = await computeIssuedValuesForSample(db({ screen_sizes: { '18': 27.2, '15': 68.9, Pan: 3.9 } }), 'lab-1', 'spec-1')
    if (!out.ok) throw new Error(out.reason)
    expect(out.issued.screen_percentages?.['18']).toBeCloseTo(30)
    expect(r.resolveSampleSpec.mock.calls[0][0]).toBe('lab-1')
    expect(r.resolveSampleSpec.mock.calls[0][1]?.pin).toBeFalsy()
  })

  it('a version without a template has nothing to aim at', async () => {
    r.resolveSampleSpec.mockResolvedValue(version(null))
    expect(await computeIssuedValuesForSample(db({}), 'lab-1', 'spec-1')).toEqual({ ok: false, reason: 'Quality template not found' })
  })
})
