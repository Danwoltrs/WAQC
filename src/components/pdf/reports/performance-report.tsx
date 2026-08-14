/**
 * Unified performance report — A4 landscape. Renders a two-page pair per
 * requested bucket (PSS first, then SS):
 *   Page A: KPI band + charts. Adaptive: when a side (seller/exporter)
 *           has exactly one company it collapses to a compact donut and
 *           Rejection Reasons joins the row 3-up. Chart panels never wrap.
 *   Page B: approved/rejected by-region tables (with an MT column), the
 *           bucket's own supply-chain flow (per bucket, not SS-only), the
 *           year-to-date supplier rating, and the all-certs appendix
 *           (Seller + Status + Bags + MT columns, dual approved/rejected
 *           totals).
 * Powers the SS, PSS and SS+PSS reports.
 *
 * Inter font is registered globally by certificate-styles.ts.
 */
import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { sortAppendixRows, type PerformanceReportData, type PerformanceBucket, type RegionRow } from '@/lib/reports/performance-data'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { DonutChart } from '@/components/pdf/charts/donut-chart'
import { VerticalGroupedBarChart, type GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
import { CertAppendixTable, shouldShowSeller } from './cert-appendix-table'
import { SupplierRatingTables } from './supplier-rating-table'

const GREEN = '#556b2f'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'

export type BucketKind = 'PSS' | 'SS'

export interface ChartRowLayout {
  /** `identity` → both sides single company: a bar/donut names nobody, so we
   *  render a counterparty identity card instead. `split` → at least one side
   *  has multiple companies and gets a bar chart. */
  mode: 'identity' | 'split'
  seller: 'donut' | 'bars' | 'none'
  exporter: 'donut' | 'bars'
}

/**
 * Decide the Page-A chart row shape. A side with one (or zero) company is a
 * redundant single bar → compact donut. When BOTH sides are single, bars and
 * donuts name nobody, so the row becomes a counterparty identity card.
 *
 * The first slot shows the SELLER, not the importer: the importer is usually a
 * single company (the QC client itself), so that chart named nobody, while
 * seller and shipper regularly differ and are what the client wants compared.
 * The importer stays visible in the identity card and the appendix table.
 */
export function chartRowLayout(sellerCount: number, exporterCount: number): ChartRowLayout {
  const sellerSingle = sellerCount <= 1
  const exporterSingle = exporterCount <= 1
  if (sellerSingle && exporterSingle) {
    return { mode: 'identity', seller: 'none', exporter: 'donut' }
  }
  return {
    mode: 'split',
    seller: sellerSingle ? 'donut' : 'bars',
    exporter: exporterSingle ? 'donut' : 'bars',
  }
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, padding: 24, paddingBottom: 32, backgroundColor: '#FFFFFF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, minHeight: 50 },
  headerLeft: { width: '20%', justifyContent: 'center', alignItems: 'flex-start' },
  headerCenter: { width: '60%', justifyContent: 'center', alignItems: 'center' },
  headerRight: { width: '20%', justifyContent: 'center', alignItems: 'flex-end' },
  flagImage: { width: 56, height: 38, objectFit: 'contain' },
  wolthersLogo: { width: 130, height: 26, objectFit: 'contain' },
  clientLogo: { maxWidth: 100, maxHeight: 36, objectFit: 'contain' },
  generationDate: { fontSize: 8, color: '#666', marginTop: 4 },
  titleBar: {
    backgroundColor: GREEN, color: '#FFFFFF', paddingVertical: 6, paddingHorizontal: 10,
    fontWeight: 700, fontSize: 10, marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  kpiBand: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F2',
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 8,
  },
  kpiItem: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  kpiValue: { fontSize: 13, fontWeight: 700, color: '#222' },
  kpiLabel: { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiDivider: { width: 1, height: 16, backgroundColor: '#D9D9D6' },
  pageFooter: {
    position: 'absolute', bottom: 12, left: 24, right: 24,
    flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#999',
  },
  // Borderless block — charts float directly on the page (no card box).
  panel: { marginBottom: 10 },
  chartsRow: { flexDirection: 'row', gap: 16 },
  chartFlex: { flex: 1, alignItems: 'center' },
  // marginTop 0: the chart sits straight under the KPI band. At 4 the whole
  // Page A stack measured ~536pt against 539pt of usable height, so the
  // rejection block tipped onto a second page and left Page A two-thirds empty.
  chartColTitle: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4, marginTop: 0, textAlign: 'center',
  },
  donutSlot: { width: 150, alignItems: 'center' },
  subLabel: { fontSize: 8.5, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  // NOTE: Inter is registered only in weights 400/600/700 (no italic), so
  // captions/placeholders must not use fontStyle:'italic' — react-pdf throws
  // "Could not resolve font" and aborts the whole render.
  noneText: { fontSize: 9, color: '#888' },
  loadLine: { fontSize: 8, color: '#555', marginTop: 3 },
  reasonsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  reasonsCount: { fontSize: 8, color: '#888' },
  reasonsCols: { flexDirection: 'row', gap: 24 },
  // Compact overview: one pill per rejection reason (label + cert count).
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FBE9E9',
    borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7, marginRight: 6, marginBottom: 5,
  },
  chipLabel: { fontSize: 8.5, color: '#333' },
  chipCount: { fontSize: 9, fontWeight: 700, color: RED, marginLeft: 6 },
  identityCard: { marginBottom: 14 },
  identityCols: { flexDirection: 'row', gap: 40 },
  idRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  idLabel: { fontSize: 9, color: '#666', width: 78 },
  idValue: { fontSize: 10, fontWeight: 700, color: '#222', flex: 1 },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  regionPanel: { flex: 1, borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 10 },
  regionHead: { flexDirection: 'row', backgroundColor: '#F4F4F2', paddingVertical: 4, paddingHorizontal: 6 },
  regionRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  regionTotal: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#F4F4F2' },
  rCell: { fontSize: 8, color: '#222' },
  rHeadCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase' },
})

