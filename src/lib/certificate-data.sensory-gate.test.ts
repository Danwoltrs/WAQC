import { describe, it, expect, vi, beforeEach } from 'vitest'

const resolver = vi.hoisted(() => ({ resolveSampleSpec: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => resolver)

import { getCertificateData } from './certificate-data'

/**
 * The sensory result is frozen on the LAB UNIT and every contract sibling
 * reads it, but siblings can sit on different client qualities. Each
 * certificate prints what its own quality asks: notes only with notes on,
 * the profile line only when its quality points at the answered profile.
 * Fake DB copied from certificate-data.lab-source.test.ts.
 */
type Filter = { op: 'eq' | 'is' | 'in' | 'contains' | 'neq' | 'or'; col: string; value: unknown }
type Query = { table: string; filters: Filter[] }

function fakeDb(rows: Record<string, Array<Record<string, unknown>>>) {
  const queries: Query[] = []
  const client = {
    queries,
    /** Every filter applied to any query on `table`, in call order. */
    filtersOn(table: string): Filter[] {
      return queries.filter((q) => q.table === table).flatMap((q) => q.filters)
    },
    from(table: string) {
      const filters: Filter[] = []
      queries.push({ table, filters })
      const matches = (row: Record<string, unknown>) =>
        filters.every((f) => {
          switch (f.op) {
            case 'eq':
            case 'is':
              return row[f.col] === f.value
            case 'neq':
              return row[f.col] !== f.value
            case 'in':
              return (f.value as unknown[]).includes(row[f.col])
            case 'contains': {
              const cell = row[f.col]
              return Array.isArray(cell) && (f.value as unknown[]).every((v) => cell.includes(v))
            }
            default:
              // `.or(...)` carries the commodity-protocol clause; the seeded
              // score rows leave `protocol` null, which that clause admits.
              return true
          }
        })
      const matching = () => (rows[table] ?? []).filter(matches)
      const chain: any = {
        select() { return chain },
        eq(col: string, value: unknown) { filters.push({ op: 'eq', col, value }); return chain },
        is(col: string, value: unknown) { filters.push({ op: 'is', col, value }); return chain },
        in(col: string, value: unknown[]) { filters.push({ op: 'in', col, value }); return chain },
        contains(col: string, value: unknown[]) { filters.push({ op: 'contains', col, value }); return chain },
        neq(col: string, value: unknown) { filters.push({ op: 'neq', col, value }); return chain },
        or(expr: string) { filters.push({ op: 'or', col: '', value: expr }); return chain },
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

/**
 * SAN-00531/26 from the spec: one physical sample, two contracts. The lab
 * unit carries contract 41858/26 and was cupped; the sibling carries
 * 41859/26 and points at the lab unit. Each has its own certificate.
 */
const labUnit = {
  id: 'lab-1',
  lab_source_sample_id: null,
  contract_ordinal: 1,
  container_count: null,
  tracking_number: 'SAN-00531/26',
  origin: 'Brazil',
  status: 'approved',
  client_id: 'client-1',
  exporter_id: 'exp-1',
  seller_id: 'sel-1',
  same_seller_shipper: true,
  wolthers_contract_nr: '41858/26',
  buyer_contract_nr: 'IR0007506-1',
  seller_contract_nr: '4155261663',
  exporter_sample_number: 'AS248426',
  bag_count: 320,
  bag_type: 'jute_bag',
  bag_weight_kg: 60,
  bags_quantity_mt: 19.2,
  equivalent_60kg_bags: 320,
  manual_ref_fields: [],
}

const sibling = {
  ...labUnit,
  id: 'sib-1',
  lab_source_sample_id: 'lab-1',
  contract_ordinal: 2,
  container_count: 2,
  tracking_number: 'SAN-00700/26',
  wolthers_contract_nr: '41859/26',
  buyer_contract_nr: 'IR0007507-1',
  // The migration cross-mapped the sub-contract's supplier ref into the
  // sibling's own seller_contract_nr, so no render-time fallback is needed.
  seller_contract_nr: '4155261514',
  bag_count: 720,
  bag_type: 'bulk',
  bag_weight_kg: 21600,
  bags_quantity_mt: 43.2,
  equivalent_60kg_bags: 720,
}

function seed() {
  return {
    samples: [labUnit, sibling],
    companies: [
      { id: 'client-1', name: 'Rich Coop', fantasy_name: null, logo_url: null, country: 'NL', company_types: [], trading_roles: [], qc_settings: null },
      { id: 'exp-1', name: 'Exportadora', fantasy_name: null, country: 'BR' },
      { id: 'sel-1', name: 'Ecom', fantasy_name: null, country: 'BR' },
    ],
    // Lab data exists ONLY on the lab unit.
    quality_assessments: [
      { sample_id: 'lab-1', green_bean_data: { moisture_percentage: 11.2 }, roast_data: null, clean_cup: true, uniform_cup: true, cupping_comments: 'clean', grading_comments: null, resolved_defects: null },
    ],
    roast_profiles: [{ sample_id: 'lab-1', agtron_score: 65, quaker_count: 1, roast_date: '2026-08-20', actual_roast_level: 'medium' }],
    cupping_sessions: [
      { id: 'sess-1', sample_ids: ['lab-1'], status: 'completed', session_type: null, cupper_ids: ['cupper-1'], master_cupper_id: 'cupper-1' },
    ],
    cupping_scores: [
      { sample_id: 'lab-1', cupper_id: 'cupper-1', protocol: null, scores: { Body: 6, Flavor: 7 }, notes: null, defects: null },
    ],
    // One certificate per sample. The lab unit's is rejected on purpose so a
    // sibling reading the wrong certificate would visibly flip its status.
    certificates: [
      { id: 'cert-lab', sample_id: 'lab-1', sample_contract_id: null, certificate_number: 'R-SAX-011817/26', created_at: '2026-08-21T10:00:00Z', status: 'issued', override_comment: null, is_rejected: true },
      { id: 'cert-sib', sample_id: 'sib-1', sample_contract_id: null, certificate_number: 'R-SAX-011818/26', created_at: '2026-08-21T10:00:01Z', status: 'issued', override_comment: null, is_rejected: false },
    ],
    contracts: [],
  }
}


const frozen = {
  version: 1,
  notes: [['Nutty/Cocoa', 'Cocoa', 'Chocolate']],
  profile: { id: 'p1', name: 'Cerrado Mineiro', region: 'Minas Gerais', notes: [['Sweet']], description: null, match: true },
  resolved_by: 'cupper-1',
  resolved_at: '2026-11-13T10:00:00Z',
  source: 'validation',
}

const specWith = (custom: Record<string, unknown>) => ({
  custom_name: 'Q',
  custom_parameters: custom,
  template: { name: 'Commodity', parameters: {}, methodology: null },
})

function seeded(specs: Record<string, Record<string, unknown>>) {
  const rows = seed()
  rows.samples = rows.samples.map((s) => ({ ...s, quality_spec_id: `q-${s.id}` })) as any
  rows.quality_assessments = rows.quality_assessments.map((qa) => ({ ...qa, sensory_resolution: frozen })) as any
  resolver.resolveSampleSpec.mockImplementation(async (id: string) => specWith(specs[id] ?? {}))
  return fakeDb(rows)
}

describe('getCertificateData — sensory per sibling quality', () => {
  beforeEach(() => resolver.resolveSampleSpec.mockReset())

  const both = { sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } }

  it('the lab unit prints both when its quality asks for both', async () => {
    const data = await getCertificateData('lab-1', seeded({ 'lab-1': both }) as any)
    expect(data!.cuppingData?.sensory?.notes).toEqual(frozen.notes)
    expect(data!.cuppingData?.sensory?.profile?.id).toBe('p1')
  })

  it('a sibling on a quality with notes off and a different profile prints nothing', async () => {
    const db = seeded({ 'lab-1': both, 'sib-1': { sensory_notes_enabled: false, regional_profile: { id: 'p2', name: 'Sul de Minas' } } })
    const data = await getCertificateData('sib-1', db as any)
    expect(data!.cuppingData?.sensory).toBeNull()
    // The spec judged is the sibling's own.
    expect(resolver.resolveSampleSpec).toHaveBeenCalledWith('sib-1')
  })

  it('a sibling with notes on and no profile prints the notes only', async () => {
    const data = await getCertificateData('sib-1', seeded({ 'lab-1': both, 'sib-1': { sensory_notes_enabled: true } }) as any)
    expect(data!.cuppingData?.sensory?.notes).toEqual(frozen.notes)
    expect(data!.cuppingData?.sensory?.profile).toBeNull()
  })

  it('a sibling with the same profile but notes off prints the profile line only', async () => {
    const db = seeded({ 'lab-1': both, 'sib-1': { regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } } })
    const data = await getCertificateData('sib-1', db as any)
    expect(data!.cuppingData?.sensory?.notes).toEqual([])
    expect(data!.cuppingData?.sensory?.profile?.id).toBe('p1')
  })
})
