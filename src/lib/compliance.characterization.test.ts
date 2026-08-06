import { describe, it, expect } from 'vitest'
import { evaluateQualityCompliance } from './compliance'

/**
 * A minimal stand-in for the Supabase client, covering only the four query
 * shapes compliance.ts uses. Every builder method returns the same chainable
 * object; awaiting it, or calling .single()/.maybeSingle(), yields whatever was
 * configured for that table.
 *
 * This is deliberately local to this file. The repo tests pure functions and
 * has no shared Supabase mock; adding one would invite route tests that mock
 * the database instead of extracting the logic — which is exactly what this
 * plan is undoing.
 */
type TableResult = { data: unknown; error?: unknown }

function fakeSupabase(tables: Record<string, TableResult>) {
  const build = (table: string) => {
    const result: TableResult = tables[table] ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'contains', 'order', 'limit']) {
      chain[method] = () => chain
    }
    chain.single = async () => result
    chain.maybeSingle = async () => result
    // compliance.ts awaits the cupping_scores builder directly, without a
    // terminal method, so the chain has to be thenable.
    chain.then = (resolve: (v: TableResult) => unknown) => resolve(result)
    return chain
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => build(table) } as any
}

/** A template row with no thresholds set. Spread and override per test. */
const emptyTemplate = {
  id: 'tpl-1',
  name: 'Test',
  parameters: {},
  defect_thresholds_primary: null,
  defect_thresholds_secondary: null,
  max_taints_allowed: null,
  max_faults_allowed: null,
  screen_size_requirements: null,
}

function specRow(template: Record<string, unknown>) {
  return { data: { id: 'spec-1', custom_name: 'Test', template }, error: null }
}

describe('evaluateQualityCompliance — characterization', () => {
  it('auto-approves when there is no quality spec', async () => {
    const result = await evaluateQualityCompliance(fakeSupabase({}), 'sample-1', null)
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it('auto-approves when the spec has no template', async () => {
    const supabase = fakeSupabase({ client_qualities: { data: { id: 'spec-1' }, error: null } })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it('approves a lot with no data to judge', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow(emptyTemplate),
      cupping_scores: { data: [] },
      quality_assessments: { data: null },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })
})

describe('evaluateQualityCompliance — defect counts', () => {
  const template = {
    ...emptyTemplate,
    defect_thresholds_primary: 1,
    defect_thresholds_secondary: 21,
    parameters: { defect_configuration: { thresholds: { max_total: 21 } } },
  }

  function withDefects(primary: number, secondary: number) {
    return fakeSupabase({
      client_qualities: specRow(template),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { defects: { primary, secondary } } } },
    })
  }

  it('rejects on the computed total while primary and secondary each pass', async () => {
    const result = await evaluateQualityCompliance(withDefects(1, 21), 'sample-1', 'spec-1')
    expect(result.approved).toBe(false)
    expect(result.violations).toEqual(['Total defects: 22 exceeds limit (21)'])
  })

  it('approves when every count is inside its limit', async () => {
    const result = await evaluateQualityCompliance(withDefects(0, 21), 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it('reports primary, secondary and total independently', async () => {
    const result = await evaluateQualityCompliance(withDefects(5, 30), 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Primary defects: 5 exceeds limit (1)',
      'Secondary defects: 30 exceeds limit (21)',
      'Total defects: 35 exceeds limit (21)',
    ])
  })

  it('ignores a stored defects.total that disagrees with the sum', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow(template),
      cupping_scores: { data: [] },
      quality_assessments: {
        data: { green_bean_data: { defects: { primary: 1, secondary: 21, total: 5 } } },
      },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Total defects: 22 exceeds limit (21)'])
  })
})

describe('evaluateQualityCompliance — screen sizes', () => {
  const grams = { '16': 750, '15': 200, '14': 50 }

  it('normalises grams to percent (legacy template format)', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        screen_size_requirements: { '16': { min_percent: 80 } },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 16: 75.0% is below minimum (80%)'])
  })

  it('applies constraint-format minimums', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        parameters: {
          screen_size_requirements: {
            constraints: [{ screen_size: '16', constraint_type: 'minimum', min_value: 80 }],
          },
        },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 16: 75.0% is below minimum (80%)'])
  })

  it('applies constraint-format maximums', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        parameters: {
          screen_size_requirements: {
            constraints: [{ screen_size: '14', constraint_type: 'maximum', max_value: 2 }],
          },
        },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 14: 5.0% exceeds maximum (2%)'])
  })

  it('treats a screen absent from the data as 0%', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        screen_size_requirements: { '18': { min_percent: 10 } },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { screen_sizes: grams } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Screen 18: 0.0% is below minimum (10%)'])
  })
})

