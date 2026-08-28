import { describe, it, expect } from 'vitest'
import { getCertificateData } from './certificate-data'

/**
 * One sample per contract: a certificate renders from the sample row it
 * points at, and that row's LAB DATA (quality_assessments, roast_profiles,
 * cupping_sessions, cupping_scores) is read through `lab_source_sample_id`
 * when the row is a contract sibling. These tests pin which id every query
 * is keyed on, because the failure mode of getting it wrong is silent: a
 * sibling certificate that prints no grading, or the wrong certificate number.
 *
 * The fake is local to this file, mirroring finalize-pipeline.test.ts and
 * load-cva-certificate-inputs.characterization.test.ts — the repo tests
 * DB-touching lib functions through a hand-rolled stand-in rather than a
 * shared Supabase mock. It serves seeded rows narrowed by the filters a query
 * applied and records those filters per table so a test can assert on them.
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

describe('getCertificateData — one sample per contract', () => {
  it('renders a sibling from its own row and reads lab data through the lab unit', async () => {
    const db = fakeDb(seed())
    const data = await getCertificateData('sib-1', db as any)
    expect(data).not.toBeNull()

    // Own commercial row.
    expect(data!.sample.id).toBe('sib-1')
    expect(data!.sample.tracking_number).toBe('SAN-00700/26')
    expect(data!.sample.lab_source_sample_id).toBe('lab-1')
    expect(data!.sample.container_count).toBe(2)
    expect(data!.sample.bags).toBe(720)
    expect(data!.sample.bag_type).toBe('bulk')
    expect(data!.sample.bags_quantity_mt).toBe(43.2)
    expect(data!.supplyChain.wolthersContract).toBe('41859/26')
    expect(data!.supplyChain.importer.contract).toBe('IR0007507-1')
    expect(data!.supplyChain.supplier.contract).toBe('4155261514')

    // Own certificate, and the status it carries — not the lab unit's.
    expect(data!.certificate?.certificate_number).toBe('R-SAX-011818/26')
    expect(data!.sample.status).toBe('approved')

    // Lab data came through the pointer.
    expect(data!.greenBeanAnalysis?.moisture_percentage).toBe(11.2)
    expect(data!.roastAnalysis?.agtron_score).toBe(65)
    expect(data!.cuppingComments).toBe('clean')
    expect(data!.cuppingData?.attributes.find((a) => a.name === 'Body')?.score).toBe(6)

    // And every lab-data query was keyed on the lab unit, never the sibling.
    for (const table of ['quality_assessments', 'roast_profiles', 'cupping_scores']) {
      const keyed = db.filtersOn(table).filter((f) => f.col === 'sample_id')
      expect(keyed.length, table).toBeGreaterThan(0)
      expect(keyed.every((f) => f.value === 'lab-1'), table).toBe(true)
    }
    expect(db.filtersOn('cupping_sessions')).toContainEqual({ op: 'contains', col: 'sample_ids', value: ['lab-1'] })
  })

  it('keys the certificate on the sample itself and no longer filters on sample_contract_id', async () => {
    const db = fakeDb(seed())
    await getCertificateData('sib-1', db as any)
    const certFilters = db.filtersOn('certificates')
    expect(certFilters).toContainEqual({ op: 'eq', col: 'sample_id', value: 'sib-1' })
    expect(certFilters.some((f) => f.col === 'sample_contract_id')).toBe(false)
  })

  it('renders a lab unit from itself', async () => {
    const db = fakeDb(seed())
    const data = await getCertificateData('lab-1', db as any)
    expect(data!.sample.lab_source_sample_id).toBeNull()
    expect(data!.sample.container_count).toBeNull()
    expect(data!.sample.tracking_number).toBe('SAN-00531/26')
    expect(data!.certificate?.certificate_number).toBe('R-SAX-011817/26')
    expect(data!.sample.status).toBe('rejected')
    expect(data!.supplyChain.supplier.contract).toBe('4155261663')
    expect(data!.greenBeanAnalysis?.moisture_percentage).toBe(11.2)
    const keyed = db.filtersOn('quality_assessments').filter((f) => f.col === 'sample_id')
    expect(keyed.every((f) => f.value === 'lab-1')).toBe(true)
  })

  it('never touches the archived sample_contracts table', async () => {
    const db = fakeDb(seed())
    const data = await getCertificateData('sib-1', db as any)
    expect(data!.sample.tracking_number).toBe('SAN-00700/26')
    expect(data!.certificate?.certificate_number).toBe('R-SAX-011818/26')
    expect(db.queries.some((q) => q.table === 'sample_contracts')).toBe(false)
  })
})
