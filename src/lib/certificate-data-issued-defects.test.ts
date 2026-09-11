import { describe, it, expect } from 'vitest'
import { getCertificateData } from './certificate-data'

/**
 * Task 8: the certificate's defect rows print issued counts, not raw ones,
 * when a tolerance decision exists — mirroring what Task 7 did for screen
 * percentages. The category rows AND the printed total must reconcile
 * exactly: applying an issued count to a category and then trusting a STALE
 * weighted total computed from the raw count would show, e.g., "Broken: 20"
 * next to a secondary total still counting all 37.
 *
 * The fake is local to this file, mirroring certificate-data.lab-source.test.ts
 * — a hand-rolled stand-in narrowed by the filters a query applied, rather
 * than a shared Supabase mock.
 */
type Filter = { op: 'eq' | 'is' | 'in' | 'contains' | 'neq' | 'or'; col: string; value: unknown }
type Query = { table: string; filters: Filter[] }

function fakeDb(rows: Record<string, Array<Record<string, unknown>>>) {
  const queries: Query[] = []
  const client = {
    queries,
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

const sample = {
  id: 's1',
  // A decision row only applies while the lot is still flagged (see
  // isApprovedWithComments in tolerance/fetch.ts) — an append-only row that
  // nothing clears is not on its own a live signal.
  approved_with_comments: true,
  lab_source_sample_id: null,
  contract_ordinal: 1,
  container_count: null,
  tracking_number: 'SAN-1/26',
  origin: 'Brazil',
  status: 'approved',
  client_id: null,
  exporter_id: null,
  seller_id: null,
  same_seller_shipper: null,
  wolthers_contract_nr: null,
  buyer_contract_nr: null,
  seller_contract_nr: null,
  exporter_sample_number: null,
  bag_count: null,
  bag_type: null,
  bag_weight_kg: null,
  bags_quantity_mt: null,
  equivalent_60kg_bags: null,
  manual_ref_fields: [],
}

// Raw grading: 1 Full Black (primary, weight 1.0), 37 Broken (secondary, 0.2),
// 5 Shells (secondary, 0.34). Stale pre-calculated totals (as the grading page
// would have written them, from the RAW counts): primary 1, secondary 9.1.
const greenBeanData = {
  moisture_percentage: 11,
  defects: {
    counts: { 'Full Black': 1, Broken: 37, Shells: 5 },
    primary: 1,
    secondary: 9.1,
  },
}

function seed(toleranceRows: Array<Record<string, unknown>>) {
  return {
    samples: [sample],
    companies: [],
    quality_assessments: [
      {
        sample_id: 's1',
        green_bean_data: greenBeanData,
        roast_data: null,
        clean_cup: null,
        uniform_cup: null,
        cupping_comments: null,
        grading_comments: null,
        resolved_defects: null,
      },
    ],
    roast_profiles: [],
    cupping_sessions: [],
    cupping_scores: [],
    certificates: [],
    contracts: [],
    sample_tolerance_approvals: toleranceRows,
  }
}

describe('getCertificateData — defect rows reconcile with the issued decision', () => {
  it('applies the issued count per category and recomputes the weighted total from it', async () => {
    const db = fakeDb(
      seed([
        {
          sample_id: 's1',
          issued_values: {
            screen_percentages: null,
            // Broken reduced 37 -> 20 by the tolerance decision; Full Black
            // (primary) and Shells are untouched.
            defects: { counts: { 'Full Black': 1, Broken: 20, Shells: 5 }, primary: 1, secondary: 5.7, total: 6.7 },
          },
          metrics: [],
          comments: [],
          request_additional_sample: false,
          decided_at: '2026-09-10T00:00:00Z',
        },
      ]),
    )

    const data = await getCertificateData('s1', db as any)
    expect(data).not.toBeNull()
    const defects = data!.greenBeanAnalysis!.defects!

    expect(defects.primary).toEqual([{ name: 'Full Black', rawCount: 1, weight: 1.0, weightedCount: 1 }])
    // Sorted by weightedCount descending: Broken (4) before Shells (~1.7).
    expect(defects.secondary.map((d) => ({ name: d.name, rawCount: d.rawCount, weight: d.weight }))).toEqual([
      { name: 'Broken', rawCount: 20, weight: 0.2 },
      { name: 'Shells', rawCount: 5, weight: 0.34 },
    ])
    expect(defects.secondary[0].weightedCount).toBeCloseTo(4)
    expect(defects.secondary[1].weightedCount).toBeCloseTo(1.7)

    // The printed total is recomputed from the issued counts — never the
    // stale 9.1 the grading page pre-calculated from the raw 37.
    expect(defects.total_primary).toBe(1)
    expect(defects.total_secondary).toBeCloseTo(5.7)
  })

  it('drops a category the decision eliminated entirely, rather than printing a zero row', async () => {
    const db = fakeDb(
      seed([
        {
          sample_id: 's1',
          issued_values: {
            screen_percentages: null,
            // The decision removed every Shells bean; Broken and Full Black
            // are untouched. A buyer certificate should not show "Shells 0".
            defects: { counts: { 'Full Black': 1, Broken: 37, Shells: 0 }, primary: 1, secondary: 7.4, total: 8.4 },
          },
          metrics: [],
          comments: [],
          request_additional_sample: false,
          decided_at: '2026-09-10T00:00:00Z',
        },
      ]),
    )

    const data = await getCertificateData('s1', db as any)
    const defects = data!.greenBeanAnalysis!.defects!

    expect(defects.secondary.map((d) => d.name)).toEqual(['Broken'])
    expect(defects.total_secondary).toBeCloseTo(7.4)
  })

  /**
   * The buyer's PDF and the buyer's QR page must print the SAME defect totals.
   *
   * They do not compute them the same way. The QR page (and the internal
   * badge) print `issued.defects.primary/.secondary/.total` verbatim — figures
   * the decision computed from the QUALITY TEMPLATE's weights. This module has
   * its own hard-coded DEFECT_WEIGHTS table and a PRIMARY_DEFECTS substring
   * match, so recomputing here produces a different number the moment a
   * template disagrees with that table — which it is free to do: weights are
   * per-template configuration (src/types/defect-configuration.ts).
   *
   * So when a decision is on file its totals are authoritative, and this module
   * stops recomputing them. Per-category `weightedCount` values still come from
   * the local table (they are the only per-row weight this module has), so a
   * template that disagrees will show rows that do not sum to the printed
   * total — the deliberate trade: cross-surface agreement on the number a buyer
   * actually reads beats internal arithmetic tidiness on a single surface.
   */
  it('prints the decision\'s own totals when the template weight differs from the local table', async () => {
    const db = fakeDb(
      seed([
        {
          sample_id: 's1',
          issued_values: {
            screen_percentages: null,
            // The template weighs Broken at 0.5 and Shells at 0.5, not the
            // 0.2 / 0.34 in this module's DEFECT_WEIGHTS. 20 x 0.5 + 5 x 0.5
            // = 12.5, where a local recompute gives 20 x 0.2 + 5 x 0.34 = 5.7.
            defects: { counts: { 'Full Black': 1, Broken: 20, Shells: 5 }, primary: 1, secondary: 12.5, total: 13.5 },
          },
          metrics: [],
          comments: [],
          request_additional_sample: false,
          decided_at: '2026-09-10T00:00:00Z',
        },
      ]),
    )

    const data = await getCertificateData('s1', db as any)
    const defects = data!.greenBeanAnalysis!.defects!

    expect(defects.total_secondary).toBeCloseTo(12.5)
    expect(defects.total_secondary).not.toBeCloseTo(5.7)
    expect(defects.total_primary).toBeCloseTo(1)
  })

  it('falls back to raw counts and the stale pre-calculated totals when no decision exists', async () => {
    const db = fakeDb(seed([]))

    const data = await getCertificateData('s1', db as any)
    const defects = data!.greenBeanAnalysis!.defects!

    expect(defects.secondary.map((d) => ({ name: d.name, rawCount: d.rawCount, weight: d.weight }))).toEqual([
      { name: 'Broken', rawCount: 37, weight: 0.2 },
      { name: 'Shells', rawCount: 5, weight: 0.34 },
    ])
    expect(defects.secondary[0].weightedCount).toBeCloseTo(7.4)
    expect(defects.secondary[1].weightedCount).toBeCloseTo(1.7)
    expect(defects.total_primary).toBe(1)
    expect(defects.total_secondary).toBe(9.1)
  })
})