describe('evaluateQualityCompliance — cupping attributes', () => {
  function withScores(
    parameters: Record<string, unknown>,
    scores: Array<{ cupper_id: string | null; scores: Record<string, number>; defects?: unknown }>,
    masterCupperId: string | null = null,
  ) {
    return fakeSupabase({
      client_qualities: specRow({ ...emptyTemplate, parameters }),
      cupping_scores: { data: scores },
      quality_assessments: { data: null },
      cupping_sessions: { data: masterCupperId ? { master_cupper_id: masterCupperId } : null },
    })
  }

  const arrayFormat = {
    cupping_attributes: [
      { attribute: 'Body', validation_rule: { min_value: 3, max_value: 5 } },
    ],
  }

  it('flags a score below the minimum (array template format)', async () => {
    const supabase = withScores(arrayFormat, [{ cupper_id: 'c1', scores: { Body: 2 } }])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 2.00 is below minimum (3)'])
  })

  it('flags a score above the maximum (array template format)', async () => {
    const supabase = withScores(arrayFormat, [{ cupper_id: 'c1', scores: { Body: 6 } }])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 6.00 is above maximum (5)'])
  })

  it('accepts the object template format', async () => {
    const supabase = withScores(
      { cupping_attributes: { Body: { min: 3, max: 5 } } },
      [{ cupper_id: 'c1', scores: { Body: 2 } }],
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 2.00 is below minimum (3)'])
  })

  it('averages across cuppers when no master cupper is designated', async () => {
    const supabase = withScores(arrayFormat, [
      { cupper_id: 'c1', scores: { Body: 2 } },
      { cupper_id: 'c2', scores: { Body: 4 } },
    ])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })

  it("uses the master cupper's score instead of the mean", async () => {
    const supabase = withScores(
      arrayFormat,
      [
        { cupper_id: 'master', scores: { Body: 2 } },
        { cupper_id: 'c2', scores: { Body: 5 } },
      ],
      'master',
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Body: 2.00 is below minimum (3)'])
  })

  it('ignores attributes the template does not configure', async () => {
    const supabase = withScores(arrayFormat, [{ cupper_id: 'c1', scores: { Acidity: 0 } }])
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result).toEqual({ approved: true, violations: [] })
  })
})

describe('evaluateQualityCompliance — taints, faults and physicals', () => {
  function withDefectScores(
    parameters: Record<string, unknown>,
    templateExtra: Record<string, unknown>,
    defects: unknown,
    masterCupperId: string | null = null,
  ) {
    return fakeSupabase({
      client_qualities: specRow({ ...emptyTemplate, ...templateExtra, parameters }),
      cupping_scores: { data: [{ cupper_id: 'c1', scores: {}, defects }] },
      quality_assessments: { data: null },
      cupping_sessions: { data: masterCupperId ? { master_cupper_id: masterCupperId } : null },
    })
  }

  it('rejects any taint when no tolerance is configured', async () => {
    const supabase = withDefectScores({}, {}, { taints: [{ name: 'Fermented' }], faults: [] })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Cupping taints detected: 1 (no tolerance configured, rejecting by default)',
    ])
  })

  it('honours a configured taint limit', async () => {
    const supabase = withDefectScores(
      { taint_fault_configuration: { rules: { max_taints: 2 } } },
      {},
      { taints: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], faults: [] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Cupping taints: 3 exceeds limit (2)'])
  })

  it('honours zero tolerance', async () => {
    const supabase = withDefectScores(
      { taint_fault_configuration: { rules: { zero_tolerance: true } } },
      {},
      { taints: [{ name: 'a' }], faults: [{ name: 'b' }] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Zero tolerance: 1 taint(s) and 1 fault(s) detected'])
  })

  it('honours a combined limit', async () => {
    const supabase = withDefectScores(
      { taint_fault_configuration: { rules: { max_combined: 1 } } },
      {},
      { taints: [{ name: 'a' }], faults: [{ name: 'b' }] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Cupping defects combined: 2 exceeds limit (1)'])
  })

  it('falls back to the template column limits', async () => {
    const supabase = withDefectScores(
      {},
      { max_taints_allowed: 1, max_faults_allowed: 0 },
      { taints: [{ name: 'a' }, { name: 'b' }], faults: [{ name: 'c' }] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Cupping taints: 2 exceeds limit (1)',
      'Cupping faults: 1 exceeds limit (0)',
    ])
  })

  it('flags a defect intensity above its configured level', async () => {
    const supabase = withDefectScores(
      {
        defect_limits: { fermented: { max_level: 2 } },
        taint_fault_configuration: { rules: { max_taints: 5 } },
      },
      {},
      { taints: [{ name: 'Fermented', intensity: 4 }], faults: [] },
    )
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual([
      'Taint "Fermented": Intensity 4 exceeds maximum (2)',
    ])
  })

  it('flags moisture outside its band', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({
        ...emptyTemplate,
        parameters: { moisture_min: 10, moisture_max: 12 },
      }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { moisture_percentage: 13.4 } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Moisture: 13.4% exceeds maximum (12%)'])
  })

  it('flags quakers above the maximum', async () => {
    const supabase = fakeSupabase({
      client_qualities: specRow({ ...emptyTemplate, parameters: { max_quakers: 5 } }),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { quakers: 9 } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Quakers: 9 exceeds maximum (5)'])
  })
})
