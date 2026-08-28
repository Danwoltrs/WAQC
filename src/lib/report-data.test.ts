import { describe, it, expect } from 'vitest'
import {
  mapCertRowToReportRow,
  reportRowClientId,
  categorizeViolation,
  computeBagsAndMt,
  extractGreenDefects,
  extractCuppingDefects,
  aggregateDefectBreakdown,
  isRoasterCompany,
  resolveClientSankeyType,
  type RawCertSampleRow,
} from './report-data'

type RawSample = NonNullable<RawCertSampleRow['sample']>

const raw = (over: Partial<RawCertSampleRow> = {}): RawCertSampleRow => ({
  certificate_number: 'BR-000001/26',
  created_at: '2026-01-05T00:00:00Z',
  is_rejected: false,
  compliance_violations: null,
  sample: {
    id: 's1',
    lab_source_sample_id: null,
    sample_type: 'ss',
    client_id: 'client-1',
    origin: 'Brazil',
    micro_origin: 'Cerrado',
    container_nr: 'ABCD1234567',
    ico_number: '001/2075',
    bag_count: 333,
    bag_weight_kg: null,
    equivalent_60kg_bags: 333,
    bags_quantity_mt: null,
    container_count: null,
    buyer_contract_nr: 'IR0005918-1',
    importer_is_qc_client: null,
    exporter: { name: 'Coop. Regional de Cafeicultores em Guaxupé Ltda.', fantasy_name: 'Cooxupé' },
    seller: { name: 'Cooxupe', fantasy_name: null },
    importer: { name: 'Coffee America', fantasy_name: null },
    roaster: { name: 'Unsold', fantasy_name: null },
  },
  ...over,
})

