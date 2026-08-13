/**
 * Annual Quality Performance Review — bespoke Scandinavian layout.
 * A4 portrait pages 1–11 + 13; page 12 (year Sankey) is A4 LANDSCAPE.
 * Reuses Inter (registered by certificate-styles) + the shared PDF charts.
 */
import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import type { GroupPerf } from '@/lib/reports/performance-data'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'

const OLIVE = '#556b2f'
const BEIGE = '#efe4d4'
const HAIR = '#e3e3e3'
const INK = '#1a1a1a'
const MUTED = '#6b6b6b'
const RED = '#ef4444'

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 11, color: INK, backgroundColor: '#FFFFFF', paddingVertical: 56, paddingHorizontal: 56 },
  cover: { fontFamily: 'Inter', backgroundColor: '#FFFFFF', padding: 56, height: '100%', justifyContent: 'space-between' },
  coverTitle: { fontSize: 30, fontWeight: 700, color: INK, marginBottom: 8 },
  coverYear: { fontSize: 44, fontWeight: 700, color: OLIVE },
  coverSub: { fontSize: 13, color: MUTED },
  rule: { height: 2, backgroundColor: OLIVE, width: 64, marginVertical: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 },
  sectionWash: { backgroundColor: BEIGE, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginBottom: 16 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 24 },
  heroCell: { width: '45%' },
  heroNum: { fontSize: 40, fontWeight: 700, color: OLIVE },
  heroCap: { fontSize: 11, color: MUTED, marginTop: 4 },
  table: { marginTop: 12 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 4 },
  trTotal: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: INK, paddingVertical: 5 },
  th: { fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  cellName: { flex: 3 },
  cellNum: { flex: 1, textAlign: 'right' },
  semibold: { fontWeight: 700 },
  footer: { position: 'absolute', bottom: 24, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 6 },
})

interface Props {
  data: AnnualPerformanceReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

function Footer({ year }: { year: number }) {
  return (
    <View style={s.footer} fixed>
      <Text>Wolthers — Annual Quality Performance Review {year}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// A reusable performance table: <name> | APP | REJ | TOTAL | MT APP | MT REJ | %APP | %REJ + TOTAL GERAL.
function PerfTable({
  rows,
  basisLabel,
  nameHeader = 'Exporter',
}: {
  rows: GroupPerf[]
  basisLabel: 'count' | 'bags'
  nameHeader?: string
}) {
  const val = (g: GroupPerf, kind: 'app' | 'rej' | 'tot') => {
    const app = basisLabel === 'bags' ? g.approvedBags : g.approvedCount
    const rej = basisLabel === 'bags' ? g.rejectedBags : g.rejectedCount
    return kind === 'app' ? app : kind === 'rej' ? rej : app + rej
  }
  const tot = rows.reduce(
    (a, g) => ({
      app: a.app + val(g, 'app'),
      rej: a.rej + val(g, 'rej'),
      mtApp: a.mtApp + g.approvedMt,
      mtRej: a.mtRej + g.rejectedMt,
    }),
    { app: 0, rej: 0, mtApp: 0, mtRej: 0 },
  )
  const grand = tot.app + tot.rej
  const p = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
  return (
    <View style={s.table}>
      <View style={s.tr}>
        <Text style={[s.th, s.cellName]}>{nameHeader}</Text>
        <Text style={[s.th, s.cellNum]}>APP</Text>
        <Text style={[s.th, s.cellNum]}>REJ</Text>
        <Text style={[s.th, s.cellNum]}>TOTAL</Text>
        <Text style={[s.th, s.cellNum]}>MT APP</Text>
        <Text style={[s.th, s.cellNum]}>MT REJ</Text>
        <Text style={[s.th, s.cellNum]}>%APP</Text>
        <Text style={[s.th, s.cellNum]}>%REJ</Text>
      </View>
      {rows.map((g) => {
        const a = val(g, 'app'), r = val(g, 'rej'), t = a + r
        return (
          <View style={s.tr} key={g.name}>
            <Text style={s.cellName}>{g.name}</Text>
            <Text style={s.cellNum}>{a}</Text>
            <Text style={s.cellNum}>{r}</Text>
            <Text style={s.cellNum}>{t}</Text>
            <Text style={s.cellNum}>{g.approvedMt.toFixed(1)}</Text>
            <Text style={s.cellNum}>{g.rejectedMt.toFixed(1)}</Text>
            <Text style={s.cellNum}>{p(a, t)}%</Text>
            <Text style={s.cellNum}>{p(r, t)}%</Text>
          </View>
        )
      })}
      <View style={s.trTotal}>
        <Text style={[s.cellName, s.semibold]}>TOTAL GERAL</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.app}</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.rej}</Text>
        <Text style={[s.cellNum, s.semibold]}>{grand}</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.mtApp.toFixed(1)}</Text>
        <Text style={[s.cellNum, s.semibold]}>{tot.mtRej.toFixed(1)}</Text>
        <Text style={[s.cellNum, s.semibold]}>{p(tot.app, grand)}%</Text>
        <Text style={[s.cellNum, s.semibold]}>{p(tot.rej, grand)}%</Text>
      </View>
    </View>
  )
}

