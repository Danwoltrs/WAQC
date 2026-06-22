/**
 * Bi-Weekly Performance Report — A4 landscape, 3 pages:
 *   1. Pre-Shipment Samples (PSS) — KPI strip, Importer + Exporter bars (counts),
 *      rejection reasons, approved/rejected by region (counts).
 *   2. Shipment Samples (SS) — KPI strip (+ bags), Importer + Exporter bars (bags),
 *      conditional supply-chain Sankey, rejection reasons, by region (bags).
 *   3. SS certificate appendix (approved) — shared with the Weekly report.
 *
 * Inter font is registered globally by certificate-styles.ts.
 */
import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { BiweeklyPerformanceReportData, BucketAggregate, RegionRow } from '@/lib/reports/biweekly-data'
import { KpiCard } from '@/components/pdf/charts/kpi-card'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { VerticalGroupedBarChart, type GroupedBarCategory } from '@/components/pdf/charts/vertical-grouped-bar-chart'
import { SSCertAppendixTable } from './ss-cert-appendix-table'

const GREEN = '#556b2f'
const GRAY_BORDER = '#e3e3e3'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  // --- Header ---
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 50,
  },
  headerLeft: { width: '20%', justifyContent: 'center', alignItems: 'flex-start' },
  headerCenter: { width: '60%', justifyContent: 'center', alignItems: 'center' },
  headerRight: { width: '20%', justifyContent: 'center', alignItems: 'flex-end' },
  flagImage: { width: 56, height: 38, objectFit: 'contain' },
  wolthersLogo: { width: 130, height: 26, objectFit: 'contain' },
  clientLogo: { maxWidth: 100, maxHeight: 36, objectFit: 'contain' },
  generationDate: { fontSize: 8, color: '#666', marginTop: 4 },

  titleBar: {
    backgroundColor: GREEN,
    color: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontWeight: 700,
    fontSize: 10,
    marginBottom: 12,
  },

  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#222',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },

  kpiStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },

  pageFooter: {
    position: 'absolute',
    bottom: 12,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
  },

  // --- Bi-weekly panels + region tables ---
  panel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 12, marginBottom: 12 },
  twoCol: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  regionPanel: { flex: 1, borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 10, padding: 10 },
  regionHead: { flexDirection: 'row', backgroundColor: '#F4F4F2', paddingVertical: 4, paddingHorizontal: 6 },
  regionRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  regionTotal: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#F4F4F2' },
  rCell: { fontSize: 8, color: '#222' },
  rHeadCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase' },
})

// Map GroupPerf → chart categories for the chosen metric.
function metricCats(groups: BucketAggregate['byImporter'], metric: 'count' | 'bags'): GroupedBarCategory[] {
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
  data: BiweeklyPerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

export function BiweeklyPerformanceReport({ data, wolthersLogoBase64, clientLogoBase64, flagBase64 }: Props) {
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

  const Footer = (pageLabel: string) => (
    <View style={styles.pageFooter} fixed>
      <Text>Wolthers & Associates · Quality Control</Text>
      <Text>{pageLabel}</Text>
      <Text>Generated {formatIssuedAt(data.period.issued_at)}</Text>
    </View>
  )

  const rateColor = (r: number) => (r === 0 ? GREEN : r <= 10 ? '#a9a454' : '#ef4444')
  const reasonRows = (b: BucketAggregate) => b.rejectionReasons.filter(r => r.category !== 'Other').map(r => ({ label: r.category, value: r.count }))

  const Bucket = ({ b, metric, kind }: { b: BucketAggregate; metric: 'count' | 'bags'; kind: 'PSS' | 'SS' }) => (
    <>
      <View style={styles.kpiStrip}>
        <KpiCard label="Certificates" value={b.totals.evaluated} sublabel={`${b.totals.approved} approved · ${b.totals.rejected} rejected`} />
        <KpiCard label="Approved" value={b.totals.approved} />
        <KpiCard label="Rejected" value={b.totals.rejected} valueColor={b.totals.rejected > 0 ? '#ef4444' : GREEN} />
        <KpiCard label="Rejection rate" value={`${b.totals.rejectionRate}%`} valueColor={rateColor(b.totals.rejectionRate)} />
        {kind === 'SS' && <KpiCard label="Bags approved" value={b.totals.bagsApproved} sublabel="60 kg equivalent" />}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Importer {kind}</Text>
        <VerticalGroupedBarChart categories={metricCats(b.byImporter, metric)} metric={metric} />
      </View>
      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Exporter {kind}</Text>
        <VerticalGroupedBarChart categories={metricCats(b.byExporter, metric)} metric={metric} />
      </View>

      {reasonRows(b).length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Rejection reasons</Text>
          <HorizontalBarChart rows={reasonRows(b)} labelWidth={140} trackWidth={420} limit={10} chartColor="#ef4444" />
        </View>
      )}

      <View style={styles.twoCol}>
        <RegionTable title="Approved certificates" rows={b.approvedByRegion} metric={metric} accent={GREEN} />
        <RegionTable title="Rejected certificates" rows={b.rejectedByRegion} metric={metric} accent="#ef4444" />
      </View>
    </>
  )

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>Pre-Shipment Samples · {range}</Text>
        <Bucket b={data.pss} metric="count" kind="PSS" />
        {Footer('Page 1 of 3 · Pre-Shipment Samples')}
      </Page>

      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>Shipment Samples · {range}</Text>
        <Bucket b={data.ss} metric="bags" kind="SS" />
        {data.showSankey && (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Supply chain flow</Text>
            <SankeyChart layout={data.sankey} columnLabels={data.sankeyColumns} />
          </View>
        )}
        {Footer('Page 2 of 3 · Shipment Samples')}
      </Page>

      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>SS certificate appendix · {data.ss.totals.approved} approved</Text>
        <SSCertAppendixTable
          rows={data.ssApprovedRows}
          totals={{ certificate_count: data.ss.totals.approved, bag_count: data.ss.totals.bagsApproved }}
          hideRoasterCol={data.client.is_roaster}
        />
        {Footer('Page 3 of 3 · Appendix')}
      </Page>
    </Document>
  )
}
