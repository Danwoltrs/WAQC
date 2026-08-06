import { describe, it, expect } from 'vitest'
import { evaluateCompliance, criteriaToViolations, type ComplianceInputs } from './compliance-criteria'

const base: ComplianceInputs = {
  parameters: {},
  template: {
    defect_thresholds_primary: null,
    defect_thresholds_secondary: null,
    max_taints_allowed: null,
    max_faults_allowed: null,
    screen_size_requirements: null,
  },
  cuppingScores: [],
  masterCupperId: null,
  greenBean: null,
}

const find = (criteria: ReturnType<typeof evaluateCompliance>, key: string) =>
  criteria.find(c => c.key === key)

describe('evaluateCompliance — defect counts', () => {
  const inputs: ComplianceInputs = {
    ...base,
    template: { ...base.template, defect_thresholds_primary: 1, defect_thresholds_secondary: 21 },
    parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
    greenBean: { defects: { primary: 1, secondary: 21 } },
  }

  it('emits a row for each configured threshold, passing or failing', () => {
    const criteria = evaluateCompliance(inputs)
    expect(find(criteria, 'primary_defects')).toMatchObject({ actual: 1, limit: 1, passed: true })
    expect(find(criteria, 'secondary_defects')).toMatchObject({ actual: 21, limit: 21, passed: true })
    expect(find(criteria, 'total_defects')).toMatchObject({ actual: 22, limit: 21, passed: false })
  })

  it('describes the total as its composition', () => {
    expect(find(evaluateCompliance(inputs), 'total_defects')?.sublabel)
      .toBe('1 primary + 21 secondary · max 21')
  })

  it('emits no row for a threshold the template does not set', () => {
    const criteria = evaluateCompliance({
      ...base,
      parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
      greenBean: { defects: { primary: 1, secondary: 21 } },
    })
    expect(find(criteria, 'primary_defects')).toBeUndefined()
    expect(find(criteria, 'total_defects')).toBeDefined()
  })

  it('emits nothing when there is no defect record', () => {
    expect(evaluateCompliance({ ...base, greenBean: {} })).toEqual([])
  })
})

describe('evaluateCompliance — screens', () => {
  it('judges the percentage, not the grams', () => {
    const criteria = evaluateCompliance({
      ...base,
      template: { ...base.template, screen_size_requirements: { '16': { min_percent: 80 } } },
      greenBean: { screen_sizes: { '16': 750, '15': 250 } },
    })
    expect(find(criteria, 'screen_16')).toMatchObject({ actual: 75, limit: 80, passed: false })
  })
})

describe('evaluateCompliance — cupping attributes', () => {
  it('passes a score inside its band and fails one outside', () => {
    const inputs: ComplianceInputs = {
      ...base,
      parameters: {
        cupping_attributes: [
          { attribute: 'Body', validation_rule: { min_value: 3, max_value: 5 } },
          { attribute: 'Acidity', validation_rule: { min_value: 3, max_value: 5 } },
        ],
      },
      cuppingScores: [{ cupper_id: 'c1', scores: { Body: 4, Acidity: 2 }, defects: null }],
    }
    const criteria = evaluateCompliance(inputs)
    expect(find(criteria, 'cupping_Body')).toMatchObject({ passed: true })
    expect(find(criteria, 'cupping_Acidity')).toMatchObject({ passed: false, operator: 'outside' })
  })
})

describe('evaluateCompliance — taints and faults', () => {
  it('rejects any taint when no tolerance is configured', () => {
    const criteria = evaluateCompliance({
      ...base,
      cuppingScores: [{ cupper_id: 'c1', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } }],
    })
    expect(find(criteria, 'cupping_taints')).toMatchObject({ passed: false, limit: null })
  })

  it('passes within a configured limit', () => {
    const criteria = evaluateCompliance({
      ...base,
      parameters: { taint_fault_configuration: { rules: { max_taints: 2, max_faults: 0 } } },
      cuppingScores: [{ cupper_id: 'c1', scores: null, defects: { taints: [{ name: 'a' }], faults: [] } }],
    })
    expect(find(criteria, 'cupping_taints')).toMatchObject({ actual: 1, limit: 2, passed: true })
    expect(find(criteria, 'cupping_faults')).toMatchObject({ actual: 0, limit: 0, passed: true })
  })
})

describe('criteriaToViolations', () => {
  it('returns the legacy sentence for each failure, in order', () => {
    const criteria = evaluateCompliance({
      ...base,
      template: { ...base.template, defect_thresholds_primary: 1 },
      parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
      greenBean: { defects: { primary: 5, secondary: 21 } },
    })
    expect(criteriaToViolations(criteria)).toEqual([
      'Primary defects: 5 exceeds limit (1)',
      'Total defects: 26 exceeds limit (21)',
    ])
  })

  it('returns nothing when everything passed', () => {
    const criteria = evaluateCompliance({
      ...base,
      template: { ...base.template, defect_thresholds_primary: 10 },
      greenBean: { defects: { primary: 1, secondary: 2 } },
    })
    expect(criteriaToViolations(criteria)).toEqual([])
  })
})
