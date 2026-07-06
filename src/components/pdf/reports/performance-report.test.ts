import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { PerformanceReport, chartRowLayout } from './performance-report'
import type { PerformanceReportData, PerformanceBucket } from '@/lib/reports/performance-data'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

describe('chartRowLayout', () => {
  it('single importer → donut + reasons join the row', () => {
    expect(chartRowLayout(1, 5)).toEqual({ importer: 'donut', exporter: 'bars', reasonsInRow: true })
  })
  it('single exporter → exporter donut', () => {
    expect(chartRowLayout(4, 1)).toEqual({ importer: 'bars', exporter: 'donut', reasonsInRow: true })
  })
  it('both multi → 2-up bars, reasons full-width below', () => {
    expect(chartRowLayout(3, 4)).toEqual({ importer: 'bars', exporter: 'bars', reasonsInRow: false })
  })
  it('both single → one combined donut (no duplicate)', () => {
    expect(chartRowLayout(1, 1)).toEqual({ importer: 'none', exporter: 'donut', reasonsInRow: true })
  })
})

const bucket = (over: Partial<PerformanceBucket> = {}): PerformanceBucket => ({
  totals: { evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33, bagsApproved: 666, mtApproved: 40.0 },
  byImporter: [{ name: 'Ahold', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, rejectionRate: 33 }],
  byExporter: [
    { name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, rejectionRate: 50 },
    { name: 'Ofi', approvedCount: 1, rejectedCount: 0, approvedBags: 333, rejectedBags: 0, rejectionRate: 0 },
  ],
  rejectionReasons: [{ category: 'Cupping faults', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 2, bags: 666, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 333, pct: 100 }],
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
  pss: bucket(),
  ss: bucket(),
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: ['Shipper', 'Seller', 'Importer'],
  showSankey: true,
  ...over,
})

describe('PerformanceReport', () => {
  it('renders SS+PSS (4 pages) with Sankey', async () => {
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
      totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0, mtApproved: 0 },
      byImporter: [], byExporter: [], rejectionReasons: [], approvedByRegion: [], rejectedByRegion: [], rows: [],
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ pss: null, ss: empty, showSankey: false }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
})
