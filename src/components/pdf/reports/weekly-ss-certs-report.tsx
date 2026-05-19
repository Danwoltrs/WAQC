/**
 * Weekly SS Certificates Report — redesigned (May 2026).
 *
 * Three-page A4 landscape PDF:
 *   1. Executive Summary — KPI strip + supply-chain Sankey + sample mix donut
 *   2. Quality breakdown — top rejection reasons + supplier scorecard
 *   3. Certificate appendix — tight per-cert table (approved only)
 *
 * The Sankey is pre-laid-out in `src/lib/report-data.ts` and rendered
 * by the shared SankeyChart component. Mini chart primitives
 * (KpiCard, HorizontalBarChart, DonutChart) live alongside.
 *
 * Inter font is registered globally by certificate-styles.ts — importing
 * it for the side-effect ensures Font.register runs before any rendering.
 */

import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { WeeklySSCertReportData } from '@/lib/report-data'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { KpiCard } from '@/components/pdf/charts/kpi-card'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { DonutChart } from '@/components/pdf/charts/donut-chart'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

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

  // --- Period title bar ---
  titleBar: {
    backgroundColor: GREEN,
    color: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontWeight: 700,
    fontSize: 10,
    marginBottom: 12,
  },

  // --- Section caption ---
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#222',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },

  // --- KPI strip ---
  kpiStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },

  // --- Page 1 split ---
  page1Split: { flexDirection: 'row', gap: 12 },
  sankeyPanel: { width: '68%' },
  donutPanel: {
    width: '32%',
    backgroundColor: '#F9F9FA',
    borderRadius: 10,
    padding: 12,
  },

  // --- Page 2 split ---
  page2Split: { flexDirection: 'row', gap: 12 },
  page2Col: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  panel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: GRAY_BORDER,
    borderRadius: 10,
    padding: 12,
  },

  // --- Scorecard table ---
  scoreTable: { width: '100%' },
  scoreHeader: {
    flexDirection: 'row',
    backgroundColor: '#F4F4F2',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
  },
  scoreHeaderCell: {
    fontSize: 7.5,
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  scoreRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
    alignItems: 'center',
  },
  scoreCell: { fontSize: 8.5, color: '#222' },
  miniBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#EEEEEE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniBar: { height: 6, borderRadius: 3 },

  // --- Cert appendix table ---
  table: { borderTopWidth: 1, borderTopColor: GRAY_BORDER },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: GREEN },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: '#FFFFFF',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
  },
  tableCell: {
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
    color: '#222',
  },
  totalRow: { flexDirection: 'row', backgroundColor: GREEN_DARK },
  totalCell: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 700,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRightWidth: 1,
    borderRightColor: GREEN_DARK,
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
})

const COLS = {
  approvalDate: '9%',
  certificateNumber: '11%',
  exporter: '12%',
  importer: '14%',
  importerContract: '13%',
  roasterDestination: '13%',
  container: '10%',
  icoMarks: '10%',
  bags: '8%',
}

interface WeeklySSCertsReportProps {
  data: WeeklySSCertReportData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

export function WeeklySSCertsReport({
  data,
  wolthersLogoBase64,
  clientLogoBase64,
  flagBase64,
}: WeeklySSCertsReportProps) {
  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
  }
  const formatShortDate = (iso: string) => {
    const d = new Date(iso)
    const month = d.toLocaleString('en-US', { month: 'short' })
    return `${month} ${String(d.getDate()).padStart(2, '0')}`
  }
  const formatIssuedAt = (iso: string) => {
    const d = new Date(iso)
    const month = d.toLocaleString('en-US', { month: 'short' })
    return `${month} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`
  }

  // End is exclusive in our query; display the last-included day.
  const displayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
  const periodLabel = `Weekly SS Certificates · ${formatShortDate(data.period.start_date)} – ${formatShortDate(displayEnd.toISOString())}`

  const approvalRate = data.totals.approval_rate
  const rejectionRate = data.totals.evaluated_count > 0
    ? 100 - approvalRate
    : 0

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

