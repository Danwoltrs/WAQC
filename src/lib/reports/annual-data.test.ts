import { describe, it, expect } from 'vitest'
import {
  buildAnnualAggregates,
  toAnnualRow,
  labUnitRefs,
  getAnnualPerformanceReportData,
} from './annual-data'
import { emptyQualityFindings } from './annual-quality'
import { annualRow } from './__fixtures__/annual-rows'
import { CHARCOAL_SANKEY_PALETTE } from '@/lib/charts/sankey-layout'
import type { PerformanceRow } from './performance-data'
import type { AnnualRow } from './annual-row'

// Minimal row factory — only the fields the aggregation reads.
function row(p: Partial<PerformanceRow> & { is_rejected: boolean } & Record<string, unknown>): AnnualRow {
  return {
    certificate_number: 'X',
    is_rejected: p.is_rejected,
    bags: p.bags ?? 0,
    exporter_name: p.exporter_name ?? null,
    seller_name: p.seller_name ?? null,
    importer_name: p.importer_name ?? null,
    region: p.region ?? null,
    created_at: p.created_at ?? '2025-01-15T00:00:00Z',
    origin: (p as any).origin ?? null,
    laboratory_name: (p as any).laboratory_name ?? null,
  } as unknown as AnnualRow
}

describe('buildAnnualAggregates', () => {
  const pssRows = [
    row({ is_rejected: false, exporter_name: 'Comexim', seller_name: 'Comexim', importer_name: 'Imp A', origin: 'Brazil', laboratory_name: 'Santos' }),
    row({ is_rejected: true, exporter_name: 'Eisa', seller_name: null, importer_name: 'Imp A', origin: 'Brazil', laboratory_name: 'Santos' }),
  ]
  const ssRows = [
    row({ is_rejected: false, bags: 1200, exporter_name: 'Comexim', seller_name: 'Comexim', importer_name: 'Imp A', origin: 'Colombia', laboratory_name: 'Buenaventura' }),
  ]

  it('produces per-exporter PSS (count) and SS (bags) buckets', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co', quality: emptyQualityFindings() })
    expect(agg.pss.totals.evaluated).toBe(2)
    expect(agg.ss.totals.bagsApproved).toBe(1200)
    expect(agg.pss.byExporter.map(g => g.name)).toContain('Comexim')
  })

  it('falls back to the shipper name when no seller is recorded, matching the period reports and the Sankey', () => {
    // Eisa row has seller_name: null — must bucket under its shipper (Eisa),
    // not a placeholder, or the Seller Performance page and the Year Flow
    // Sankey a few pages later would name the same lot two different ways.
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co', quality: emptyQualityFindings() })
    const names = agg.bySellerPss.map(g => g.name)
    expect(names).toContain('Comexim')
    expect(names).toContain('Eisa')
    expect(names).not.toContain('Unspecified')
  })

  it('drops a row with neither a seller nor an exporter, rather than bucketing it under a placeholder', () => {
    const noCounterparty = [
      row({ is_rejected: false, exporter_name: null, seller_name: null, importer_name: 'Imp A' }),
    ]
    const agg = buildAnnualAggregates(noCounterparty, [], { sankeyType: 'importer', clientDisplay: 'Test Co', quality: emptyQualityFindings() })
    expect(agg.bySellerPss).toEqual([])
  })

  it('builds by-origin and by-lab from combined rows', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co', quality: emptyQualityFindings() })
    expect(agg.byOrigin.map(g => g.name).sort()).toEqual(['Brazil', 'Colombia'])
    expect(agg.byLab.map(g => g.name).sort()).toEqual(['Buenaventura', 'Santos'])
    expect(agg.labsCovered.sort()).toEqual(['Buenaventura', 'Santos'])
    expect(agg.originsCovered.sort()).toEqual(['Brazil', 'Colombia'])
  })

  it('sets showSankey false when fewer than 3 columns resolve', () => {
    // single counterparty → not enough columns for a meaningful flow
    const thin = [row({ is_rejected: false, bags: 100, exporter_name: 'Comexim', importer_name: null })]
    const agg = buildAnnualAggregates([], thin, { sankeyType: 'importer', clientDisplay: 'Test Co', quality: emptyQualityFindings() })
    expect(typeof agg.showSankey).toBe('boolean')
  })
})