// Compact ranked block: name + volume + MT + approval-rate trailing label.
function BreakdownBlock({ title, rows }: { title: string; rows: GroupPerf[] }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.th}>{title}</Text>
      {rows.map(g => {
        const total = g.approvedCount + g.rejectedCount
        const rate = total > 0 ? Math.round((g.approvedCount / total) * 100) : 0
        return (
          <View style={s.tr} key={g.name}>
            <Text style={s.cellName}>{g.name}</Text>
            <Text style={s.cellNum}>{g.approvedBags > 0 ? `${g.approvedBags.toLocaleString('en-US')} bags` : `${total}`}</Text>
            <Text style={s.cellNum}>{g.approvedMt.toFixed(1)} MT</Text>
            <Text style={[s.cellNum, { color: rate >= 90 ? OLIVE : rate >= 70 ? INK : RED }]}>{rate}%</Text>
          </View>
        )
      })}
    </View>
  )
}

export function AnnualPerformanceReport({ data, wolthersLogoBase64, clientLogoBase64, flagBase64 }: Props) {
  const { client, period, agg } = data
  const hero = agg.hero

  // Map rejection reason rows to the shape HorizontalBarChart expects.
  const pssReasonRows = agg.pss.rejectionReasons.map(r => ({ label: r.category, value: r.count }))
  const ssReasonRows = agg.ss.rejectionReasons.map(r => ({ label: r.category, value: r.count }))

  return (
    <Document>
      {/* 1 — Cover */}
      <Page size="A4" style={s.cover}>
        <View>
          {wolthersLogoBase64 ? <Image src={wolthersLogoBase64} style={{ width: 150, height: 30, objectFit: 'contain' }} /> : null}
        </View>
        <View>
          <Text style={s.coverSub}>{client.name}</Text>
          <Text style={s.coverTitle}>Annual Quality Performance Review</Text>
          <View style={s.rule} />
          <Text style={s.coverYear}>{period.year}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {clientLogoBase64 ? <Image src={clientLogoBase64} style={{ maxWidth: 120, maxHeight: 40, objectFit: 'contain' }} /> : <View />}
          {flagBase64 ? <Image src={flagBase64} style={{ width: 48, height: 32, objectFit: 'contain' }} /> : <View />}
        </View>
      </Page>

      {/* 2 — Year at a Glance */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>The Year at a Glance</Text>
        <View style={s.heroRow}>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.samplesEvaluated}</Text><Text style={s.heroCap}>Samples QC&apos;d</Text></View>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.overallApprovalRate}%</Text><Text style={s.heroCap}>Overall approval rate</Text></View>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.bagsCleared.toLocaleString('en-US')}</Text><Text style={s.heroCap}>Bags cleared (SS approved)</Text></View>
          <View style={s.heroCell}><Text style={s.heroNum}>{hero.rejections}</Text><Text style={s.heroCap}>Rejections ({hero.overallRejectionRate}%)</Text></View>
        </View>
        <Footer year={period.year} />
      </Page>

      {/* 3 — PSS performance (count) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Pre-Shipment (PSS) Performance · by sample</Text></View>
        <PerfTable rows={agg.pss.byExporter} basisLabel="count" nameHeader="Exporter" />
        <Footer year={period.year} />
      </Page>

      {/* 4 — SS performance (bags) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Shipment (SS) Performance · by bags</Text></View>
        <PerfTable rows={agg.ss.byExporter} basisLabel="bags" nameHeader="Exporter" />
        <Footer year={period.year} />
      </Page>

      {/* 5 — PSS seller performance (count) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Pre-Shipment (PSS) Seller Performance · by sample</Text></View>
        <PerfTable rows={agg.bySellerPss} basisLabel="count" nameHeader="Seller" />
        <Footer year={period.year} />
      </Page>

      {/* 6 — SS seller performance (bags) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Shipment (SS) Seller Performance · by bags</Text></View>
        <PerfTable rows={agg.bySellerSs} basisLabel="bags" nameHeader="Seller" />
        <Footer year={period.year} />
      </Page>

      {/* 7 — Top rejection reasons (PSS / SS) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Top Rejection Reasons</Text></View>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.th}>Pre-Shipment (PSS)</Text>
            {pssReasonRows.length > 0 ? (
              <HorizontalBarChart rows={pssReasonRows} labelWidth={130} trackWidth={180} chartColor={OLIVE} />
            ) : (
              <Text style={{ fontSize: 9, color: MUTED, marginTop: 8 }}>No rejections this year.</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.th}>Shipment (SS)</Text>
            {ssReasonRows.length > 0 ? (
              <HorizontalBarChart rows={ssReasonRows} labelWidth={130} trackWidth={180} chartColor={OLIVE} />
            ) : (
              <Text style={{ fontSize: 9, color: MUTED, marginTop: 8 }}>No rejections this year.</Text>
            )}
          </View>
        </View>
        <Footer year={period.year} />
      </Page>

      {/* 8 — Counterparty breakdowns */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Counterparty Breakdowns</Text></View>
        <BreakdownBlock title="By Importer" rows={agg.ss.byImporter} />
        <BreakdownBlock title="By Seller" rows={agg.bySellerSs} />
        <BreakdownBlock title="By Exporter / Shipper" rows={agg.ss.byExporter} />
        <Footer year={period.year} />
      </Page>

      {/* 9 — Origin */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Where the Coffee Came From</Text></View>
        <BreakdownBlock title="By Origin" rows={agg.byOrigin} />
        <Footer year={period.year} />
      </Page>

      {/* 10 — Assessed by lab (only when >1 lab) */}
      {agg.byLab.length > 1 ? (
        <Page size="A4" style={s.page}>
          <View style={s.sectionWash}><Text style={s.sectionTitle}>Assessed by Lab</Text></View>
          <BreakdownBlock title="By Laboratory" rows={agg.byLab} />
          <Footer year={period.year} />
        </Page>
      ) : null}

      {/* 11 — The year in motion (monthly) */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>The Year in Motion</Text></View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cellName]}>Month</Text>
            <Text style={[s.th, s.cellNum]}>Evaluated</Text>
            <Text style={[s.th, s.cellNum]}>Approved</Text>
            <Text style={[s.th, s.cellNum]}>%APP</Text>
            <Text style={[s.th, s.cellNum]}>Bags</Text>
          </View>
          {agg.monthly.map(m => (
            <View style={s.tr} key={m.month}>
              <Text style={s.cellName}>{m.label}</Text>
              <Text style={s.cellNum}>{m.evaluated}</Text>
              <Text style={s.cellNum}>{m.approved}</Text>
              <Text style={s.cellNum}>{m.approvalRate}%</Text>
              <Text style={s.cellNum}>{m.bagsApproved.toLocaleString('en-US')}</Text>
            </View>
          ))}
        </View>
        <Footer year={period.year} />
      </Page>

      {/* 12 — Year flow Sankey (LANDSCAPE) */}
      {agg.showSankey ? (
        <Page size="A4" orientation="landscape" style={s.page}>
          <View style={s.sectionWash}><Text style={s.sectionTitle}>Year Flow · {agg.sankeyColumns.join(' → ')}</Text></View>
          <SankeyChart layout={agg.sankey} columnLabels={agg.sankeyColumns} />
          <Footer year={period.year} />
        </Page>
      ) : null}

      {/* 13 — Methodology */}
      <Page size="A4" style={s.page}>
        <View style={s.sectionWash}><Text style={s.sectionTitle}>Methodology</Text></View>
        <Text style={{ fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
          This report covers all samples assessed for {client.name} between 1 January and 31 December {period.year}, across all
          Wolthers laboratories{agg.labsCovered.length ? ` (${agg.labsCovered.join(', ')})` : ''} and all origins
          {agg.originsCovered.length ? ` (${agg.originsCovered.join(', ')})` : ''}. Pre-shipment (PSS) figures are counted by
          sample; shipment (SS) figures are counted by 60-kg-equivalent bags. Approval and rejection rates are computed as a
          share of evaluated samples in each group. Seller performance tables use the same counting basis, evaluation window,
          and approval/rejection methodology as the exporter (shipper) tables — a seller and its shipper may differ, so
          quantities are not additive across the two views.
        </Text>
        <Footer year={period.year} />
      </Page>
    </Document>
  )
}