  return (
    <Document>
      {/* ============ Page 1 — Executive Summary ============ */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>{periodLabel}</Text>

        {/* KPI strip — five hero stats. Approval rate tinted by band. */}
        <View style={styles.kpiStrip}>
          <KpiCard
            label="Certificates"
            value={data.totals.certificate_count}
            sublabel={`${data.totals.evaluated_count} evaluated`}
          />
          <KpiCard
            label="Bags shipped"
            value={data.totals.bag_count}
            sublabel="60 kg equivalent"
          />
          <KpiCard
            label="Approval rate"
            value={`${approvalRate}%`}
            sublabel={`${data.totals.rejected_count} rejected`}
            valueColor={approvalRate >= 90 ? '#556b2f' : approvalRate >= 70 ? '#a9a454' : '#ef4444'}
          />
          <KpiCard
            label="Exporters"
            value={data.totals.exporter_count}
            sublabel="active in period"
          />
          <KpiCard
            label={data.client.is_roaster ? 'Importers' : 'Roasters'}
            value={data.client.is_roaster ? data.totals.importer_count : data.totals.roaster_count}
            sublabel="distinct destinations"
          />
        </View>

        {/* Sankey + sample mix donut side-by-side */}
        <View style={styles.page1Split}>
          <View style={styles.sankeyPanel}>
            <Text style={styles.sectionLabel}>Supply chain flow</Text>
            <SankeyChart layout={data.sankey} />
          </View>

          <View style={styles.donutPanel}>
            <Text style={styles.sectionLabel}>Sample mix</Text>
            <DonutChart
              slices={[
                {
                  label: 'Approved',
                  value: data.totals.evaluated_count - data.totals.rejected_count,
                  color: '#556b2f',
                },
                {
                  label: 'Rejected',
                  value: data.totals.rejected_count,
                  color: '#ef4444',
                },
              ]}
              size={120}
              centerValue={`${approvalRate}%`}
              centerLabel="approved"
            />

            {/* Per-destination quick read — limited to top 4 so the panel
                doesn't overflow on busy weeks. */}
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.sectionLabel, { marginTop: 0 }]}>
                {data.client.is_roaster ? 'Top importers' : 'Top roasters'}
              </Text>
              {(data.client.is_roaster ? data.importer_breakdown : data.roaster_breakdown)
                .slice(0, 4)
                .map(d => (
                  <View
                    key={d.name}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 2,
                      borderBottomWidth: 1,
                      borderBottomColor: '#ECECEC',
                    }}
                  >
                    <Text style={{ fontSize: 8.5, color: '#222' }} wrap={false}>{d.name}</Text>
                    <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#222' }}>
                      {d.bags.toLocaleString('en-US')}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        </View>

        {Footer('Page 1 of 3 · Summary')}
      </Page>

      {/* ============ Page 2 — Quality breakdown ============ */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>Quality breakdown · {formatShortDate(data.period.start_date)} – {formatShortDate(displayEnd.toISOString())}</Text>

        <View style={styles.page2Split}>
          {/* Top rejection reasons */}
          <View style={styles.page2Col}>
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Top rejection reasons</Text>
              {data.rejection_reasons.length === 0 ? (
                <View
                  style={{
                    paddingVertical: 24,
                    alignItems: 'center',
                    backgroundColor: '#f3f7ee',
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>
                    All samples approved
                  </Text>
                  <Text style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
                    No rejection reasons logged for this period.
                  </Text>
                </View>
              ) : (
                <HorizontalBarChart
                  rows={data.rejection_reasons.map(r => ({
                    label: r.category,
                    value: r.count,
                  }))}
                  labelWidth={120}
                  trackWidth={220}
                  limit={10}
                  chartColor="#ef4444"
                />
              )}
              <Text style={{ fontSize: 7.5, color: '#888', marginTop: 8 }}>
                Counts represent individual compliance violations — a single rejected
                certificate may contribute to more than one row.
              </Text>
            </View>
          </View>

          {/* Supplier scorecard */}
          <View style={styles.page2Col}>
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Supplier scorecard</Text>
              {data.supplier_scorecard.length === 0 ? (
                <Text style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>
                  No supplier activity in this period.
                </Text>
              ) : (
                <View style={styles.scoreTable}>
                  <View style={styles.scoreHeader}>
                    <Text style={[styles.scoreHeaderCell, { width: '38%' }]}>Exporter</Text>
                    <Text style={[styles.scoreHeaderCell, { width: '12%', textAlign: 'right' }]}>Samples</Text>
                    <Text style={[styles.scoreHeaderCell, { width: '12%', textAlign: 'right' }]}>Bags</Text>
                    <Text style={[styles.scoreHeaderCell, { width: '38%' }]}>Approval rate</Text>
                  </View>
                  {data.supplier_scorecard.slice(0, 12).map((s, i) => (
                    <View
                      key={s.exporter_name}
                      style={[styles.scoreRow, { backgroundColor: i % 2 ? ZEBRA : '#FFFFFF' }]}
                    >
                      <Text style={[styles.scoreCell, { width: '38%' }]} wrap={false}>
                        {s.exporter_name}
                      </Text>
                      <Text style={[styles.scoreCell, { width: '12%', textAlign: 'right' }]}>
                        {s.total}
                      </Text>
                      <Text style={[styles.scoreCell, { width: '12%', textAlign: 'right' }]}>
                        {s.bags.toLocaleString('en-US')}
                      </Text>
                      <View
                        style={{
                          width: '38%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <View style={styles.miniBarTrack}>
                          <View
                            style={[
                              styles.miniBar,
                              {
                                width: `${s.approval_rate}%`,
                                backgroundColor:
                                  s.approval_rate >= 90 ? '#556b2f'
                                  : s.approval_rate >= 70 ? '#a9a454'
                                  : '#ef4444',
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            styles.scoreCell,
                            {
                              width: 32,
                              textAlign: 'right',
                              fontWeight: 700,
                              color: s.approval_rate >= 90 ? '#556b2f'
                                : s.approval_rate >= 70 ? '#a9a454'
                                : '#ef4444',
                            },
                          ]}
                        >
                          {s.approval_rate}%
                        </Text>
                      </View>
                    </View>
                  ))}
                  {data.supplier_scorecard.length > 12 && (
                    <Text style={{ fontSize: 8, color: '#888', marginTop: 6, textAlign: 'right' }}>
                      +{data.supplier_scorecard.length - 12} more exporters
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        {Footer('Page 2 of 3 · Quality')}
      </Page>

      {/* ============ Page 3 — Certificate appendix ============ */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>Certificate appendix · {data.totals.certificate_count} approved certificate{data.totals.certificate_count === 1 ? '' : 's'}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow} fixed>
            <Text style={[styles.tableHeaderCell, { width: COLS.approvalDate }]}>Approval date</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.certificateNumber }]}>Certificate #</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.exporter }]}>Exporter</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.importer }]}>Importer</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.importerContract }]}>Importer contract</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.roasterDestination }]}>Roaster destination</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.container }]}>Container</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.icoMarks }]}>ICO marks</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.bags, textAlign: 'right' }]}>Bags</Text>
          </View>

          {data.rows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', color: '#888' }]}>
                No SS certificates issued in this period.
              </Text>
            </View>
          ) : (
            data.rows.map((r, idx) => (
              <View
                key={`${r.certificate_number}-${idx}`}
                style={[styles.tableRow, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#FFFFFF' }]}
                wrap={false}
              >
                <Text style={[styles.tableCell, { width: COLS.approvalDate }]}>{formatDate(r.approval_date)}</Text>
                <Text style={[styles.tableCell, { width: COLS.certificateNumber }]}>{r.certificate_number}</Text>
                <Text style={[styles.tableCell, { width: COLS.exporter }]}>{r.exporter_name || '—'}</Text>
                <Text style={[styles.tableCell, { width: COLS.importer }]}>{r.importer_name || '—'}</Text>
                <Text style={[styles.tableCell, { width: COLS.importerContract }]}>{r.importer_contract_nr || '—'}</Text>
                <Text style={[styles.tableCell, { width: COLS.roasterDestination }]}>{r.roaster_name || '—'}</Text>
                <Text style={[styles.tableCell, { width: COLS.container }]}>{r.container_nr || '—'}</Text>
                <Text style={[styles.tableCell, { width: COLS.icoMarks }]}>{r.ico_marks || '—'}</Text>
                <Text style={[styles.tableCell, { width: COLS.bags, textAlign: 'right' }]}>{r.bags ?? '—'}</Text>
              </View>
            ))
          )}

          {data.rows.length > 0 ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalCell, { width: COLS.approvalDate }]}>Total</Text>
              <Text style={[styles.totalCell, { width: COLS.certificateNumber }]}>
                {data.totals.certificate_count}
              </Text>
              <Text style={[styles.totalCell, { width: COLS.exporter }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.importer }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.importerContract }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.roasterDestination }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.container }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.icoMarks }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.bags, textAlign: 'right' }]}>
                {data.totals.bag_count.toLocaleString('en-US')}
              </Text>
            </View>
          ) : null}
        </View>

        {Footer('Page 3 of 3 · Appendix')}
      </Page>
    </Document>
  )
}
