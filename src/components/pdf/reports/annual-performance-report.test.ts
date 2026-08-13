import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { AnnualPerformanceReport } from './annual-performance-report'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'
import type { AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import type { GroupPerf } from '@/lib/reports/performance-data'

const g = (over: Partial<GroupPerf> = {}): GroupPerf => ({
  name: 'Comexim', approvedCount: 12, rejectedCount: 1,
  approvedBags: 4320, rejectedBags: 360, approvedMt: 259.2, rejectedMt: 21.6,
  rejectionRate: 8, ...over,
})

const bucketAgg = () => ({
  totals: {
    evaluated: 13, approved: 12, rejected: 1, rejectionRate: 8,
    bagsApproved: 4320, mtApproved: 259.2, bagsRejected: 360, mtRejected: 21.6,
    contracts: 7, fcl: 13,
  },
  byImporter: [g({ name: 'Ahold' })],
  bySeller: [g({ name: 'Volcafe CH' })],
  byExporter: [g(), g({ name: 'Ecom', rejectedCount: 0, rejectedBags: 0, rejectedMt: 0, rejectionRate: 0 })],
  rejectionReasons: [{ category: 'Cupping faults', count: 1 }],
  approvedByRegion: [{ region: 'Cerrado', count: 12, bags: 4320, mt: 259.2, pct: 100 }],
  rejectedByRegion: [{ region: 'Cerrado', count: 1, bags: 360, mt: 21.6, pct: 100 }],
})

const data: AnnualPerformanceReportData = {
  client: { id: 'c', name: 'Ahold', logo_url: null, is_roaster: true, sankey_type: 'roaster' },
  period: { year: 2026, issued_at: '2026-12-31T00:00:00Z' },
  origin: 'Brazil',
  agg: {
    hero: { samplesEvaluated: 26, overallApprovalRate: 92, bagsCleared: 4320, rejections: 2, overallRejectionRate: 8 },
    pss: bucketAgg(),
    ss: bucketAgg(),
    bySellerPss: [g({ name: 'Volcafe CH' })],
    bySellerSs: [g({ name: 'Volcafe CH' }), g({ name: 'Rothfos GmbH' })],
    byOrigin: [g({ name: 'Brazil' })],
    byLab: [g({ name: 'Santos' })],
    labsCovered: ['Santos'],
    originsCovered: ['Brazil'],
    monthly: [],
    sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
    sankeyColumns: ['Shipper', 'Seller', 'Importer'],
    showSankey: true,
  },
}

// Walk the React element tree returned by AnnualPerformanceReport — a plain
// function component with no hooks/context, so it's safe to call directly —
// and collect one text token per rendered <Text>, in document order. Mirrors
// the pattern in performance-report.test.ts.
function flattenLeaves(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(flattenLeaves)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown } }
    if (typeof type === 'function') return flattenLeaves((type as (p: unknown) => unknown)(props))
    return flattenLeaves(props?.children)
  }
  return []
}

function collectTexts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (Array.isArray(node)) return node.flatMap(collectTexts)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown } }
    if (typeof type === 'function') return collectTexts((type as (p: unknown) => unknown)(props))
    if (type === 'TEXT') {
      const leaves = flattenLeaves(props?.children)
      return leaves.length > 0 ? [leaves.join('')] : []
    }
    return collectTexts(props?.children)
  }
  return []
}

describe('AnnualPerformanceReport', () => {
  it('renders the full report including seller pages', async () => {
    const buf = await renderToBuffer(React.createElement(AnnualPerformanceReport, { data }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders with empty seller lists (no seller ever recorded)', async () => {
    const bare = { ...data, agg: { ...data.agg, bySellerPss: [], bySellerSs: [] } }
    const buf = await renderToBuffer(React.createElement(AnnualPerformanceReport, { data: bare }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe('AnnualPerformanceReport content', () => {
  it('renders distinct Exporter and Seller page headers, and the seller pages show seller names not exporter names', () => {
    const el = AnnualPerformanceReport({ data })
    const texts = collectTexts(el)

    // Section titles for all four PerfTable pages are present.
    expect(texts).toContain('Pre-Shipment (PSS) Performance · by sample')
    expect(texts).toContain('Shipment (SS) Performance · by bags')
    expect(texts).toContain('Pre-Shipment (PSS) Seller Performance · by sample')
    expect(texts).toContain('Shipment (SS) Seller Performance · by bags')

    // Table headers: both 'Exporter' and 'Seller' appear (proves nameHeader
    // is wired through rather than hardcoded to 'Exporter' everywhere).
    const exporterHeaderCount = texts.filter(t => t === 'Exporter').length
    const sellerHeaderCount = texts.filter(t => t === 'Seller').length
    expect(exporterHeaderCount).toBe(2) // PSS + SS exporter tables
    expect(sellerHeaderCount).toBe(2) // PSS + SS seller tables (plus BreakdownBlock's "By Seller" title, checked separately)

    // 'Rothfos GmbH' only exists in agg.bySellerSs (never in byExporter, and
    // never in bySellerPss). It already renders once via the pre-existing
    // Counterparty Breakdowns' BreakdownBlock (title="By Seller", rows=
    // agg.bySellerSs) — so a lone toContain('Rothfos GmbH') would pass even
    // if the new SS Seller PerfTable page were wired to the wrong data
    // (verified: swapping its rows to agg.ss.byExporter still left this
    // string present, from the unrelated BreakdownBlock). The new SS Seller
    // page must add a SECOND occurrence, so the true count is 2.
    expect(texts.filter(t => t === 'Rothfos GmbH')).toHaveLength(2)

    // 'Comexim' (an exporter-only name, from g()'s default) must never appear
    // as a row on either seller page — guards the seller pages against
    // silently rendering byExporter data instead of bySellerPss/bySellerSs.
    // It legitimately appears 3 times pre-existing (PSS exporter PerfTable,
    // SS exporter PerfTable, and Counterparty Breakdowns' "By Exporter /
    // Shipper" BreakdownBlock) — a 4th occurrence would mean a seller page
    // leaked exporter rows.
    expect(texts.filter(t => t === 'Comexim')).toHaveLength(3)
  })

  it('MT APP / MT REJ columns render one-decimal values and TOTAL GERAL sums MT across rows', () => {
    // Custom two-row exporter table with distinct, non-overlapping MT values
    // so the summed TOTAL GERAL figures can't be mistaken for a single row's
    // own value (the brief's bucketAgg() fixture happens to reuse 259.2/21.6
    // for both rows on one axis, which would make a sum-vs-row mixup pass by
    // accident).
    const mtAgg = {
      ...bucketAgg(),
      byExporter: [
        g({ name: 'Solo', approvedMt: 100.0, rejectedMt: 10.0 }),
        g({ name: 'Duo', approvedMt: 50.5, rejectedMt: 5.5 }),
      ],
    }
    const mtData: AnnualPerformanceReportData = { ...data, agg: { ...data.agg, pss: mtAgg } }
    const el = AnnualPerformanceReport({ data: mtData })
    const texts = collectTexts(el)

    expect(texts).toContain('MT APP')
    expect(texts).toContain('MT REJ')
    expect(texts).toContain('100.0') // row MT APP, one decimal
    expect(texts).toContain('10.0') // row MT REJ, one decimal
    expect(texts).toContain('50.5')
    expect(texts).toContain('5.5')
    expect(texts).toContain('150.5') // TOTAL GERAL MT APP = 100.0 + 50.5
    expect(texts).toContain('15.5') // TOTAL GERAL MT REJ = 10.0 + 5.5
  })
})