describe('mapCertRowToReportRow', () => {
  it('maps joined cert/sample fields to a report row, preferring fantasy names', () => {
    const row = mapCertRowToReportRow(raw(), { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' })
    expect(row.certificate_number).toBe('BR-000001/26')
    // exporter has a fantasy_name → it wins over the long legal name
    expect(row.exporter_name).toBe('Cooxupé')
    // importer has no fantasy_name → falls back to legal name
    expect(row.importer_name).toBe('Coffee America')
    expect(row.importer_contract_nr).toBe('IR0005918-1')
    expect(row.bags).toBe(333)
    expect(row.mt).toBe(20.0)
    expect(row.is_rejected).toBe(false)
  })

  it('falls back importer to the client name for roaster-type clients with no importer', () => {
    const row = mapCertRowToReportRow(
      raw({ sample: { ...raw().sample!, importer: null } }),
      { sankeyType: 'roaster', clientDisplay: 'Ahold' },
    )
    expect(row.importer_name).toBe('Ahold')
  })

  it('names the QC client as importer when the sample flags the importer as the QC client', () => {
    // The certificate itself prints the client as importer on this flag
    // (certificate-data.ts), for any sample row; the report says the same.
    const row = mapCertRowToReportRow(
      raw({ sample: { ...raw().sample!, importer: null, importer_is_qc_client: true } }),
      { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' },
    )
    expect(row.importer_name).toBe('Dunkin')
  })

  it('leaves the importer blank for a final-buyer client with no importer and no flag', () => {
    const row = mapCertRowToReportRow(
      raw({ sample: { ...raw().sample!, importer: null, importer_is_qc_client: false } }),
      { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' },
    )
    expect(row.importer_name).toBeNull()
  })

  it('passes the bulk container count through with the derived bags and MT', () => {
    const row = mapCertRowToReportRow(
      raw({ sample: {
        ...raw().sample!, bag_type: 'bulk', bag_count: 720, bag_weight_kg: 21600,
        equivalent_60kg_bags: 720, bags_quantity_mt: 43.2, container_count: 2,
      } }),
      { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' },
    )
    expect(row.bags).toBe(720)
    expect(row.mt).toBe(43.2)
    expect(row.container_count).toBe(2)
  })
})

// A sample covering several contracts is N `samples` rows: the LAB UNIT plus
// one SIBLING per further contract, each pointing at the lab unit through
// `lab_source_sample_id`. A sibling's certificate is an ordinary certificate on
// an ordinary sample row, so the mapper reads it exactly like any other — there
// is no second table to cross into and nothing to fall back to.
describe('mapCertRowToReportRow — sibling certificates', () => {
  const sibling = (over: Partial<RawSample> = {}): RawSample => ({
    ...raw().sample!,
    id: 's2',
    lab_source_sample_id: 's1',
    container_nr: 'SUDU7654321',
    ico_number: '002/3000',
    buyer_contract_nr: 'IR0005918-2',
    bag_count: 275,
    bag_weight_kg: 60,
    equivalent_60kg_bags: null,
    bags_quantity_mt: null,
    importer: { name: 'Ahold Delhaize Coffee Company', fantasy_name: null },
    roaster: { name: 'Marvelous Coffee Roasters', fantasy_name: 'Marvelous' },
    ...over,
  })

  const siblingRow = (over: Partial<RawSample> = {}) =>
    mapCertRowToReportRow(
      raw({ certificate_number: 'BR-000002/26', sample: sibling(over) }),
      { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' },
    )

  it('reports the sibling’s own buyer side, refs and quantity', () => {
    const row = siblingRow()
    expect(row.certificate_number).toBe('BR-000002/26')
    expect(row.importer_name).toBe('Ahold Delhaize Coffee Company')
    expect(row.roaster_name).toBe('Marvelous')          // fantasy name wins
    expect(row.importer_contract_nr).toBe('IR0005918-2')
    expect(row.container_nr).toBe('SUDU7654321')
    expect(row.ico_marks).toBe('002/3000')
    expect(row.bags).toBe(275)                          // its own contract, not the lab unit's 333
  })

  it('carries the supply side the copy rule wrote onto the sibling row when it was created', () => {
    const row = siblingRow()
    expect(row.exporter_name).toBe('Cooxupé')
    expect(row.seller_name).toBe('Cooxupe')
  })

  it('does not reach across to the lab unit: a blank on the sibling stays blank', () => {
    // Container/ICO were filled from the lab unit when the sibling was built
    // (sample-group.ts); by the time a report runs there is nothing to fall back to.
    const row = siblingRow({ container_nr: null, ico_number: null })
    expect(row.container_nr).toBeNull()
    expect(row.ico_marks).toBeNull()
  })

  it('never inherits the lab unit’s quantity — that would count the same coffee twice', () => {
    const row = siblingRow({ bag_count: null, bag_weight_kg: null, equivalent_60kg_bags: null, bags_quantity_mt: null })
    expect(row.bags).toBeNull()
    expect(row.mt).toBeNull()
  })

  it('names the QC client as importer when the sibling flags the importer as the QC client', () => {
    const row = siblingRow({ importer: null, importer_is_qc_client: true })
    expect(row.importer_name).toBe('Dunkin')
  })

  it('reports Unsold when the sibling has no roaster', () => {
    expect(siblingRow({ roaster: null }).roaster_name).toBe('Unsold')
  })

  it('adds quantities across the group — each contract is separate coffee', () => {
    const rows = [
      raw(),
      raw({ certificate_number: 'BR-000002/26', sample: sibling() }),
      raw({ certificate_number: 'BR-000003/26', sample: sibling({ id: 's3', bag_count: 100 }) }),
    ].map(c => mapCertRowToReportRow(c, { sankeyType: 'final_buyer', clientDisplay: 'Dunkin' }))
    expect(rows.map(r => r.bags)).toEqual([333, 275, 100])
    expect(rows.reduce((sum, r) => sum + (r.bags ?? 0), 0)).toBe(708)
  })
})

describe('reportRowClientId', () => {
  it('is the QC client on the certificate’s own sample row', () => {
    expect(reportRowClientId(raw())).toBe('client-1')
  })

  it('a sibling sold to another QC client carries that client on its own row', () => {
    const c = raw({ sample: { ...raw().sample!, id: 's2', lab_source_sample_id: 's1', client_id: 'client-2' } })
    expect(reportRowClientId(c)).toBe('client-2')
  })

  it('is null when the sample join is missing', () => {
    expect(reportRowClientId(raw({ sample: null }))).toBeNull()
  })
})

describe('categorizeViolation', () => {
  it('renders a cup-attribute below-minimum as "<attr> below min"', () => {
    expect(categorizeViolation('Balance: 2.50 is below minimum (3)')).toBe('Balance below min')
  })
  it('buckets total defects', () => {
    expect(categorizeViolation('Total defects: 12 exceeds maximum (8)')).toBe('Total defects')
  })
})

const base = { bag_count: null, bag_weight_kg: null, equivalent_60kg_bags: null, bags_quantity_mt: null }

describe('computeBagsAndMt', () => {
  it('prefers stored equivalent_60kg_bags', () => {
    expect(computeBagsAndMt({ ...base, equivalent_60kg_bags: 333, bag_count: 20 }))
      .toEqual({ bags: 333, mt: 20.0 })
  })
  it('derives from bag_count x bag_weight_kg — 1000 kg big bags', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 20, bag_weight_kg: 1000 }))
      .toEqual({ bags: 333, mt: 20.0 })
  })
  it('derives from bag_count x bag_weight_kg — 59 kg bags', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 300, bag_weight_kg: 59 }))
      .toEqual({ bags: 295, mt: 17.7 })
  })
  it('derives from bags_quantity_mt when weights are missing', () => {
    expect(computeBagsAndMt({ ...base, bags_quantity_mt: 19.2 }))
      .toEqual({ bags: 320, mt: 19.2 })
  })
  it('falls back to bag_count assuming 60 kg', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 320 }))
      .toEqual({ bags: 320, mt: 19.2 })
  })
  it('returns nulls when no quantity data exists', () => {
    expect(computeBagsAndMt(base)).toEqual({ bags: null, mt: null })
  })

  // Bulk stores bag_count as the 60kg EQUIVALENT and bag_weight_kg as the
  // container's whole net weight (21,600 kg) — see computeBagQuantities and
  // sample-contracts-section's formToPayload. Multiplying the two counts the
  // lot 360x over: one 21.6 MT container reported as 7,776 MT.
  it('never multiplies a bulk count by the container weight', () => {
    expect(computeBagsAndMt({ ...base, bag_type: 'bulk', bag_count: 360, bag_weight_kg: 21600 }))
      .toEqual({ bags: 360, mt: 21.6 })
  })

  it('prefers the stored MT for a bulk row that has one', () => {
    expect(computeBagsAndMt({ ...base, bag_type: 'bulk', bag_count: 360, bag_weight_kg: 21600, bags_quantity_mt: 21.6 }))
      .toEqual({ bags: 360, mt: 21.6 })
  })

  // Legacy rows predate bag_type being carried into the report. No real bag
  // weighs more than a 1,000 kg big bag, so an implausible per-bag weight is
  // the container weight and the row is bulk whatever the column says.
  it('treats an impossible per-bag weight as a bulk container', () => {
    expect(computeBagsAndMt({ ...base, bag_count: 360, bag_weight_kg: 21600 }))
      .toEqual({ bags: 360, mt: 21.6 })
  })

  it('still multiplies out a 1,000 kg big bag', () => {
    expect(computeBagsAndMt({ ...base, bag_type: 'big_bag', bag_count: 20, bag_weight_kg: 1000 }))
      .toEqual({ bags: 333, mt: 20.0 })
  })
})