describe('toAnnualRow', () => {
  it('carries origin, region (micro_origin), lab name, and violations', () => {
    const raw = {
      certificate_number: 'BR-1/25',
      created_at: '2025-06-01T00:00:00Z',
      is_rejected: false,
      compliance_violations: ['moisture'],
      sample: {
        id: 's1', sample_type: 'ss', client_id: 'c1',
        origin: 'Brazil', micro_origin: 'Cerrado',
        bag_count: 320, equivalent_60kg_bags: 320,
        exporter: { name: 'Comexim', fantasy_name: null },
        seller: { name: 'Comexim', fantasy_name: null },
        importer: { name: 'Imp A', fantasy_name: null },
        roaster: null,
      },
    } as any
    const r = toAnnualRow(raw, { sankeyType: 'importer', clientDisplay: 'Test Co' }, 'Santos')
    expect(r.origin).toBe('Brazil')
    expect(r.region).toBe('Cerrado')
    expect(r.laboratory_name).toBe('Santos')
    expect((r as any)._violations).toEqual(['moisture'])
  })

  it('pins approval_date to the certificate\'s created_at (month key for annual figures)', () => {
    const knownTimestamp = '2026-07-14T09:30:00.000Z'
    const raw = {
      certificate_number: 'BR-1/26',
      created_at: knownTimestamp,
      is_rejected: false,
      compliance_violations: null,
      sample: {
        id: 's1', sample_type: 'ss', client_id: 'c1',
        origin: 'Brazil', micro_origin: null,
        bag_count: 320, equivalent_60kg_bags: 320,
        exporter: { name: 'Comexim', fantasy_name: null },
        seller: { name: 'Comexim', fantasy_name: null },
        importer: { name: 'Imp A', fantasy_name: null },
        roaster: null,
      },
    } as any
    const r = toAnnualRow(raw, { sankeyType: 'importer', clientDisplay: 'Test Co' }, 'Santos')
    expect(r.approval_date).toBe(knownTimestamp)
    expect(r.created_at).toBe(knownTimestamp)
    expect(r.approval_date).toBe(r.created_at)
  })
})

// ---------------------------------------------------------------------------
// Fetcher: one sample per contract. A sample covering several contracts is a
// LAB UNIT plus SIBLING rows pointing at it through `lab_source_sample_id`,
// each with its own certificate; the year counts every one of them and sums
// each contract's own quantity.
// ---------------------------------------------------------------------------

const CLIENT = {
  id: 'client-1', name: 'Dunkin', fantasy_name: null,
  logo_url: null, company_types: [], trading_roles: [],
}
const LABS = [{ id: 'lab-santos', name: 'Santos' }]

const labUnit = {
  id: 's1', lab_source_sample_id: null, sample_type: 'ss', client_id: 'client-1', origin: 'Brazil',
  micro_origin: 'Cerrado', laboratory_id: 'lab-santos', container_nr: 'MOTHER1', ico_number: '001/1',
  bag_count: 300, bag_weight_kg: 60, equivalent_60kg_bags: null, bags_quantity_mt: null,
  container_count: null, buyer_contract_nr: 'IR-1', importer_is_qc_client: null,
  exporter: { name: 'Veloso Green Coffee', fantasy_name: null },
  seller: { name: 'Veloso Green Coffee', fantasy_name: null },
  importer: { name: 'Coffee America', fantasy_name: null },
  roaster: null,
}
const sibling = {
  ...labUnit, id: 's2', lab_source_sample_id: 's1', container_nr: 'SIBLING1', ico_number: '001/2',
  buyer_contract_nr: 'IR-1a', bag_count: 275,
}

const cert = (over: Record<string, unknown>) => ({
  created_at: '2025-07-02T00:00:00Z', is_rejected: false, compliance_violations: null, ...over,
})

function fakeSupabase(certs: unknown[], labs: unknown[] = LABS) {
  return {
    from(table: string) {
      const data: any =
        table === 'companies' ? CLIENT
        : table === 'laboratories' ? labs
        : table === 'certificates' ? certs
        : []
      const chain: Record<string, unknown> = {}
      const self = () => chain
      const payload = () => ({ data, error: null })
      Object.assign(chain, {
        select: self, eq: self, neq: self, or: self, overlaps: self, gte: self, lt: self, order: self, is: self, in: self,
        single: async () => payload(),
        then: (resolve: (v: unknown) => unknown) => resolve(payload()),
      })
      return chain
    },
  } as any
}