function metricCats(groups: PerformanceBucket['byExporter'], metric: 'count' | 'bags'): GroupedBarCategory[] {
  return groups.slice(0, 6).map(g => ({
    label: g.name,
    approved: metric === 'bags' ? g.approvedBags : g.approvedCount,
    rejected: metric === 'bags' ? g.rejectedBags : g.rejectedCount,
    approvedMt: g.approvedMt,
    rejectedMt: g.rejectedMt,
    rejectionRate: g.rejectionRate,
  }))
}

/** The distinct value across a bucket's rows, or 'Multiple' / '—'. */
function distinctName(
  rows: PerformanceBucket['rows'],
  pick: (r: PerformanceBucket['rows'][number]) => string | null,
): string {
  const set = new Set<string>()
  for (const r of rows) {
    const v = pick(r)?.trim()
    if (v) set.add(v)
  }
  if (set.size === 0) return '—'
  if (set.size === 1) return [...set][0]
  return 'Multiple'
}

interface RegionTableProps { title: string; rows: RegionRow[]; metric: 'count' | 'bags'; accent: string }
function RegionTable({ title, rows, metric, accent }: RegionTableProps) {
  const total = rows.reduce((s, r) => s + (metric === 'bags' ? r.bags : r.count), 0)
  const totalMt = Math.round(rows.reduce((s, r) => s + r.mt, 0) * 10) / 10
  return (
    <View style={styles.regionPanel}>
      <Text style={[styles.rHeadCell, { color: accent, marginBottom: 4 }]}>{title}</Text>
      <View style={styles.regionHead}>
        <Text style={[styles.rHeadCell, { flex: 1 }]}>Region</Text>
        {metric === 'bags' && <Text style={[styles.rHeadCell, { width: 50, textAlign: 'right' }]}>Bags</Text>}
        <Text style={[styles.rHeadCell, { width: 44, textAlign: 'right' }]}>MT</Text>
        <Text style={[styles.rHeadCell, { width: 36, textAlign: 'right' }]}>%</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.regionRow}><Text style={[styles.rCell, { color: '#888' }]}>None</Text></View>
      ) : rows.map(r => (
        <View key={r.region} style={styles.regionRow}>
          <Text style={[styles.rCell, { flex: 1 }]}>{r.count} - {r.region}</Text>
          {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right' }]}>{r.bags.toLocaleString('en-US')}</Text>}
          <Text style={[styles.rCell, { width: 44, textAlign: 'right' }]}>{r.mt.toFixed(1)}</Text>
          <Text style={[styles.rCell, { width: 36, textAlign: 'right' }]}>{r.pct}%</Text>
        </View>
      ))}
      <View style={styles.regionTotal}>
        <Text style={[styles.rCell, { flex: 1, fontWeight: 700 }]}>Total</Text>
        {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right', fontWeight: 700 }]}>{total.toLocaleString('en-US')}</Text>}
        <Text style={[styles.rCell, { width: 44, textAlign: 'right', fontWeight: 700 }]}>{totalMt.toFixed(1)}</Text>
        <Text style={[styles.rCell, { width: 36, textAlign: 'right', fontWeight: 700 }]}>100%</Text>
      </View>
    </View>
  )
}

