import { describe, it, expect, vi, beforeEach } from 'vitest'

// The certificate reads the lot's spec VERSION through the resolver, never the
// live client_qualities/quality_templates join. The resolver has its own tests;
// here it is a stand-in returning a fixed version.
vi.mock('@/lib/quality-spec/resolve', () => ({
  resolveSampleSpec: vi.fn(),
  resolveSampleSpecs: vi.fn(),
  specVersionStatus: vi.fn(),
}))

import { getCertificateData } from './certificate-data'
import { resolveSampleSpec } from '@/lib/quality-spec/resolve'
import type { ResolvedSpec } from '@/lib/quality-spec/types'

type Filter = { op: string; col: string; value: unknown }

/** Minimal stand-in for the Supabase client, after certificate-data.lab-source.test.ts. */
function fakeDb(rows: Record<string, Array<Record<string, unknown>>>) {
  const tables: string[] = []
  const client = {
    tables,
    from(table: string) {
      tables.push(table)
      const filters: Filter[] = []
      const matches = (row: Record<string, unknown>) =>
        filters.every((f) => {
          if (f.op === 'eq' || f.op === 'is') return row[f.col] === f.value
          if (f.op === 'neq') return row[f.col] !== f.value
          if (f.op === 'in') return (f.value as unknown[]).includes(row[f.col])
          if (f.op === 'contains') {
            const cell = row[f.col]
            return Array.isArray(cell) && (f.value as unknown[]).every((v) => cell.includes(v))
          }
          return true
        })
      const matching = () => (rows[table] ?? []).filter(matches)
      const chain: any = {
        select() { return chain },
        eq(col: string, value: unknown) { filters.push({ op: 'eq', col, value }); return chain },
        is(col: string, value: unknown) { filters.push({ op: 'is', col, value }); return chain },
        in(col: string, value: unknown[]) { filters.push({ op: 'in', col, value }); return chain },
        contains(col: string, value: unknown[]) { filters.push({ op: 'contains', col, value }); return chain },
        neq(col: string, value: unknown) { filters.push({ op: 'neq', col, value }); return chain },
        or() { return chain },
        order() { return chain },
        limit() { return chain },
        single: async () => {
          const [row] = matching()
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          return Promise.resolve({ data: matching(), error: null }).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
  return client
}

const attrs = (bodyMin: number) => [
  { attribute: 'Body', validation_rule: { min_value: bodyMin }, scale: { min: 0, max: 10 } },
  { attribute: 'Flavor', scale: { min: 0, max: 10 } },
]

/** The lot was graded under v1: Body minimum 6.5, moisture max 12.5. */
const v1: ResolvedSpec = {
  id: 'cq-1',
  custom_name: 'Fine Cup',
  quality_code: 'FC',
  template_id: 'tpl-1',
  cups_per_sample: 5,
  discrepancy_threshold: null,
  custom_parameters: {},
  template: {
    id: 'tpl-1',
    name: 'Brazil Fine Cup',
    name_en: 'Brazil Fine Cup',
    description: null,
    parameters: { cupping_attributes: attrs(6.5), moisture_max: 12.5 },
    methodology: 'commodity',
    cupping_scale_min: 0,
    cupping_scale_max: 10,
  },
  version: { id: 'ver-1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: true },
}

function seed() {
  return {
    samples: [
      {
        id: 'lot-1', lab_source_sample_id: null, quality_spec_id: 'cq-1', status: 'approved',
        client_id: 'client-1', origin: 'Brazil', manual_ref_fields: [], bag_count: 320, bag_type: 'jute_bag', bag_weight_kg: 60,
      },
    ],
    companies: [
      { id: 'client-1', name: 'Rich Coop', fantasy_name: null, logo_url: null, country: 'NL', company_types: [], trading_roles: [], qc_settings: null },
    ],
    // The live spec has since moved on: Body minimum 7.5, moisture max 11.5.
    client_qualities: [
      {
        id: 'cq-1', custom_name: 'Fine Cup',
        template: { name: 'Brazil Fine Cup', parameters: { cupping_attributes: attrs(7.5), moisture_max: 11.5 }, methodology: 'commodity' },
      },
    ],
    quality_assessments: [
      { sample_id: 'lot-1', green_bean_data: { moisture_percentage: 11.2 }, roast_data: null, clean_cup: true, uniform_cup: true, cupping_comments: null, grading_comments: null, resolved_defects: null },
    ],
    cupping_sessions: [
      { id: 'sess-1', sample_ids: ['lot-1'], status: 'completed', session_type: null, cupper_ids: ['cupper-1'], master_cupper_id: 'cupper-1' },
    ],
    cupping_scores: [
      { sample_id: 'lot-1', cupper_id: 'cupper-1', protocol: null, scores: { Body: 7, Flavor: 7 }, notes: null, defects: null },
    ],
    certificates: [],
    contracts: [],
  }
}

describe('getCertificateData — the lot\'s spec version', () => {
  beforeEach(() => {
    vi.mocked(resolveSampleSpec).mockReset()
    vi.mocked(resolveSampleSpec).mockResolvedValue(v1)
  })

  it('renders the pinned version\'s cupping minimum, not the live template\'s', async () => {
    const db = fakeDb(seed())
    const data = await getCertificateData('lot-1', db as any)

    expect(resolveSampleSpec).toHaveBeenCalledWith('lot-1')
    const body = data!.cuppingData?.attributes.find((a) => a.name === 'Body')
    expect(body?.allowedMin).toBe(6.5)
    expect(data!.specLimits?.moisture_max).toBe(12.5)
    expect(data!.qualitySpec?.name).toBe('Fine Cup')
    expect(data!.qualitySpec?.has_validation).toBe(true)
    // The live join is gone.
    expect(db.tables).not.toContain('client_qualities')
  })

  it('reads no spec for a sample without a quality', async () => {
    const rows = seed()
    rows.samples[0].quality_spec_id = null as any
    const data = await getCertificateData('lot-1', fakeDb(rows) as any)
    expect(resolveSampleSpec).not.toHaveBeenCalled()
    expect(data!.qualitySpec).toBeNull()
    expect(data!.specLimits).toBeNull()
  })
})
