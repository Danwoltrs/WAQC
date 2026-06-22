import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { BiweeklyPerformanceReport } from './biweekly-performance-report'
import type { BiweeklyPerformanceReportData, BucketAggregate } from '@/lib/reports/biweekly-data'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

const emptyBucket: BucketAggregate = {
  totals: { evaluated: 0, approved: 0, rejected: 0, rejectionRate: 0, bagsApproved: 0 },
  byImporter: [], byExporter: [], rejectionReasons: [], approvedByRegion: [], rejectedByRegion: [],
}
const filledBucket: BucketAggregate = {
  totals: { evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33, bagsApproved: 666 },
  byImporter: [{ name: 'Ofi', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, rejectionRate: 33 }],
  byExporter: [{ name: 'Cooxupe', approvedCount: 2, rejectedCount: 1, approvedBags: 666, rejectedBags: 333, rejectionRate: 33 }],
  rejectionReasons: [{ category: 'Balance below min', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 2, bags: 666, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 333, pct: 100 }],
}
const base = (showSankey: boolean): BiweeklyPerformanceReportData => ({
  client: { id: 'c', name: 'Dunkin', logo_url: null, is_roaster: false, sankey_type: showSankey ? 'final_buyer' : 'importer' },
  period: { start_date: '2026-01-01T00:00:00Z', end_date: '2026-01-16T00:00:00Z', issued_at: '2026-01-19T00:00:00Z' },
  origin: 'Brazil',
  pss: filledBucket, ss: filledBucket, ssApprovedRows: [],
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: showSankey ? ['Shipper', 'Seller', 'Importer', 'Roaster'] : ['Shipper', 'Seller'],
  showSankey,
})

describe('BiweeklyPerformanceReport', () => {
  it('renders with Sankey (final_buyer, >2 companies)', async () => {
    const buf = await renderToBuffer(React.createElement(BiweeklyPerformanceReport, { data: base(true) }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders without Sankey (importer, 2 companies) and with an empty bucket', async () => {
    const data = { ...base(false), pss: emptyBucket }
    const buf = await renderToBuffer(React.createElement(BiweeklyPerformanceReport, { data }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