describe('extractGreenDefects', () => {
  it('reads the counts map, ranked by raw count desc', () => {
    expect(extractGreenDefects({ counts: { Black: 2, Sour: 5, Broca: 1 }, primary: 0, secondary: 8 }))
      .toEqual([{ name: 'Sour', count: 5 }, { name: 'Black', count: 2 }, { name: 'Broca', count: 1 }])
  })
  it('reads the defect_list array format', () => {
    expect(extractGreenDefects({ defect_list: [{ name: 'Immature', count: 3 }, { name: 'Shell', count: 1 }] }))
      .toEqual([{ name: 'Immature', count: 3 }, { name: 'Shell', count: 1 }])
  })
  it('unwraps a full green_bean_data wrapper (production shape) to its nested .defects blob', () => {
    // The fetcher hands over the whole green_bean_data column; defects nest under `.defects`.
    const greenBeanData = { defects: { counts: { Black: 8, Sour: 5 }, primary: 0, secondary: 13 }, moisture_percentage: 12 }
    expect(extractGreenDefects(greenBeanData))
      .toEqual([{ name: 'Black', count: 8 }, { name: 'Sour', count: 5 }])
  })
  it('reads bare arrays and split primary/secondary arrays', () => {
    expect(extractGreenDefects([{ name: 'Sour', count: 2 }])).toEqual([{ name: 'Sour', count: 2 }])
    expect(extractGreenDefects({ primary: [{ name: 'Full black', count: 1 }], secondary: [{ name: 'Husk', count: 4 }] }))
      .toEqual([{ name: 'Husk', count: 4 }, { name: 'Full black', count: 1 }])
  })
  it('ignores bare numeric aggregates (no names) and zero/invalid counts', () => {
    expect(extractGreenDefects({ primary: 0, secondary: 19.04 })).toEqual([])
    expect(extractGreenDefects({ counts: { Black: 0, Sour: -1 } })).toEqual([])
    expect(extractGreenDefects(null)).toEqual([])
    expect(extractGreenDefects('nope')).toEqual([])
  })
})

