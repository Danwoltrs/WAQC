import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ResolvedSpec } from '@/lib/quality-spec/types'

/**
 * The gate judges a lot by the spec VERSION it was pinned to, not by the live
 * template. The resolver is mocked: these tests only prove compliance reads
 * through it (resolve.test.ts covers how a version is picked).
 */

const r = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => r)

import { evaluateQualityCompliance, evaluateSampleCompliance, checkHasValidationRules } from './compliance'

type TableResult = { data: unknown; error?: unknown }

/** Chainable stand-in for the four query shapes compliance.ts uses. */
function fakeSupabase(tables: Record<string, TableResult>) {
  const build = (table: string) => {
    const result: TableResult = tables[table] ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'or', 'in', 'contains', 'order', 'limit', 'is']) {
      chain[method] = () => chain
    }
    chain.single = async () => result
    chain.maybeSingle = async () => result
    chain.then = (resolve: (v: TableResult) => unknown) => resolve(result)
    return chain
  }
  return { from: (table: string) => build(table) } as any
}

const thresholdsOff = {
  defect_thresholds_primary: null,
  defect_thresholds_secondary: null,
  max_taints_allowed: null,
  max_faults_allowed: null,
  screen_size_requirements: null,
}

function resolved(parameters: Record<string, unknown>, over: Partial<ResolvedSpec> = {}): ResolvedSpec {
  return {
    id: 'spec-1',
    custom_name: 'Test',
    quality_code: null,
    template_id: 'tpl-1',
    cups_per_sample: 5,
    discrepancy_threshold: null,
    custom_parameters: {},
    template: { id: 'tpl-1', name: 'Test', name_en: null, description: null, parameters, ...thresholdsOff },
    version: { id: 'v1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: true },
    ...over,
  }
}

/** The live join says 5 quakers; a reader still on it would cite (5). */
const liveTemplate = { data: { id: 'spec-1', custom_name: 'Test', template: { id: 'tpl-1', name: 'Test', parameters: { max_quakers: 5 }, ...thresholdsOff } }, error: null }

beforeEach(() => {
  r.resolveSampleSpec.mockReset()
  r.resolveSampleSpecs.mockReset()
})

describe('evaluateSampleCompliance judges by the lot version', () => {
  it('a lot pinned to max_quakers 8 is judged by 8, while the live template now says 5', async () => {
    r.resolveSampleSpec.mockResolvedValue(resolved({ max_quakers: 8 }))
    const supabase = fakeSupabase({
      client_qualities: liveTemplate,
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { quakers: 12 } } },
    })
    const result = await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')
    expect(result.violations).toEqual(['Quakers: 12 exceeds maximum (8)'])
    expect(r.resolveSampleSpec.mock.calls[0][0]).toBe('sample-1')
  })

  it('never pins: only the grading and cupping routes start a lot on its version', async () => {
    r.resolveSampleSpec.mockResolvedValue(resolved({}))
    const supabase = fakeSupabase({ cupping_scores: { data: [] }, quality_assessments: { data: null } })
    await evaluateSampleCompliance(supabase, 'sample-1', 'spec-1')
    expect(r.resolveSampleSpec).toHaveBeenCalled()
    for (const call of r.resolveSampleSpec.mock.calls) expect(call[1]?.pin).toBeFalsy()
  })

  it('auto-approves without asking the resolver when there is no quality spec', async () => {
    expect(await evaluateSampleCompliance(fakeSupabase({}), 'sample-1', null)).toEqual([])
    expect(r.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('a version without a template auto-approves, as a missing template did', async () => {
    r.resolveSampleSpec.mockResolvedValue(resolved({}, { template: null }))
    expect(await evaluateSampleCompliance(fakeSupabase({}), 'sample-1', 'spec-1')).toEqual([])
  })

  it('a resolver read error is not turned into an approval', async () => {
    r.resolveSampleSpec.mockRejectedValue(new Error('resolveSampleSpecs: could not read samples: boom'))
    await expect(evaluateQualityCompliance(fakeSupabase({}), 'sample-1', 'spec-1')).rejects.toThrow('boom')
  })
})

describe('checkHasValidationRules reads the lot version', () => {
  it('is true when the version carries rules the live template has dropped', async () => {
    r.resolveSampleSpec.mockResolvedValue(resolved({ max_quakers: 8 }))
    const supabase = fakeSupabase({ client_qualities: { data: { id: 'spec-1', template: { id: 'tpl-1', parameters: {} } } } })
    expect(await checkHasValidationRules(supabase, 'spec-1', 'sample-1')).toBe(true)
    expect(r.resolveSampleSpec.mock.calls[0][0]).toBe('sample-1')
  })

  it('is false when the version has no rules', async () => {
    r.resolveSampleSpec.mockResolvedValue(resolved({}))
    expect(await checkHasValidationRules(fakeSupabase({}), 'spec-1', 'sample-1')).toBe(false)
  })

  it('is false without a quality spec, without asking the resolver', async () => {
    expect(await checkHasValidationRules(fakeSupabase({}), null, 'sample-1')).toBe(false)
    expect(r.resolveSampleSpec).not.toHaveBeenCalled()
  })
})