describe('getAnnualPerformanceReportData — sibling certificates', () => {
  it('counts the lab unit’s certificate and each sibling’s, adding their quantities', async () => {
    const data = await getAnnualPerformanceReportData(fakeSupabase([
      cert({ certificate_number: 'BR-000001/25', sample: labUnit }),
      cert({ certificate_number: 'BR-000002/25', sample: sibling }),
    ]), { clientId: 'client-1', year: 2025 })
    expect(data!.agg.ss.totals.evaluated).toBe(2)
    expect(data!.agg.ss.totals.contracts).toBe(2)
    expect(data!.agg.ss.totals.bagsApproved).toBe(575)   // 300 + 275, never 300 twice
    expect(data!.agg.glance.bags).toBe(575)
    expect(data!.agg.byLab.map(g => [g.name, g.approvedCount])).toEqual([['Santos', 2]])
  })

  it('routes a sibling sold to another QC client out of this client’s year', async () => {
    const data = await getAnnualPerformanceReportData(fakeSupabase([
      cert({ certificate_number: 'BR-000001/25', sample: labUnit }),
      cert({ certificate_number: 'BR-000002/25', sample: { ...sibling, client_id: 'client-2' } }),
    ]), { clientId: 'client-1', year: 2025 })
    expect(data!.agg.ss.totals.evaluated).toBe(1)
    expect(data!.agg.ss.totals.bagsApproved).toBe(300)
  })
})

describe('getAnnualPerformanceReportData — laboratory label', () => {
  it('labels a laboratory by its city, not its legal entity name, when a city is recorded', async () => {
    const data = await getAnnualPerformanceReportData(
      fakeSupabase(
        [cert({ certificate_number: 'BR-000001/25', sample: labUnit })],
        [{ id: 'lab-santos', name: 'WOLTHERS & ASSOCIATES CORRETORA DE MERCADORIAS LTDA', city: 'Santos' }],
      ),
      { clientId: 'client-1', year: 2025 },
    )
    expect(data!.agg.byLab.map(g => g.name)).toEqual(['Santos'])
  })

  it('falls back to the laboratory name when the row carries no city, matching the existing fixture shape', async () => {
    const data = await getAnnualPerformanceReportData(
      fakeSupabase(
        [cert({ certificate_number: 'BR-000001/25', sample: labUnit })],
        [{ id: 'lab-santos', name: 'Santos Lab' }],
      ),
      { clientId: 'client-1', year: 2025 },
    )
    expect(data!.agg.byLab.map(g => g.name)).toEqual(['Santos Lab'])
  })

  it('falls back to the name when city is blank or whitespace-only', async () => {
    const data = await getAnnualPerformanceReportData(
      fakeSupabase(
        [cert({ certificate_number: 'BR-000001/25', sample: labUnit })],
        [{ id: 'lab-santos', name: 'Santos Lab', city: '   ' }],
      ),
      { clientId: 'client-1', year: 2025 },
    )
    expect(data!.agg.byLab.map(g => g.name)).toEqual(['Santos Lab'])
  })
})