describe('extractCuppingDefects', () => {
  it('splits named faults and taints', () => {
    expect(extractCuppingDefects({ faults: [{ name: 'Phenol' }], taints: [{ name: 'Fermented' }] }))
      .toEqual([{ name: 'Phenol', kind: 'fault', count: 1 }, { name: 'Fermented', kind: 'taint', count: 1 }])
  })
  it('accepts bare-string entries and ignores unnamed/empty', () => {
    expect(extractCuppingDefects({ faults: ['Rioy', { name: '' }, {}], taints: [] }))
      .toEqual([{ name: 'Rioy', kind: 'fault', count: 1 }])
    expect(extractCuppingDefects(null)).toEqual([])
  })
})

describe('aggregateDefectBreakdown', () => {
  it('sums green counts and tallies cupping occurrences across samples, ranked', () => {
    // Green blobs given as full green_bean_data wrappers (production shape).
    const bd = aggregateDefectBreakdown([
      { green: { defects: { counts: { Black: 2, Sour: 1 } } }, resolved: { faults: [{ name: 'Phenol' }], taints: [] } },
      { green: { defects: { counts: { Black: 3 } } }, resolved: { faults: [{ name: 'Phenol' }], taints: [{ name: 'Musty' }] } },
      { green: null, resolved: null },
    ])
    // max = the worst SINGLE certificate, not the total: Black totals 5 across
    // two samples but never exceeded 3 on either one.
    expect(bd.greenDefects).toEqual([
      { name: 'Black', count: 5, max: 3 },
      { name: 'Sour', count: 1, max: 1 },
    ])
    expect(bd.cuppingDefects).toEqual([
      { name: 'Phenol', kind: 'fault', count: 2 },
      { name: 'Musty', kind: 'taint', count: 1 },
    ])
  })
  // The graded defect count (primary + secondary), which is the number a spec
  // is written against — "max 8 defects" — not the raw bean tallies above it.
  it('reports the graded defect load per rejected certificate', () => {
    const bd = aggregateDefectBreakdown([
      { green: { defects: { primary: 2, secondary: 23 } }, resolved: null },   // 25
      { green: { defects: { primary: 1, secondary: 27 } }, resolved: null },   // 28
      { green: { defects: { primary: 0, secondary: 22 } }, resolved: null },   // 22
    ])
    expect(bd.defectLoad).toEqual({ avg: 25, max: 28, graded: 3 })
  })

  it('averages the defect load over graded certificates only', () => {
    // A lot rejected on cupping alone carries no green grading; counting it as
    // zero would halve the average and understate the graded lots.
    const bd = aggregateDefectBreakdown([
      { green: { defects: { primary: 2, secondary: 23 } }, resolved: null },
      { green: null, resolved: { faults: [{ name: 'Phenol' }], taints: [] } },
    ])
    expect(bd.defectLoad).toEqual({ avg: 25, max: 25, graded: 1 })
  })

  it('has no defect load when nothing was graded', () => {
    expect(aggregateDefectBreakdown([{ green: null, resolved: null }]).defectLoad).toBeNull()
  })

  it('returns empty lists when no named defect detail exists', () => {
    // A bare summary blob names no defect, but its graded total still counts:
    // the load line is the one thing this lot can still say.
    expect(aggregateDefectBreakdown([{ green: { primary: 0, secondary: 12 }, resolved: null }]))
      .toEqual({ greenDefects: [], cuppingDefects: [], defectLoad: { avg: 12, max: 12, graded: 1 } })
  })
})

describe('resolveClientSankeyType', () => {
  it('roaster wins over buyer (Ahold is typed as both)', () => {
    expect(resolveClientSankeyType(['roaster'], ['buyer'])).toBe('roaster')
  })
  it('is case-insensitive on company_types', () => {
    expect(resolveClientSankeyType(['Roaster'], [])).toBe('roaster')
  })
  it('buyer alone is an importer', () => {
    expect(resolveClientSankeyType(['importer'], ['buyer'])).toBe('importer')
  })
  it('neither is a final buyer', () => {
    expect(resolveClientSankeyType([], [])).toBe('final_buyer')
    expect(resolveClientSankeyType(null, null)).toBe('final_buyer')
  })
  it('ignores non-string entries', () => {
    expect(resolveClientSankeyType([null, 42], ['buyer'])).toBe('importer')
  })
})

describe('isRoasterCompany', () => {
  it('detects the roaster type regardless of case', () => {
    expect(isRoasterCompany(['ROASTER'])).toBe(true)
    expect(isRoasterCompany(['exporter'])).toBe(false)
    expect(isRoasterCompany(null)).toBe(false)
  })
})
