/**
 * Unified performance report — A4 landscape. Renders a two-page pair per
 * requested bucket (PSS first, then SS):
 *   Page A: KPI band + Seller and Importer charts side by side, then the
 *           rejection reasons. Chart panels never wrap.
 *   Rejected certificates (only with rejections): every reason each
 *           rejected certificate failed, value against limit, by seller
 *           then shipper (rejection-overview-table.tsx).
 *   Page B: approved/rejected by-region tables (containers, bags, MT), the
 *           bucket's own supply-chain flow, sized to fit under them, the
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
import { sortAppendixRows, showRegionTables, type PerformanceReportData, type PerformanceBucket, type RegionRow } from '@/lib/reports/performance-data'
import { formatReportDay, lastReportDay, REPORT_TZ } from '@/lib/reports/periods'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { VerticalGroupedBarChart, type GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
import { CertAppendixTable, shouldShowSeller } from './cert-appendix-table'
import { SupplierRatingTables } from './supplier-rating-table'
import { RejectionOverviewTable } from './rejection-overview-table'
import { buildRejectionOverview } from '@/lib/reports/rejection-overview'

const GREEN = '#556b2f'
const RED = '#ef4444'

export type BucketKind = 'PSS' | 'SS'

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
  subLabel: { fontSize: 8.5, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  // NOTE: Inter is registered only in weights 400/600/700 (no italic), so
  // captions/placeholders must not use fontStyle:'italic' — react-pdf throws
  // "Could not resolve font" and aborts the whole render.
  noneText: { fontSize: 9, color: '#888' },
  loadLine: { fontSize: 8, color: '#555', marginTop: 3 },
  reasonsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  reasonsCount: { fontSize: 8, color: '#888' },
  reasonsCols: { flexDirection: 'row', gap: 20 },
  // Reasons table: one row per reason, each rejected certificate counted once
  // under its worst reason, so the rows add up to the rejections.
  reasonsTable: { width: 200 },
  reasonHead: { flexDirection: 'row', backgroundColor: '#F4F4F2', paddingVertical: 3, paddingHorizontal: 6 },
  reasonRow: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  reasonTotal: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, backgroundColor: '#F4F4F2' },
  reasonCount: { fontSize: 8.5, fontWeight: 700, color: RED, width: 34, textAlign: 'right' },
  reasonDetail: { color: '#777' },
  multiReason: { fontSize: 8, color: '#555', marginTop: 4 },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  // No box: the tables sit on the page like the rest of Page B.
  regionPanel: { flex: 1 },
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

interface RegionTableProps { title: string; rows: RegionRow[]; metric: 'count' | 'bags'; accent: string }
function RegionTable({ title, rows, metric, accent }: RegionTableProps) {
  // Both carry containers (named on SS, estimated from quantity on PSS);
  // only shipment samples carry a Bags column.
  const ss = metric === 'bags'
  const total = rows.reduce((s, r) => s + (ss ? r.bags : r.count), 0)
  const totalContainers = rows.reduce((s, r) => s + r.containers, 0)
  const totalMt = Math.round(rows.reduce((s, r) => s + r.mt, 0) * 10) / 10
  const num = (w: number, bold = false) => [styles.rCell, { width: w, textAlign: 'right' as const }, bold ? { fontWeight: 700 } : {}]
  const head = (w: number) => [styles.rHeadCell, { width: w, textAlign: 'right' as const }]
  return (
    <View style={styles.regionPanel}>
      <Text style={[styles.rHeadCell, { color: accent, marginBottom: 4 }]}>{title}</Text>
      <View style={styles.regionHead}>
        <Text style={[styles.rHeadCell, { flex: 1 }]}>Region</Text>
        <Text style={head(58)}>Containers</Text>
        {ss && <Text style={head(50)}>Bags</Text>}
        <Text style={head(44)}>MT</Text>
        <Text style={head(36)}>%</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.regionRow}><Text style={[styles.rCell, { color: '#888' }]}>None</Text></View>
      ) : rows.map(r => (
        <View key={r.region} style={styles.regionRow}>
          <Text style={[styles.rCell, { flex: 1 }]}>{r.count} - {r.region}</Text>
          <Text style={num(58)}>{r.containers}</Text>
          {ss && <Text style={num(50)}>{r.bags.toLocaleString('en-US')}</Text>}
          <Text style={num(44)}>{r.mt.toFixed(1)}</Text>
          <Text style={num(36)}>{r.pct}%</Text>
        </View>
      ))}
      <View style={styles.regionTotal}>
        <Text style={[styles.rCell, { flex: 1, fontWeight: 700 }]}>Total</Text>
        <Text style={num(58, true)}>{totalContainers}</Text>
        {ss && <Text style={num(50, true)}>{total.toLocaleString('en-US')}</Text>}
        <Text style={num(44, true)}>{totalMt.toFixed(1)}</Text>
        <Text style={num(36, true)}>100%</Text>
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
  // Every date reads as a São Paulo day, whatever clock renders the PDF.
  const formatIssuedAt = (iso: string) => `${formatReportDay(iso)} ${new Date(iso).toLocaleDateString('en-US', { timeZone: REPORT_TZ, year: 'numeric' })}`
  const range = `${formatReportDay(data.period.start_date)} – ${formatReportDay(lastReportDay(data.period.end_date))}`
  const ytdRange = `${formatReportDay(data.ratings.window.start)} – ${formatReportDay(lastReportDay(data.ratings.window.end))}`

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

  // Full-width rejection breakdown below the chart row, three columns:
  // the reasons table (each rejected certificate counted ONCE, under its worst
  // reason in Wolthers' severity order, so the rows add up to the rejections),
  // then the specific defects behind them (top-5 green defects | top-5 cupping
  // faults/taints). Kept tight so the whole block fits on Page A.
  const ReasonsSection = ({ b }: { b: PerformanceBucket }) => {
    if (b.totals.rejected <= 0) return null
    const reasons = b.rejectionReasons
    const green = (b.greenDefects ?? []).slice(0, 5)
    const cupping = (b.cuppingDefects ?? []).slice(0, 5)
    const rejN = b.totals.rejected
    const certWord = rejN === 1 ? 'certificate' : 'certificates'

    return (
      <View style={styles.panel} wrap={false}>
        {/* Head = overview label + the "out of X certs" denominator. */}
        <View style={styles.reasonsHead}>
          <Text style={styles.sectionLabel}>Rejection reasons</Text>
          <Text style={styles.reasonsCount}>{rejN} of {b.totals.evaluated} {certWord} rejected</Text>
        </View>

        <View style={styles.reasonsCols}>
          <View style={styles.reasonsTable}>
            <Text style={styles.subLabel}>Worst reason per certificate</Text>
            <View style={styles.reasonHead}>
              <Text style={[styles.rHeadCell, { flex: 1 }]}>Reason</Text>
              <Text style={[styles.rHeadCell, { width: 34, textAlign: 'right' }]}>Certs</Text>
            </View>
            {reasons.map(r => (
              <View key={r.category} style={styles.reasonRow}>
                <Text style={[styles.rCell, { flex: 1 }]}>
                  {r.category}
                  {r.detail ? <Text style={styles.reasonDetail}> ({r.detail})</Text> : null}
                </Text>
                <Text style={styles.reasonCount}>{r.count}</Text>
              </View>
            ))}
            <View style={styles.reasonTotal}>
              <Text style={[styles.rCell, { flex: 1, fontWeight: 700 }]}>Total rejected</Text>
              <Text style={[styles.rCell, { width: 34, textAlign: 'right', fontWeight: 700 }]}>{rejN}</Text>
            </View>
            <Text style={styles.multiReason}>Rejected for more than one reason: {b.rejectedMultiReason}</Text>
          </View>

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
                labelWidth={100} trackWidth={72} limit={5} chartColor={RED}
                statHeaders={['Total', 'Avg', 'Max']} statWidth={32}
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
                labelWidth={130} trackWidth={84} limit={5} chartColor={RED}
              />
            ) : (
              <Text style={styles.noneText}>None recorded.</Text>
            )}
          </View>
        </View>
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

  // Page A: KPI band + Seller and Importer charts + full-width rejection
  // reasons. Both charts always render, even for a single company: the grid
  // under the bars carries that company's numbers. The shipper has no chart of
  // its own (it mostly repeated the seller); it is in the appendix and flow.
  const ChartsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => {
    const barWidth = 360
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
            <View style={styles.chartFlex}>
              <Text style={styles.chartColTitle}>Seller {kind}</Text>
              <VerticalGroupedBarChart categories={metricCats(b.bySeller, metric)} metric={metric} width={barWidth} height={barHeight} hideRejected={clean} />
            </View>
            <View style={styles.chartFlex}>
              <Text style={styles.chartColTitle}>Importer {kind}</Text>
              <VerticalGroupedBarChart categories={metricCats(b.byImporter, metric)} metric={metric} width={barWidth} height={barHeight} hideRejected={clean} />
            </View>
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
    // (everything would collapse to a single "Unspecified" row). The flow's
    // height was sized from the same predicate (performance-data.ts).
    const hasRegions = showRegionTables(b)
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
    const overview = buildRejectionOverview(b.rows)
    return (
      <>
        <Page size="A4" orientation="landscape" style={styles.page}>
          {Header}
          <Text style={styles.titleBar}>{title} · {range}</Text>
          <ChartsPage b={b} metric={metric} kind={kind} />
          {Footer(`${title}`)}
        </Page>
        {/* Every reason each rejected certificate failed, by seller → shipper.
            Only when the period has rejections. */}
        {overview && (
          <Page size="A4" orientation="landscape" style={styles.page}>
            {Header}
            <Text style={styles.titleBar}>{title} · Rejected certificates · {range}</Text>
            <RejectionOverviewTable overview={overview} evaluated={b.totals.evaluated} hideContainer={kind === 'PSS'} />
            {Footer(`${title} · Rejected certificates`)}
          </Page>
        )}
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
