import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { PerformanceReport, chartRowLayout } from './performance-report'
import type { PerformanceReportData, PerformanceBucket } from '@/lib/reports/performance-data'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

describe('chartRowLayout', () => {
  it('single importer, multi exporter → importer donut + exporter bars', () => {
    expect(chartRowLayout(1, 5)).toEqual({ mode: 'split', importer: 'donut', exporter: 'bars' })
  })
  it('multi importer, single exporter → importer bars + exporter donut', () => {
    expect(chartRowLayout(4, 1)).toEqual({ mode: 'split', importer: 'bars', exporter: 'donut' })
  })
  it('both multi → 2-up bars', () => {
    expect(chartRowLayout(3, 4)).toEqual({ mode: 'split', importer: 'bars', exporter: 'bars' })
  })
  it('both single → identity card (names nobody via a chart)', () => {
    expect(chartRowLayout(1, 1)).toEqual({ mode: 'identity', importer: 'none', exporter: 'donut' })
  })
  it('empty bucket (0 companies) → identity card', () => {
    expect(chartRowLayout(0, 0)).toEqual({ mode: 'identity', importer: 'none', exporter: 'donut' })
  })
})

const bucket = (over: Partial<PerformanceBucket> = {}): PerformanceBucket => ({
  totals: {
    evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33,
    bagsApproved: 666, mtApproved: 40.0, bagsRejected: 333, mtRejected: 20.0,
    contracts: 2, fcl: 1,
  },
  byImporter: [{ name: 'Ahold', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, approvedMt: 40.0, rejectedMt: 20.0, rejectionRate: 33 }],
  bySeller: [
    { name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 },
    { name: 'Ofi', approvedCount: 1, rejectedCount: 0, approvedBags: 333, rejectedBags: 0, approvedMt: 20.0, rejectedMt: 0, rejectionRate: 0 },
  ],
  byExporter: [
    { name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 },
    { name: 'Ofi', approvedCount: 1, rejectedCount: 0, approvedBags: 333, rejectedBags: 0, approvedMt: 20.0, rejectedMt: 0, rejectionRate: 0 },
  ],
  rejectionReasons: [{ category: 'Cupping faults', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 2, bags: 666, mt: 40.0, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 333, mt: 20.0, pct: 100 }],
  rows: [
    {
      approval_date: '2026-06-02T00:00:00Z', certificate_number: 'SAX-011690/26',
      exporter_name: 'Cooxupe', seller_name: 'Cooxupe', importer_name: 'Ahold',
      importer_contract_nr: 'IR0007351-1', roaster_name: 'Unsold', container_nr: 'MSBU 286.641-9',
      ico_marks: '002/1848/1751', bags: 333, mt: 20.0, is_rejected: false, region: 'Cerrado',
    },
    {
      approval_date: '2026-06-03T00:00:00Z', certificate_number: 'SAX-011691/26',
      exporter_name: 'Ofi', seller_name: 'Ofi', importer_name: 'Ahold',
      importer_contract_nr: 'IR0007352-1', roaster_name: 'Unsold', container_nr: null,
      ico_marks: null, bags: 333, mt: 20.0, is_rejected: true, region: 'Cerrado',
    },
  ],
  ...over,
})

const base = (over: Partial<PerformanceReportData> = {}): PerformanceReportData => ({
  client: { id: 'c', name: 'Ahold', logo_url: null, is_roaster: true, sankey_type: 'roaster' },
  period: { start_date: '2026-06-01T00:00:00Z', end_date: '2026-07-01T00:00:00Z', issued_at: '2026-07-06T00:00:00Z' },
  origin: 'Brazil',
  ratings: {
    shippers: [{ rank: 1, name: 'Cooxupe', total: 4, pss: 2, ss: 2, approvalRate: 75 }],
    sellers: [{ rank: 1, name: 'Cooxupe', total: 4, pss: 2, ss: 2, approvalRate: 75 }],
    window: { start: '2026-01-01T00:00:00.000Z', end: '2026-07-01T00:00:00Z' },
  },
  pss: bucket(),
  ss: bucket(),
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: ['Shipper', 'Seller', 'Importer'],
  showSankey: true,
  ...over,
})

describe('PerformanceReport', () => {
  it('renders SS+PSS with Sankey (multi-page)', async () => {
    const buf = await renderToBuffer(React.createElement(PerformanceReport, { data: base() }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders PSS-only', async () => {
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null, sankey: null, sankeyColumns: [], showSankey: false }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders SS-only with an empty bucket', async () => {
    const empty = bucket({
      totals: {
        evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0,
        bagsApproved: 0, mtApproved: 0, bagsRejected: 0, mtRejected: 0,
        contracts: 0, fcl: 0,
      },
      byImporter: [], bySeller: [], byExporter: [], rejectionReasons: [], approvedByRegion: [], rejectedByRegion: [], rows: [],
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ pss: null, ss: empty, showSankey: false }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders the reject-by-reason overview + top-5 defect columns without error', async () => {
    // Multiple reasons and >5 defects each → exercises the overview bars and
    // the top-5 slice in ReasonsSection.
    const many = bucket({
      rejectionReasons: [
        { category: 'Total defects', count: 6 },
        { category: 'Cupping faults', count: 2 },
        { category: 'Moisture', count: 1 },
      ],
      greenDefects: Array.from({ length: 7 }, (_, i) => ({ name: `Green ${i}`, count: 20 - i })),
      cuppingDefects: Array.from({ length: 6 }, (_, i) => ({ name: `Cup ${i}`, kind: 'fault' as const, count: 6 - i })),
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null, sankey: null, sankeyColumns: [], showSankey: false, pss: many }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders the single-company identity card + named rejection breakdown', async () => {
    // Both sides single company → identity card; named defect breakdown present.
    const single = bucket({
      byImporter: [{ name: 'Ahold', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 }],
      byExporter: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 }],
      greenDefects: [{ name: 'Black beans', count: 8 }, { name: 'Sour beans', count: 5 }],
      cuppingDefects: [{ name: 'Phenol', kind: 'fault', count: 2 }],
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ pss: null, ss: single, sankey: null, sankeyColumns: [], showSankey: false }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
})
