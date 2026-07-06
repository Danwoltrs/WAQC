/**
 * Unified performance report — A4 landscape. Renders a two-page pair per
 * requested bucket (PSS first, then SS):
 *   Page A: KPI band + charts. Adaptive: when a side (importer/exporter)
 *           has exactly one company it collapses to a compact donut and
 *           Rejection Reasons joins the row 3-up. Chart panels never wrap.
 *   Page B: approved/rejected by-region tables, conditional SS Sankey,
 *           and the all-certs appendix (Status + Bags + MT columns).
 * Powers the SS, PSS and SS+PSS reports.
 *
 * Inter font is registered globally by certificate-styles.ts.
 */
import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { PerformanceReportData, PerformanceBucket, RegionRow } from '@/lib/reports/performance-data'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { DonutChart } from '@/components/pdf/charts/donut-chart'
import { VerticalGroupedBarChart, type GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
import { CertAppendixTable } from './cert-appendix-table'

const GREEN = '#556b2f'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'

export type BucketKind = 'PSS' | 'SS'

export interface ChartRowLayout {
  importer: 'donut' | 'bars' | 'none'
  exporter: 'donut' | 'bars'
  reasonsInRow: boolean
}

/**
 * Decide the Page-A chart row shape. A side with exactly one company is a
 * redundant single bar pair → compact donut. When BOTH sides are single the
 * two donuts would be identical, so only one combined donut renders.
 */
export function chartRowLayout(importerCount: number, exporterCount: number): ChartRowLayout {
  const importerDonut = importerCount === 1
  const exporterDonut = exporterCount === 1
  if (importerDonut && exporterDonut) {
    return { importer: 'none', exporter: 'donut', reasonsInRow: true }
  }
  return {
    importer: importerDonut ? 'donut' : 'bars',
    exporter: exporterDonut ? 'donut' : 'bars',
    reasonsInRow: importerDonut || exporterDonut,
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
    fontWeight: 700, fontSize: 10, marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  kpiBand: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F2',
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 12,
  },
  kpiItem: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  kpiValue: { fontSize: 13, fontWeight: 700, color: '#222' },
  kpiLabel: { fontSize: 7.5, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3 },
  kpiDivider: { width: 1, height: 16, backgroundColor: '#D9D9D6' },
  pageFooter: {
    position: 'absolute', bottom: 12, left: 24, right: 24,
    flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#999',
  },
  panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 12, marginBottom: 12 },
  chartsRow: { flexDirection: 'row', gap: 16 },
  chartFlex: { flex: 1 },
  donutSlot: { width: 150, alignItems: 'center' },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  regionPanel: { flex: 1, borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 10 },
  regionHead: { flexDirection: 'row', backgroundColor: '#F4F4F2', paddingVertical: 4, paddingHorizontal: 6 },
  regionRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  regionTotal: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#F4F4F2' },
  rCell: { fontSize: 8, color: '#222' },
  rHeadCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase' },
})

function metricCats(groups: PerformanceBucket['byImporter'], metric: 'count' | 'bags'): GroupedBarCategory[] {
  return groups.slice(0, 6).map(g => ({
    label: g.name,
    approved: metric === 'bags' ? g.approvedBags : g.approvedCount,
    rejected: metric === 'bags' ? g.rejectedBags : g.rejectedCount,
    rejectionRate: g.rejectionRate,
  }))
}

