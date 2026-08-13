import { describe, it, expect } from 'vitest'
import {
  buildMonthlySeries,
  computeHero,
  buildAnnualAggregates,
  toAnnualRow,
} from './annual-data'
import type { PerformanceRow } from './performance-data'

// Minimal row factory — only the fields the aggregation reads.
function row(p: Partial<PerformanceRow> & { is_rejected: boolean } & Record<string, unknown>): PerformanceRow {
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
  } as unknown as PerformanceRow
}

describe('computeHero', () => {
  it('combines PSS + SS totals and rates', () => {
    const pssRows = [row({ is_rejected: false }), row({ is_rejected: true })]
    const ssRows = [row({ is_rejected: false, bags: 600 }), row({ is_rejected: false, bags: 400 })]
    // aggregateBucket is imported inside annual-data; here we feed its outputs:
    const hero = computeHero(
      { totals: { evaluated: 2, approved: 1, rejected: 1, rejectionRate: 50, bagsApproved: 0, mtApproved: 0 } } as any,
      { totals: { evaluated: 2, approved: 2, rejected: 0, rejectionRate: 0, bagsApproved: 1000, mtApproved: 0 } } as any,
    )
    expect(hero.samplesEvaluated).toBe(4)
    expect(hero.rejections).toBe(1)
    expect(hero.bagsCleared).toBe(1000)
    expect(hero.overallApprovalRate).toBe(75)   // 3 approved / 4 evaluated
    expect(hero.overallRejectionRate).toBe(25)
  })

  it('is zero-safe with no samples', () => {
    const hero = computeHero(
      { totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0, mtApproved: 0 } } as any,
      { totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0, mtApproved: 0 } } as any,
    )
    expect(hero.overallApprovalRate).toBe(0)
    expect(hero.samplesEvaluated).toBe(0)
  })
})

describe('buildMonthlySeries', () => {
  it('always returns 12 zero-filled months in order', () => {
    const series = buildMonthlySeries([], [])
    expect(series).toHaveLength(12)
    expect(series[0]).toMatchObject({ month: 1, label: 'Jan', evaluated: 0, approvalRate: 0 })
    expect(series[11].label).toBe('Dec')
  })

  it('buckets rows by UTC month and computes rate + bags', () => {
    const pssRows = [
      row({ is_rejected: false, created_at: '2025-03-10T00:00:00Z' }),
      row({ is_rejected: true, created_at: '2025-03-20T00:00:00Z' }),
    ]
    const ssRows = [
      row({ is_rejected: false, bags: 500, created_at: '2025-03-05T00:00:00Z' }),
    ]
    const series = buildMonthlySeries(pssRows, ssRows)
    const mar = series[2] // March
    expect(mar.evaluated).toBe(3)        // 2 PSS + 1 SS
    expect(mar.approved).toBe(2)
    expect(mar.rejected).toBe(1)
    expect(mar.approvalRate).toBe(67)    // round(2/3*100)
    expect(mar.bagsApproved).toBe(500)   // SS approved bags only
  })
})

describe('buildAnnualAggregates', () => {
  const pssRows = [
    row({ is_rejected: false, exporter_name: 'Comexim', seller_name: 'Comexim', importer_name: 'Imp A', origin: 'Brazil', laboratory_name: 'Santos' }),
    row({ is_rejected: true, exporter_name: 'Eisa', seller_name: null, importer_name: 'Imp A', origin: 'Brazil', laboratory_name: 'Santos' }),
  ]
  const ssRows = [
    row({ is_rejected: false, bags: 1200, exporter_name: 'Comexim', seller_name: 'Comexim', importer_name: 'Imp A', origin: 'Colombia', laboratory_name: 'Buenaventura' }),
  ]

  it('produces per-exporter PSS (count) and SS (bags) buckets', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    expect(agg.pss.totals.evaluated).toBe(2)
    expect(agg.ss.totals.bagsApproved).toBe(1200)
    expect(agg.pss.byExporter.map(g => g.name)).toContain('Comexim')
  })

  it('falls back to the shipper name when no seller is recorded, matching the period reports and the Sankey', () => {
    // Eisa row has seller_name: null — must bucket under its shipper (Eisa),
    // not a placeholder, or the Seller Performance page and the Year Flow
    // Sankey a few pages later would name the same lot two different ways.
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    const names = agg.bySellerPss.map(g => g.name)
    expect(names).toContain('Comexim')
    expect(names).toContain('Eisa')
    expect(names).not.toContain('Unspecified')
  })

  it('drops a row with neither a seller nor an exporter, rather than bucketing it under a placeholder', () => {
    const noCounterparty = [
      row({ is_rejected: false, exporter_name: null, seller_name: null, importer_name: 'Imp A' }),
    ]
    const agg = buildAnnualAggregates(noCounterparty, [], { sankeyType: 'importer', clientDisplay: 'Test Co' })
    expect(agg.bySellerPss).toEqual([])
  })

  it('builds by-origin and by-lab from combined rows', () => {
    const agg = buildAnnualAggregates(pssRows, ssRows, { sankeyType: 'importer', clientDisplay: 'Test Co' })
    expect(agg.byOrigin.map(g => g.name).sort()).toEqual(['Brazil', 'Colombia'])
    expect(agg.byLab.map(g => g.name).sort()).toEqual(['Buenaventura', 'Santos'])
    expect(agg.labsCovered.sort()).toEqual(['Buenaventura', 'Santos'])
    expect(agg.originsCovered.sort()).toEqual(['Brazil', 'Colombia'])
  })

  it('sets showSankey false when fewer than 3 columns resolve', () => {
    // single counterparty → not enough columns for a meaningful flow
    const thin = [row({ is_rejected: false, bags: 100, exporter_name: 'Comexim', importer_name: null })]
    const agg = buildAnnualAggregates([], thin, { sankeyType: 'importer', clientDisplay: 'Test Co' })
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
})