describe('buildAnnualAggregates — redesign', () => {
  const quality = emptyQualityFindings()
  const pss = [
    annualRow({ exporter_name: 'EISA', seller_name: 'Rothfos GmbH', approval_date: '2026-06-03T00:00:00.000Z' }),
    annualRow({ exporter_name: 'EISA', seller_name: 'Rothfos GmbH', is_rejected: true, approval_date: '2026-06-10T00:00:00.000Z', violations: ['Moisture: 12.9 exceeds maximum (12.5)'] }),
  ]
  const ss = [
    annualRow({ exporter_name: 'Comexim', seller_name: 'Comexim EU', approval_date: '2026-07-01T00:00:00.000Z', container_nr: 'C1' }),
    annualRow({ exporter_name: 'Comexim', seller_name: 'Comexim EU', approval_date: '2026-07-02T00:00:00.000Z', container_nr: 'C2', bags: 640, mt: 38.4 }),
  ]

  it('puts the glance, month sections, supplier review and key figures on the aggregates', () => {
    const agg = buildAnnualAggregates(pss, ss, { sankeyType: 'roaster', clientDisplay: 'Ahold', quality })
    expect(agg.glance).toMatchObject({ basis: 'ss', bags: 960, mt: 57.6, containers: 2 })
    expect(agg.ssContainers).toEqual({ byShipper: { Comexim: 2 }, bySeller: { 'Comexim EU': 2 }, total: 2 })
    expect(agg.months.pss.byShipper.rows.map(r => r.name)).toEqual(['EISA'])
    expect(agg.months.ss.totals[6]).toMatchObject({ approved: 960, containers: 2 })
    expect(agg.months.pss.byImporter).toBeNull()
    expect(agg.reasons).toEqual([{ category: 'Moisture', count: 1 }])
    expect(agg.supplierReview.shippers.map(s => s.name)).toEqual(['Comexim', 'EISA'])
    expect(agg.keyFigures).toMatchObject({
      pss: { rate: 50, approved: 1, total: 2 },
      ss: { rate: 100, approvedBags: 960, totalBags: 960 },
      busiestMonth: { label: 'Jul', value: 960, unit: 'bags' },
      topReason: { category: 'Moisture', certificates: 1 },
      largestShipper: { name: 'Comexim', mt: 57.6 },
      origins: [{ name: 'Brazil', pct: 100 }],
      labs: [{ name: 'Santos', pct: 100 }],
    })
    expect(agg.quality).toBe(quality)
  })

  it('draws the year flow in the charcoal palette at the landscape size', () => {
    const agg = buildAnnualAggregates(pss, ss, { sankeyType: 'roaster', clientDisplay: 'Ahold', quality })
    expect(agg.sankey.width).toBe(760)
    expect(agg.sankey.height).toBe(330)
    expect(agg.sankey.palette).toEqual(CHARCOAL_SANKEY_PALETTE)
    expect(agg.showSankey).toBe(true)
  })

  it('adds importer and roaster grids only for a final-buyer client with more than one of them', () => {
    const rows = [
      annualRow({ importer_name: 'OFI', roaster_name: 'Unsold' }),
      annualRow({ importer_name: 'Coffee America', roaster_name: 'Unsold' }),
    ]
    const buyer = buildAnnualAggregates(rows, [], { sankeyType: 'final_buyer', clientDisplay: 'Dunkin', quality })
    expect(buyer.months.pss.byImporter?.rows.map(r => r.name).sort()).toEqual(['Coffee America', 'OFI'])
    expect(buyer.months.pss.byRoaster).toBeNull()
    const roaster = buildAnnualAggregates(rows, [], { sankeyType: 'roaster', clientDisplay: 'Ahold', quality })
    expect(roaster.months.pss.byImporter).toBeNull()
  })

  it('falls back to pre-shipment figures for a client without shipment samples', () => {
    const agg = buildAnnualAggregates(pss, [], { sankeyType: 'roaster', clientDisplay: 'Ahold', quality })
    expect(agg.glance.basis).toBe('pss')
    expect(agg.keyFigures.ss).toBeNull()
    expect(agg.keyFigures.busiestMonth).toMatchObject({ label: 'Jun', unit: 'certificates' })
    expect(agg.showSankey).toBe(false)
  })

  it('is zero-safe for a year without certificates', () => {
    const agg = buildAnnualAggregates([], [], { sankeyType: 'roaster', clientDisplay: 'Ahold', quality })
    expect(agg.glance.certificates.total).toBe(0)
    expect(agg.keyFigures).toMatchObject({ pss: null, ss: null, busiestMonth: null, topReason: null, largestShipper: null })
    expect(agg.supplierReview.shippers).toEqual([])
  })
})

describe('labUnitRefs', () => {
  it('names each lab unit once, by its earliest certificate', () => {
    const refs = labUnitRefs([
      annualRow({ lab_unit_id: 'L1', certificate_number: 'SAK-2/26', approval_date: '2026-07-01T00:00:00.000Z' }),
      annualRow({ lab_unit_id: 'L1', certificate_number: 'SAK-1/26', approval_date: '2026-06-01T00:00:00.000Z', exporter_name: 'EISA' }),
      annualRow({ lab_unit_id: 'L2', certificate_number: 'SAK-3/26' }),
    ])
    expect(refs).toEqual([
      { labUnitId: 'L1', shipper: 'EISA', certificateNumber: 'SAK-1/26' },
      { labUnitId: 'L2', shipper: 'Comexim', certificateNumber: 'SAK-3/26' },
    ])
  })
})
