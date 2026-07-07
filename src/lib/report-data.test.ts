import { describe, it, expect } from 'vitest'
import {
  mapCertRowToReportRow,
  categorizeViolation,
  computeBagsAndMt,
  extractGreenDefects,
  extractCuppingDefects,
  aggregateDefectBreakdown,
  type RawCertSampleRow,
} from './report-data'

const raw = (over: Partial<RawCertSampleRow> = {}): RawCertSampleRow => ({
  certificate_number: 'BR-000001/26',
  created_at: '2026-01-05T00:00:00Z',
  is_rejected: false,
  compliance_violations: null,
  sample: {
    id: 's1',
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
    buyer_contract_nr: 'IR0005918-1',
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
    expect(bd.greenDefects).toEqual([{ name: 'Black', count: 5 }, { name: 'Sour', count: 1 }])
    expect(bd.cuppingDefects).toEqual([
      { name: 'Phenol', kind: 'fault', count: 2 },
      { name: 'Musty', kind: 'taint', count: 1 },
    ])
  })
  it('returns empty lists when no named defect detail exists', () => {
    expect(aggregateDefectBreakdown([{ green: { primary: 0, secondary: 12 }, resolved: null }]))
      .toEqual({ greenDefects: [], cuppingDefects: [] })
  })
})