interface RegionTableProps { title: string; rows: RegionRow[]; metric: 'count' | 'bags'; accent: string }
function RegionTable({ title, rows, metric, accent }: RegionTableProps) {
  const total = rows.reduce((s, r) => s + (metric === 'bags' ? r.bags : r.count), 0)
  return (
    <View style={styles.regionPanel}>
      <Text style={[styles.rHeadCell, { color: accent, marginBottom: 4 }]}>{title}</Text>
      <View style={styles.regionHead}>
        <Text style={[styles.rHeadCell, { flex: 1 }]}>Region</Text>
        {metric === 'bags' && <Text style={[styles.rHeadCell, { width: 50, textAlign: 'right' }]}>Bags</Text>}
        <Text style={[styles.rHeadCell, { width: 36, textAlign: 'right' }]}>%</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.regionRow}><Text style={[styles.rCell, { color: '#888' }]}>None</Text></View>
      ) : rows.map(r => (
        <View key={r.region} style={styles.regionRow}>
          <Text style={[styles.rCell, { flex: 1 }]}>{r.count} - {r.region}</Text>
          {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right' }]}>{r.bags.toLocaleString('en-US')}</Text>}
          <Text style={[styles.rCell, { width: 36, textAlign: 'right' }]}>{r.pct}%</Text>
        </View>
      ))}
      <View style={styles.regionTotal}>
        <Text style={[styles.rCell, { flex: 1, fontWeight: 700 }]}>Total</Text>
        {metric === 'bags' && <Text style={[styles.rCell, { width: 50, textAlign: 'right', fontWeight: 700 }]}>{total.toLocaleString('en-US')}</Text>}
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
    const items: { label: string; value: string | number; color?: string }[] = [
      { label: 'Certs', value: b.totals.evaluated },
      { label: 'Approved', value: b.totals.approved, color: GREEN },
      { label: 'Rejected', value: b.totals.rejected, color: b.totals.rejected > 0 ? RED : '#222' },
      { label: 'Rej. rate', value: `${b.totals.rejectionRate}%`, color: rateColor(b.totals.rejectionRate) },
    ]
    if (kind === 'SS') {
      items.push({ label: 'Bags', value: b.totals.bagsApproved.toLocaleString('en-US') })
      items.push({ label: 'MT', value: b.totals.mtApproved.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    }
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

  const StatusDonut = ({ b, title }: { b: PerformanceBucket; title: string }) => (
    <View style={styles.donutSlot}>
      <Text style={styles.sectionLabel}>{title}</Text>
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

  // Page A: KPI band + adaptive chart row. Panels never wrap across pages.
  const ChartsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => {
    const layout = chartRowLayout(b.byImporter.length, b.byExporter.length)
    const barWidth = layout.reasonsInRow ? 330 : 360
    return (
      <>
        <KpiBand b={b} kind={kind} />
        <View style={styles.panel} wrap={false}>
          <View style={styles.chartsRow}>
            {layout.importer === 'donut' && (
              <StatusDonut b={b} title={`Importer ${kind} · ${b.byImporter[0]?.name ?? ''}`} />
            )}
            {layout.importer === 'bars' && (
              <View style={styles.chartFlex}>
                <Text style={styles.sectionLabel}>Importer {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.byImporter, metric)} metric={metric} width={barWidth} />
              </View>
            )}
            {layout.exporter === 'donut' ? (
              <StatusDonut
                b={b}
                title={layout.importer === 'none' ? `Total ${kind}` : `Exporter ${kind} · ${b.byExporter[0]?.name ?? ''}`}
              />
            ) : (
              <View style={styles.chartFlex}>
                <Text style={styles.sectionLabel}>Exporter {kind}</Text>
                <VerticalGroupedBarChart categories={metricCats(b.byExporter, metric)} metric={metric} width={barWidth} />
              </View>
            )}
            {layout.reasonsInRow && reasonRows(b).length > 0 && (
              <View style={styles.chartFlex}>
                <Text style={styles.sectionLabel}>Rejection reasons</Text>
                <HorizontalBarChart rows={reasonRows(b)} labelWidth={90} trackWidth={130} limit={6} chartColor={RED} />
              </View>
            )}
          </View>
        </View>
        {!layout.reasonsInRow && reasonRows(b).length > 0 && (
          <View style={styles.panel} wrap={false}>
            <Text style={styles.sectionLabel}>Rejection reasons</Text>
            <HorizontalBarChart rows={reasonRows(b)} labelWidth={140} trackWidth={420} limit={10} chartColor={RED} />
          </View>
        )}
      </>
    )
  }

  // Page B: region tables (+ SS Sankey) + all-certs appendix.
  const CertsPage = ({ b, metric, kind }: { b: PerformanceBucket; metric: 'count' | 'bags'; kind: BucketKind }) => (
    <>
      <View style={styles.twoCol}>
        <RegionTable title="Approved certificates" rows={b.approvedByRegion} metric={metric} accent={GREEN} />
        <RegionTable title="Rejected certificates" rows={b.rejectedByRegion} metric={metric} accent={RED} />
      </View>
      {kind === 'SS' && data.showSankey && data.sankey && (
        <View style={styles.panel} wrap={false}>
          <Text style={styles.sectionLabel}>Supply chain flow</Text>
          <SankeyChart layout={data.sankey} columnLabels={data.sankeyColumns} />
        </View>
      )}
      <CertAppendixTable
        rows={b.rows}
        totals={{ certificate_count: b.totals.approved, bag_count: b.totals.bagsApproved, mt: b.totals.mtApproved }}
        hideRoasterCol={data.client.is_roaster}
        hideContainerCol={kind === 'PSS'}
        emptyMessage={`No ${kind} certificates issued in this period.`}
      />
    </>
  )

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
