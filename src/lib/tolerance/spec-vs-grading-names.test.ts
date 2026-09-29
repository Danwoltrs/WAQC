import { describe, expect, it } from 'vitest'
import { evaluateCompliance, criteriaToViolations, type ComplianceInputs } from '@/lib/compliance-criteria'
import { screenGramsToPercent } from '@/lib/quality-resolvers'
import { evaluateTolerance } from './evaluate'
import { computeIssuedValues } from './issued-values'
import { toScreenLimits } from './sample-limits'

/**
 * Ahold SAX (template v10): the spec names its sieves "Screen 18"/"Screen 17",
 * the lots' grams sit under "18"/"17". Approve-with-comments has to read the
 * same 25% the gate reads, offer it, and issue a distribution the gate passes.
 */
const saxParameters = {
  screen_size_requirements: {
    constraints: [
      { screen_size: 'Pan', constraint_type: 'maximum', max_value: 10 },
      { screen_size: 'Screen 17', constraint_type: 'any' },
      { screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 30 },
    ],
  },
}

const lot = (grams: Record<string, number>): ComplianceInputs => ({
  parameters: saxParameters as any,
  template: {
    defect_thresholds_primary: null,
    defect_thresholds_secondary: null,
    max_taints_allowed: null,
    max_faults_allowed: null,
    screen_size_requirements: null,
  },
  cuppingScores: [],
  masterCupperId: null,
  greenBean: { screen_sizes: grams },
})

const issue = (inputs: ComplianceInputs) =>
  computeIssuedValues({
    inputs,
    screenPercentages: screenGramsToPercent(inputs.greenBean!.screen_sizes),
    screenLimits: toScreenLimits(inputs.parameters, inputs.template),
    defectCounts: null,
    defectConfigs: [],
    defectLimits: {},
  })

describe('approve with comments across spec and grading sieve names', () => {
  it('offers R-SAX-011863 (Screen 18 at 25%, exactly 5 points short)', () => {
    const t = evaluateTolerance(evaluateCompliance(lot({ '17': 71, '18': 25, Pan: 4 })))
    expect(t.offered).toBe(true)
    expect(t.items).toEqual([
      expect.objectContaining({ label: 'Screen 18', actual: 25, limit: 30, gap: 5, direction: 'min' }),
    ])
  })

  it('issues 30% on the sieve the grading saved, and the gate passes it', () => {
    const r = issue(lot({ '17': 71, '18': 25, Pan: 4 }))
    if (!r.ok) throw new Error(r.reason)
    const s = r.issued.screen_percentages!
    expect(s['18']).toBeGreaterThanOrEqual(30)
    expect(s['18']).toBeLessThan(30.001)
    expect(s.Pan).toBe(4)
    expect(Object.keys(s).sort()).toEqual(['17', '18', 'Pan'])
  })

  it('refuses R-SAX-011865 (Screen 18 at 23%, 7 points short)', () => {
    const criteria = evaluateCompliance(lot({ '17': 74, '18': 23, Pan: 3 }))
    expect(criteriaToViolations(criteria)).toEqual(['Screen 18: 23.0% is below minimum (30%)'])
    expect(evaluateTolerance(criteria)).toMatchObject({ offered: false, blockedBy: ['screen_Screen 18_min'] })
  })

  it('still offers the StoneX ME-1121 reference case (28% vs 30%) under either naming', () => {
    const namings: Record<string, number>[] = [{ '18': 28, '17': 72 }, { 'Screen 18': 28, 'Screen 17': 72 }]
    for (const grams of namings) {
      const inputs = lot(grams)
      expect(evaluateTolerance(evaluateCompliance(inputs)).offered).toBe(true)
      const r = issue(inputs)
      if (!r.ok) throw new Error(r.reason)
    }
  })

  it('offers a 5-point gap that float drift would otherwise push past the line', () => {
    // 32.2 - 27.2 is 5.0000000000000036 in floating point.
    const inputs = lot({ '18': 272, '17': 678, Pan: 50 })
    inputs.parameters = {
      screen_size_requirements: {
        constraints: [{ screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 32.2 }],
      },
    } as any
    expect(evaluateTolerance(evaluateCompliance(inputs)).offered).toBe(true)
  })
})

describe('toScreenLimits across naming', () => {
  it('merges a legacy "18" and a constraint "Screen 18" into the stricter bound', () => {
    const limits = toScreenLimits(
      { screen_size_requirements: { constraints: [{ screen_size: 'Screen 18', constraint_type: 'minimum', min_value: 30 }] } },
      { screen_size_requirements: { '18': { min_percent: 35 } } },
    )
    expect(limits).toEqual([{ screen_size: '18', min: 35 }])
  })
})
