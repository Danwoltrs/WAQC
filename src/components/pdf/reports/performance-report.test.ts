import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { PerformanceReport, chartRowLayout } from './performance-report'
import type { PerformanceReportData, PerformanceBucket } from '@/lib/reports/performance-data'
import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

// Same short-date formatting PerformanceReport uses internally (uses the
// runner's local TZ via toLocaleString, so the test computes its expectation
// the same way rather than pinning a literal string that would only hold in
// one timezone).
const fmtShort = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}`
}

// Flatten every string/number leaf under a node, resolving nested function
// components along the way (react-pdf primitives like View/Text carry a
// plain string `type` — 'VIEW', 'TEXT' — so only actual function components
// like KpiBand/IdentityCard/RegionTable hit that branch). Mirrors the
// pattern in supplier-rating-table.test.ts.
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

// Walk the React element tree returned by PerformanceReport — a plain
// function component with no hooks/context, so it's safe to call directly —
// and collect one text token per rendered <Text>, in document order.
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

describe('chartRowLayout', () => {
  it('single seller, multi exporter → seller donut + exporter bars', () => {
    expect(chartRowLayout(1, 5)).toEqual({ mode: 'split', seller: 'donut', exporter: 'bars' })
  })
  it('multi seller, single exporter → seller bars + exporter donut', () => {
    expect(chartRowLayout(4, 1)).toEqual({ mode: 'split', seller: 'bars', exporter: 'donut' })
  })
  it('both multi → 2-up bars', () => {
    expect(chartRowLayout(3, 4)).toEqual({ mode: 'split', seller: 'bars', exporter: 'bars' })
  })
  it('both single → identity card (names nobody via a chart)', () => {
    expect(chartRowLayout(1, 1)).toEqual({ mode: 'identity', seller: 'none', exporter: 'donut' })
  })
  it('empty bucket (0 companies) → identity card', () => {
    expect(chartRowLayout(0, 0)).toEqual({ mode: 'identity', seller: 'none', exporter: 'donut' })
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
  sankey: computeSankeyLayout([{ id: 'a', label: 'A', column: 0 }], [], { width: 720, height: 260 }),
  sankeyColumns: ['Shipper', 'Seller', 'Importer'],
  showSankey: true,
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
  ...over,
})

describe('PerformanceReport', () => {
  it('renders SS+PSS with Sankey (multi-page)', async () => {
    const buf = await renderToBuffer(React.createElement(PerformanceReport, { data: base() }) as any)
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('renders PSS-only', async () => {
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null }) }) as any,
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
      showSankey: false,
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ pss: null, ss: empty }) }) as any,
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
      showSankey: false,
    })
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null, pss: many }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders the single-company identity card + named rejection breakdown', async () => {
    // Both sides single company (seller AND exporter — chartRowLayout keys off
    // bySeller since the seller-axis rename) → identity card; named defect
    // breakdown present.
    const single = bucket({
      byImporter: [{ name: 'Ahold', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 }],
      bySeller: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 }],
      byExporter: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 1, approvedBags: 333, rejectedBags: 333, approvedMt: 20.0, rejectedMt: 20.0, rejectionRate: 50 }],
      greenDefects: [{ name: 'Black beans', count: 8 }, { name: 'Sour beans', count: 5 }],
      cuppingDefects: [{ name: 'Phenol', kind: 'fault', count: 2 }],
      showSankey: false,
    })
    // Sanity: this fixture must actually reach the identity branch, or the
    // render below would silently exercise the split-mode bar charts instead
    // of the identity card this test is named for.
    expect(chartRowLayout(single.bySeller.length, single.byExporter.length).mode).toBe('identity')
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ pss: null, ss: single }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('renders a PSS-only report that still carries its own Sankey', async () => {
    const buf = await renderToBuffer(
      React.createElement(PerformanceReport, { data: base({ ss: null, pss: bucket({ showSankey: true }) }) }) as any,
    )
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe('PerformanceReport content', () => {
  // PerformanceReport has no hooks/context, so it is safe to call directly
  // and walk the returned element tree — proving actual text content, not
  // just that a PDF of some length came out the other end.

  it('KPI band counts contracts (not raw cert count), gates FCL to SS, and gives PSS its own Bags/MT (previously SS-only)', () => {
    const pssBucket = bucket({
      totals: {
        evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33,
        bagsApproved: 111, mtApproved: 1.5, bagsRejected: 50, mtRejected: 0.5,
        contracts: 5, fcl: 0,
      },
      showSankey: false,
    })
    const ssBucket = bucket({
      totals: {
        evaluated: 4, approved: 3, rejected: 1, rejectionRate: 25,
        bagsApproved: 222, mtApproved: 2.5, bagsRejected: 80, mtRejected: 1.0,
        contracts: 9, fcl: 3,
      },
      showSankey: false,
    })
    const el = PerformanceReport({ data: base({ pss: pssBucket, ss: ssBucket }) })
    const texts = collectTexts(el)

    const contractsIdxs = texts.reduce<number[]>((acc, t, i) => (t === 'Contracts' ? [...acc, i] : acc), [])
    expect(contractsIdxs).toHaveLength(2) // one KPI band per bucket, no more
    expect(texts[contractsIdxs[0] - 1]).toBe('5') // PSS band prints first
    expect(texts[contractsIdxs[1] - 1]).toBe('9') // SS band prints second

    const fclIdxs = texts.reduce<number[]>((acc, t, i) => (t === 'FCL' ? [...acc, i] : acc), [])
    expect(fclIdxs).toHaveLength(1) // FCL only ever appears for SS
    expect(texts[fclIdxs[0] - 1]).toBe('3')

    // PSS's own KPI-band Bags/MT values, proving PSS is no longer skipped.
    expect(texts).toContain('111')
    expect(texts).toContain('1.5')
    expect(texts).toContain('222')
    expect(texts).toContain('2.5')
  })

  it('IdentityCard stats: Contracts (not Certificates), FCL spliced right after Contracts for SS only, Bags/MT for both', () => {
    // A single seller AND a single exporter on both buckets — the branch this
    // task's seller-axis rename could silently detach a test from (it did,
    // once, in the initial version of this task: a fixture that only
    // single-cardinalised byImporter/byExporter no longer reaches 'identity'
    // once chartRowLayout keys off bySeller).
    const pssBucket = bucket({
      byImporter: [{ name: 'Ahold', approvedCount: 1, rejectedCount: 0, approvedBags: 100, rejectedBags: 0, approvedMt: 6.0, rejectedMt: 0, rejectionRate: 0 }],
      bySeller: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 0, approvedBags: 100, rejectedBags: 0, approvedMt: 6.0, rejectedMt: 0, rejectionRate: 0 }],
      byExporter: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 0, approvedBags: 100, rejectedBags: 0, approvedMt: 6.0, rejectedMt: 0, rejectionRate: 0 }],
      totals: {
        evaluated: 1, approved: 1, rejected: 0, rejectionRate: 0,
        bagsApproved: 100, mtApproved: 6.0, bagsRejected: 0, mtRejected: 0,
        contracts: 4, fcl: 0,
      },
      showSankey: false,
    })
    const ssBucket = bucket({
      byImporter: [{ name: 'Ahold', approvedCount: 1, rejectedCount: 0, approvedBags: 200, rejectedBags: 0, approvedMt: 12.0, rejectedMt: 0, rejectionRate: 0 }],
      bySeller: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 0, approvedBags: 200, rejectedBags: 0, approvedMt: 12.0, rejectedMt: 0, rejectionRate: 0 }],
      byExporter: [{ name: 'Cooxupe', approvedCount: 1, rejectedCount: 0, approvedBags: 200, rejectedBags: 0, approvedMt: 12.0, rejectedMt: 0, rejectionRate: 0 }],
      totals: {
        evaluated: 1, approved: 1, rejected: 0, rejectionRate: 0,
        bagsApproved: 200, mtApproved: 12.0, bagsRejected: 0, mtRejected: 0,
        contracts: 7, fcl: 2,
      },
      showSankey: false,
    })
    // Sanity: both fixtures must actually land on the identity branch —
    // otherwise the assertions below would silently verify nothing.
    expect(chartRowLayout(pssBucket.bySeller.length, pssBucket.byExporter.length).mode).toBe('identity')
    expect(chartRowLayout(ssBucket.bySeller.length, ssBucket.byExporter.length).mode).toBe('identity')

    const el = PerformanceReport({ data: base({ pss: pssBucket, ss: ssBucket }) })
    const texts = collectTexts(el)

    expect(texts).not.toContain('Certificates') // old label must be gone everywhere

    // Identity mode renders BOTH the KpiBand and the IdentityCard, so
    // 'Contracts' appears twice per bucket: once as a KpiBand item (value
    // then label) and once as an IdentityCard stat row (label then value).
    // Document order: PSS's KpiBand, PSS's IdentityCard, SS's KpiBand, SS's
    // IdentityCard.
    const contractsIdxs = texts.reduce<number[]>((acc, t, i) => (t === 'Contracts' ? [...acc, i] : acc), [])
    expect(contractsIdxs).toHaveLength(4)

    const pssCardIdx = contractsIdxs[1]
    // PSS (no FCL): Contracts, 4, Approved, 1, Rejected, 0, Bags, 100, MT, 6.0
    expect(texts.slice(pssCardIdx, pssCardIdx + 10)).toEqual([
      'Contracts', '4', 'Approved', '1', 'Rejected', '0', 'Bags', '100', 'MT', '6.0',
    ])

    const ssCardIdx = contractsIdxs[3]
    // SS: FCL spliced in immediately after Contracts (splice(1, 0, ['FCL', …])).
    expect(texts.slice(ssCardIdx, ssCardIdx + 12)).toEqual([
      'Contracts', '7', 'FCL', '2', 'Approved', '1', 'Rejected', '0', 'Bags', '200', 'MT', '12.0',
    ])
  })

  it('titles the first chart column Seller, keyed off bySeller rather than byImporter', () => {
    // Default fixture: 2 sellers, 2 exporters on both buckets → split/bars mode.
    const el = PerformanceReport({ data: base() })
    const texts = collectTexts(el)
    expect(texts).toContain('Seller PSS')
    expect(texts).toContain('Exporter PSS')
    expect(texts).toContain('Seller SS')
    expect(texts).toContain('Exporter SS')
    expect(texts).not.toContain('Importer PSS')
    expect(texts).not.toContain('Importer SS')
  })

  it('adds an MT column to the region tables and totals it to one decimal', () => {
    const ssBucket = bucket({
      totals: {
        evaluated: 2, approved: 2, rejected: 0, rejectionRate: 0,
        bagsApproved: 900, mtApproved: 88.8, bagsRejected: 0, mtRejected: 0,
        contracts: 1, fcl: 1,
      },
      approvedByRegion: [
        { region: 'Sul de Minas', count: 1, bags: 400, mt: 12.34, pct: 50 },
        { region: 'Cerrado', count: 1, bags: 500, mt: 15.66, pct: 50 },
      ],
      rejectedByRegion: [],
      showSankey: false,
    })
    const el = PerformanceReport({ data: base({ pss: null, ss: ssBucket }) })
    const texts = collectTexts(el)
    expect(texts).toContain('12.3') // row MT, toFixed(1) of 12.34
    expect(texts).toContain('15.7') // row MT, toFixed(1) of 15.66
    expect(texts).toContain('28.0') // total: round((12.34+15.66)*10)/10, then toFixed(1)
  })

  it('shows the appendix Seller column once a row differs from its shipper, with separate approved/rejected totals', () => {
    const row = (over: Partial<PerformanceBucket['rows'][number]>) => ({
      approval_date: '2026-06-02T00:00:00Z', certificate_number: 'SAX-1',
      exporter_name: 'Grano', seller_name: 'Volcafe', importer_name: 'Ahold',
      importer_contract_nr: 'IR1', roaster_name: 'Unsold', container_nr: 'C1',
      ico_marks: null, bags: 400, mt: 24.0, is_rejected: false, region: 'Cerrado',
      ...over,
    })
    const ssBucket = bucket({
      totals: {
        evaluated: 2, approved: 1, rejected: 1, rejectionRate: 50,
        bagsApproved: 400, mtApproved: 24.0, bagsRejected: 300, mtRejected: 18.0,
        contracts: 2, fcl: 2,
      },
      rows: [
        row({ certificate_number: 'SAX-1', is_rejected: false }),
        row({ certificate_number: 'SAX-2', is_rejected: true, bags: 300, mt: 18.0 }),
      ],
      showSankey: false,
    })
    const el = PerformanceReport({ data: base({ pss: null, ss: ssBucket }) })
    const texts = collectTexts(el)
    expect(texts).toContain('Seller') // column header — every row's seller (Volcafe) differs from its shipper (Grano)
    expect(texts).toContain('Volcafe')
    expect(texts).toContain('Total approved')
    expect(texts).toContain('Total rejected')
  })

  it('does not render the appendix Seller column when no row differs from its shipper', () => {
    // Default fixture: seller_name equals exporter_name on every row.
    const el = PerformanceReport({ data: base({ ss: null }) })
    const texts = collectTexts(el)
    expect(texts).not.toContain('Seller')
  })

  it('labels the year-to-date supplier rating with the ratings window, not the report period', () => {
    const data = base()
    const el = PerformanceReport({ data })
    const texts = collectTexts(el)

    const ytdDisplayEnd = new Date(new Date(data.ratings.window.end).getTime() - 86400000)
    const ytdLabel = `${fmtShort(data.ratings.window.start)} – ${fmtShort(ytdDisplayEnd.toISOString())}`
    expect(texts).toContain(ytdLabel)

    // base() gives the ratings window and the report period different starts
    // (Jan 1 vs Jun 1), so the two labels must differ — a regression that
    // wires the period into windowLabel would make this pass with the wrong
    // text, since the period label would then be what's asserted above.
    const periodDisplayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
    const periodLabel = `${fmtShort(data.period.start_date)} – ${fmtShort(periodDisplayEnd.toISOString())}`
    expect(ytdLabel).not.toBe(periodLabel)
  })

  it('renders the supplier rating table heading once per bucket page', () => {
    const el = PerformanceReport({ data: base() })
    const texts = collectTexts(el)
    expect(texts.filter(t => t === 'Supplier rating · year to date')).toHaveLength(2)
  })

  it('reads the Sankey from each bucket independently, not gated on SS or a report-level flag', () => {
    const pssOn = bucket({ showSankey: true })
    const ssOff = bucket({ showSankey: false })
    const el = PerformanceReport({ data: base({ pss: pssOn, ss: ssOff }) })
    const texts = collectTexts(el)
    expect(texts.filter(t => t === 'Supply chain flow')).toHaveLength(1) // PSS only
  })

  it('renders no supply chain flow when the bucket itself has showSankey=false', () => {
    const noFlow = bucket({ showSankey: false })
    const el = PerformanceReport({ data: base({ pss: null, ss: noFlow }) })
    const texts = collectTexts(el)
    expect(texts).not.toContain('Supply chain flow')
  })
})
