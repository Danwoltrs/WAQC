import { describe, expect, it } from 'vitest'
import { buildIssuedGreenBean, computeIssuedValues } from './issued-values'
import type { DefectConfig } from '@/types/defect-configuration'
import type { ComplianceInputs, GreenBeanData } from '@/lib/compliance-criteria'

const configs: DefectConfig[] = [
  { name: 'Full Black', weight: 1, category: 'primary', display_order: 0 },
  { name: 'Broken', weight: 0.2, category: 'secondary', display_order: 1 },
]

const baseInputs = (): ComplianceInputs => ({
  parameters: {
    screen_size_requirements: {
      constraints: [{ screen_size: '18', constraint_type: 'minimum', min_value: 30 }],
    },
  },
  template: {
    defect_thresholds_primary: null,
    defect_thresholds_secondary: null,
    max_taints_allowed: null,
    max_faults_allowed: null,
    screen_size_requirements: null,
  },
  cuppingScores: [],
  masterCupperId: null,
  greenBean: { screen_sizes: { '18': 272, '15': 689, Pan: 39 } },
})

describe('buildIssuedGreenBean', () => {
  it('writes issued percentages into the grams slot without touching the input', () => {
    const green = { screen_sizes: { '18': 272, '15': 689, Pan: 39 } }
    const out = buildIssuedGreenBean(green, {
      screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 },
      defects: null,
    })
    expect(out.screen_sizes).toEqual({ '18': 30, '15': 66.1, Pan: 3.9 })
    expect(green.screen_sizes['18']).toBe(272)
  })

  it('writes issued defect counts and totals together', () => {
    const green: GreenBeanData = { defects: { counts: { Broken: 60 }, primary: 2, secondary: 12 } }
    const out = buildIssuedGreenBean(
      green,
      { screen_percentages: null, defects: { counts: { Broken: 50 }, primary: 2, secondary: 10, total: 12 } },
    )
    expect(out.defects).toMatchObject({ counts: { Broken: 50 }, primary: 2, secondary: 10 })
  })
})

describe('computeIssuedValues', () => {
  it('issues a distribution that the compliance gate then passes', () => {
    const r = computeIssuedValues({
      inputs: baseInputs(),
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [{ screen_size: '18', min: 30 }],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.screen_percentages?.['18']).toBeCloseTo(30)
  })

  it('refuses when the adjusted values would still violate the gate', () => {
    const inputs = baseInputs()
    inputs.parameters.moisture_max = 11
    inputs.greenBean = { ...inputs.greenBean!, moisture_percentage: 13 }
    const r = computeIssuedValues({
      inputs,
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [{ screen_size: '18', min: 30 }],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    expect(r.ok).toBe(false)
  })

  it('propagates a distribution refusal', () => {
    const r = computeIssuedValues({
      inputs: baseInputs(),
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [
        { screen_size: '18', min: 30 },
        { screen_size: '15', min: 68.9 },
        { screen_size: 'Pan', min: 3.9 },
      ],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    expect(r.ok).toBe(false)
  })

  it('refuses when a criterion unrelated to the adjusters fails, proving the gate is re-run', () => {
    const inputs = baseInputs()
    inputs.parameters.max_quakers = 2
    inputs.greenBean = { ...inputs.greenBean!, quakers: 10 }
    const r = computeIssuedValues({
      inputs,
      screenPercentages: { '18': 27.2, '15': 68.9, Pan: 3.9 },
      screenLimits: [{ screen_size: '18', min: 30 }],
      defectCounts: null,
      defectConfigs: configs,
      defectLimits: {},
    })
    if (r.ok) throw new Error('Expected failure due to quaker limit')
    expect(r.reason).toContain('Quaker')
  })
})