interface Props {
  data: PerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

export function PerformanceReport({ data, wolthersLogoBase64, clientLogoBase64, flagBase64 }: Props) {
  const formatShortDate = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}` }
  const formatIssuedAt = (iso: string) => { const d = new Date(iso); return `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}` }
  const displayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
  const range = `${formatShortDate(data.period.start_date)} – ${formatShortDate(displayEnd.toISOString())}`
  const ytdDisplayEnd = new Date(new Date(data.ratings.window.end).getTime() - 86400000)
  const ytdRange = `${formatShortDate(data.ratings.window.start)} – ${formatShortDate(ytdDisplayEnd.toISOString())}`

  const Header = (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        {flagBase64 ? <Image src={flagBase64} style={styles.flagImage} /> : null}
      </View>
      <View style={styles.headerCenter}>
        {wolthersLogoBase64 ? (
          <Image src={wolthersLogoBase64} style={styles.wolthersLogo} />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: 700 }}>WOLTHERS ASSOCIATES</Text>
        )}
      </View>
      <View style={styles.headerRight}>
        {clientLogoBase64 ? (
          <Image src={clientLogoBase64} style={styles.clientLogo} />
        ) : (
          <Text style={{ fontSize: 12, fontWeight: 700 }}>{data.client.name}</Text>
        )}
        <Text style={styles.generationDate}>{formatIssuedAt(data.period.issued_at)}</Text>
      </View>
    </View>
  )

  const Footer = (sectionLabel: string) => (
    <View style={styles.pageFooter} fixed>
      <Text>Wolthers & Associates · Quality Control</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} · ${sectionLabel}`} />
      <Text>Generated {formatIssuedAt(data.period.issued_at)}</Text>
    </View>
  )

  const rateColor = (r: number) => (r === 0 ? GREEN : r <= 10 ? '#a9a454' : RED)
  const reasonRows = (b: PerformanceBucket) =>
    b.rejectionReasons.filter(r => r.category !== 'Other').map(r => ({ label: r.category, value: r.count }))

  const KpiBand = ({ b, kind }: { b: PerformanceBucket; kind: BucketKind }) => {
    // The trade counts contracts, not certificates: one contract carries several
    // containers (FCL), each with its own certificate. PSS has no container, so
    // it carries no FCL item.
    const items: { label: string; value: string | number; color?: string }[] = [
      { label: 'Contracts', value: b.totals.contracts },
    ]
    if (kind === 'SS') items.push({ label: 'FCL', value: b.totals.fcl })
    items.push({ label: 'Approved', value: b.totals.approved, color: GREEN })
    // Nothing was rejected: "0 REJECTED · 0% REJ. RATE" is two cells of zero.
    // Everything downstream (grid rows, red bars, legend, reasons block) drops
    // out on the same condition, which is what frees Page A for the Sankey.
    if (b.totals.rejected > 0) {
      items.push(
        { label: 'Rejected', value: b.totals.rejected, color: RED },
        { label: 'Rej. rate', value: `${b.totals.rejectionRate}%`, color: rateColor(b.totals.rejectionRate) },
      )
    }
    items.push(
      { label: 'Bags', value: b.totals.bagsApproved.toLocaleString('en-US') },
      { label: 'MT', value: b.totals.mtApproved.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    )
    return (
      <View style={styles.kpiBand}>
        {items.map((it, i) => (
          <React.Fragment key={it.label}>
            {i > 0 && <View style={styles.kpiDivider} />}
            <View style={styles.kpiItem}>
              <Text style={[styles.kpiValue, it.color ? { color: it.color } : {}]}>{it.value}</Text>
              <Text style={styles.kpiLabel}>{it.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    )
  }

  // Overall approved/rejected donut. It shows the whole-bucket status (not a
  // single side), and its centre already reads the rej. rate, so it needs no
  // heading — the redundant "Importer PSS · X" caption is dropped.
  const StatusDonut = ({ b }: { b: PerformanceBucket }) => (
    <View style={styles.donutSlot}>
      <DonutChart
        slices={[
          { label: 'Approved', value: b.totals.approved, color: GREEN },
          { label: 'Rejected', value: b.totals.rejected, color: RED },
        ]}
        size={100}
        centerValue={`${b.totals.rejectionRate}%`}
        centerLabel="REJ. RATE"
      />
    </View>
  )

  // Single company on both sides: a chart names nobody, so show the actual
  // counterparties (Shipper / Seller / Importer / Roaster) for the period.
  const IdentityCard = ({ b, kind }: { b: PerformanceBucket; kind: BucketKind }) => {
    const shipper = b.byExporter[0]?.name ?? distinctName(b.rows, r => r.exporter_name)
    const importer = b.byImporter[0]?.name ?? distinctName(b.rows, r => r.importer_name)
    const seller = distinctName(b.rows, r => r.seller_name)
    const roaster = distinctName(b.rows, r => r.roaster_name)
    const parties: Array<[string, string]> = [
      ['Shipper', shipper || '—'],
      ['Seller', seller],
      ['Importer', importer || '—'],
    ]
    if (roaster !== '—' && roaster.toLowerCase() !== 'unsold') parties.push(['Roaster', roaster])

    const stats: Array<[string, string, string?]> = [
      ['Contracts', String(b.totals.contracts)],
      ['Approved', String(b.totals.approved), GREEN],
      ['Rejected', String(b.totals.rejected), b.totals.rejected > 0 ? RED : '#222'],
      ['Bags', b.totals.bagsApproved.toLocaleString('en-US')],
      ['MT', b.totals.mtApproved.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })],
    ]
    if (kind === 'SS') stats.splice(1, 0, ['FCL', String(b.totals.fcl)])

    return (
      <View style={styles.identityCard} wrap={false}>
        <Text style={styles.sectionLabel}>{kind === 'PSS' ? 'Pre-Shipment Sample' : 'Shipment Sample'}</Text>
        <View style={styles.identityCols}>
          <View style={{ flex: 1 }}>
            {parties.map(([label, val]) => (
              <View key={label} style={styles.idRow}>
                <Text style={styles.idLabel}>{label}</Text>
                <Text style={styles.idValue}>{val}</Text>
              </View>
            ))}
          </View>
          <View style={{ width: 210 }}>
            {stats.map(([label, val, color]) => (
              <View key={label} style={styles.idRow}>
                <Text style={styles.idLabel}>{label}</Text>
                <Text style={[styles.idValue, color ? { color } : {}]}>{val}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  }

  // Full-width rejection breakdown below the chart row. The head doubles as the
  // overview label and the "out of X certs" denominator; a compact pill row
  // shows how many certificates were rejected for each reason (categorized
  // compliance violations); the two columns dig into the specific defects
  // behind those rejections (top-5 green defects | top-5 cupping faults/taints).
  // Kept tight so the whole block fits on Page A beneath the charts.
  const ReasonsSection = ({ b }: { b: PerformanceBucket }) => {
    if (b.totals.rejected <= 0) return null
    const overview = reasonRows(b)              // certs rejected per reason
    const green = (b.greenDefects ?? []).slice(0, 5)
    const cupping = (b.cuppingDefects ?? []).slice(0, 5)
    const hasDetail = green.length > 0 || cupping.length > 0
    const rejN = b.totals.rejected
    const certWord = rejN === 1 ? 'certificate' : 'certificates'

    return (
      <View style={styles.panel} wrap={false}>
        {/* Head = overview label + the "out of X certs" denominator. */}
        <View style={styles.reasonsHead}>
          <Text style={styles.sectionLabel}>Rejection reasons</Text>
          <Text style={styles.reasonsCount}>{rejN} of {b.totals.evaluated} {certWord} rejected</Text>
        </View>

        {/* Overview: how many certificates were rejected for each reason. */}
        {overview.length > 0 && (
          <View style={styles.chipRow}>
            {overview.slice(0, 8).map(r => (
              <View key={r.label} style={styles.chip}>
                <Text style={styles.chipLabel}>{r.label}</Text>
                <Text style={styles.chipCount}>{r.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Dig-in: the specific defects behind those rejections. */}
        {hasDetail && (
          <View style={styles.reasonsCols}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Green defects · top 5 across {rejN} {certWord}</Text>
              {green.length > 0 ? (
                <HorizontalBarChart
                  rows={green.map(d => ({
                    label: d.name,
                    value: d.count,
                    // Avg is per REJECTED CERTIFICATE in the bucket, not per
                    // certificate that happened to show this defect — so the
                    // column reads as the average burden across the rejected
                    // set and the five rows stay comparable to each other.
                    stats: [
                      Math.round(d.count / Math.max(rejN, 1)).toLocaleString('en-US'),
                      d.max.toLocaleString('en-US'),
                    ],
                  }))}
                  labelWidth={122} trackWidth={104} limit={5} chartColor={RED}
                  statHeaders={['Total', 'Avg', 'Max']} statWidth={34}
                />
              ) : (
                <Text style={styles.noneText}>None recorded.</Text>
              )}
              {/* The bars above are raw bean tallies; this is the GRADED count
                  (primary + secondary) a spec is written against, which is the
                  figure that says how far past the limit these lots ran. */}
              {b.defectLoad && (
                <Text style={styles.loadLine}>
                  Defect count per certificate: {b.defectLoad.avg} avg · {b.defectLoad.max} max
                  {b.defectLoad.graded < rejN ? `  (${b.defectLoad.graded} of ${rejN} graded)` : ''}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Cupping faults / taints · top 5</Text>
              {cupping.length > 0 ? (
                <HorizontalBarChart
                  rows={cupping.map(d => ({ label: `${d.name} (${d.kind})`, value: d.count }))}
                  labelWidth={150} trackWidth={190} limit={5} chartColor={RED}
                />
              ) : (
                <Text style={styles.noneText}>None recorded.</Text>
              )}
            </View>
          </View>
        )}

        {overview.length === 0 && !hasDetail && (
          <Text style={styles.noneText}>No detailed rejection reasons recorded.</Text>
        )}
      </View>
    )
  }

  // A clean bucket has no reasons block and a three-row chart grid, which
  // leaves Page A with roughly the height of a compact flow. Page B then skips
  // it — the predicate is shared so the two can never disagree.
  const sankeyOnChartsPage = (b: PerformanceBucket) =>
    b.totals.rejected === 0 && !!b.showSankey && !!b.sankey

  const SankeyPanel = ({ b }: { b: PerformanceBucket }) => (
    <View style={styles.panel} wrap={false}>
      <Text style={styles.sectionLabel}>Supply chain flow</Text>
      <SankeyChart layout={b.sankey!} columnLabels={b.sankeyColumns} />
    </View>
  )

  // Page A: KPI band + adaptive chart row + full-width rejection reasons.
  const ChartsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => {
    // A seller axis that's just the shipper axis wearing a different label
    // (every row's seller falls back to its shipper) prints a byte-identical
    // clone of the Exporter chart. Collapse it to the status donut instead —
    // the same predicate the appendix table already uses to hide its Seller
    // column (shouldShowSeller).
    const sellerAxis = shouldShowSeller(b.rows) ? b.bySeller.length : 1
    const layout = chartRowLayout(sellerAxis, b.byExporter.length)
    if (layout.mode === 'identity') {
      return (
        <>
          <KpiBand b={b} kind={kind} />
          <IdentityCard b={b} kind={kind} />
          <ReasonsSection b={b} />
          {sankeyOnChartsPage(b) && <SankeyPanel b={b} />}
        </>
      )
    }
    const bothBars = layout.seller === 'bars' && layout.exporter === 'bars'
    const barWidth = bothBars ? 360 : 470
    // No rejections -> no red bar, no Rejection rate / Rejected rows, no
    // legend. Shorter plot too, because the flow is joining this page.
    const clean = b.totals.rejected === 0
    // 92 on the rejected path: the reasons block below it carries a chip row,
    // five defect bars AND the graded-load line, and Page A has no slack left.
    // The grid under the bars carries the exact numbers, so a shorter plot
    // costs comparison, not information.
    const barHeight = clean ? 100 : 92
    return (
      <>
        <KpiBand b={b} kind={kind} />
        <View style={styles.panel} wrap={false}>
          <View style={styles.chartsRow}>
            {layout.seller === 'donut' && <StatusDonut b={b} />}
            {layout.seller === 'bars' && (
              <View style={styles.chartFlex}>
                <Text style={styles.chartColTitle}>Seller {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.bySeller, metric)} metric={metric} width={barWidth} height={barHeight} hideRejected={clean} />
              </View>
            )}
            {layout.exporter === 'donut' ? (
              <StatusDonut b={b} />
            ) : (
              <View style={styles.chartFlex}>
                <Text style={styles.chartColTitle}>Exporter {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.byExporter, metric)} metric={metric} width={barWidth} height={barHeight} hideRejected={clean} />
              </View>
            )}
          </View>
        </View>
        <ReasonsSection b={b} />
        {sankeyOnChartsPage(b) && <SankeyPanel b={b} />}
      </>
    )
  }

  // Page B: region tables, the bucket's own supply-chain flow, the year-to-date
  // supplier rating, then the all-certs appendix.
  const CertsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => {
    // Hide the region breakdown entirely when no cert carries a real region
    // (everything would collapse to a single "Unspecified" row).
    const hasRegions = [...b.approvedByRegion, ...b.rejectedByRegion].some(r => r.region !== 'Unspecified')
    return (
    <>
      {hasRegions && (
        <View style={styles.twoCol}>
          <RegionTable title="Approved certificates" rows={b.approvedByRegion} metric={metric} accent={GREEN} />
          <RegionTable title="Rejected certificates" rows={b.rejectedByRegion} metric={metric} accent={RED} />
        </View>
      )}
      {b.showSankey && b.sankey && !sankeyOnChartsPage(b) && <SankeyPanel b={b} />}
      <SupplierRatingTables
        shippers={data.ratings.shippers}
        sellers={data.ratings.sellers}
        windowLabel={ytdRange}
      />
      <CertAppendixTable
        rows={sortAppendixRows(b.rows)}
        totals={{
          approved: { certificate_count: b.totals.approved, bag_count: b.totals.bagsApproved, mt: b.totals.mtApproved },
          rejected: { certificate_count: b.totals.rejected, bag_count: b.totals.bagsRejected, mt: b.totals.mtRejected },
        }}
        hideRoasterCol={data.client.is_roaster}
        hideContainerCol={kind === 'PSS'}
        hideIcoCol={kind === 'PSS'}
        hideImporterCol={b.byImporter.length <= 1}
        hideSellerCol={!shouldShowSeller(b.rows)}
        emptyMessage={`No ${kind} certificates issued in this period.`}
      />
    </>
    )
  }

  const BucketPages = ({ b, kind }: { b: PerformanceBucket; kind: BucketKind }) => {
    const metric: 'count' | 'bags' = kind === 'SS' ? 'bags' : 'count'
    const title = kind === 'PSS' ? 'Pre-Shipment Samples' : 'Shipment Samples'
    return (
      <>
        <Page size="A4" orientation="landscape" style={styles.page}>
          {Header}
          <Text style={styles.titleBar}>{title} · {range}</Text>
          <ChartsPage b={b} metric={metric} kind={kind} />
          {Footer(`${title}`)}
        </Page>
        <Page size="A4" orientation="landscape" style={styles.page}>
          {Header}
          <Text style={styles.titleBar}>{title} · Certificates · {range}</Text>
          <CertsPage b={b} metric={metric} kind={kind} />
          {Footer(`${title} · Certificates`)}
        </Page>
      </>
    )
  }

  return (
    <Document>
      {data.pss && <BucketPages b={data.pss} kind="PSS" />}
      {data.ss && <BucketPages b={data.ss} kind="SS" />}
    </Document>
  )
}
