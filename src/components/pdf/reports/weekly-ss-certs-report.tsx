/**
 * Weekly SS Certificates Report — redesigned (May 2026).
 *
 * Three-page A4 landscape PDF:
 *   1. Executive Summary — KPI strip + supply-chain Sankey (full width)
 *   2. Quality breakdown — supplier scorecard + sample-mix donut + (conditional) rejection reasons
 *   3. Certificate appendix — tight per-cert table (approved only)
 *
 * Sankey shape depends on the client_types of the recipient:
 *   importer (Blaser)        → Shipper → Seller
 *   roaster (Ahold)          → Shipper → Seller → Importer
 *   final_buyer (Dunkin)     → Shipper → Seller → Importer → Roaster
 *
 * Rejection-reasons panel is hidden when there are no rejections (or
 * everything fell into the "Other" bucket) — keeps the page from showing
 * an empty placeholder for healthy clients.
 *
 * Inter font is registered globally by certificate-styles.ts.
 */

import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { WeeklySSCertReportData } from '@/lib/report-data'
import { SankeyChart } from '@/components/pdf/charts/sankey-chart'
import { KpiCard } from '@/components/pdf/charts/kpi-card'
import { HorizontalBarChart } from '@/components/pdf/charts/horizontal-bar-chart'
import { DonutChart } from '@/components/pdf/charts/donut-chart'
import { SSCertAppendixTable } from './ss-cert-appendix-table'

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

  // --- Page 1 — Sankey panel ---
  sankeyPanel: {
    backgroundColor: '#F9F9FA',
    borderRadius: 10,
    padding: 14,
  },

  // --- Page 2 layout ---
  page2Row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  scorecardPanel: {
    width: '68%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: GRAY_BORDER,
    borderRadius: 10,
    padding: 12,
  },
  donutPanel: {
    width: '32%',
    backgroundColor: '#F9F9FA',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  rejectionPanel: {
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

  const displayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
  const periodLabel = `Weekly SS Certificates · ${formatShortDate(data.period.start_date)} – ${formatShortDate(displayEnd.toISOString())}`

  const approvalRate = data.totals.approval_rate

  // Only render the rejection-reasons panel when there's something
  // informative to show — at least one non-Other category. A single
  // "Other" entry is just noise (typically means a stale violation
  // string we don't have a pattern for yet).
  const informativeReasons = data.rejection_reasons.filter(r => r.category !== 'Other')
  const showRejectionPanel = informativeReasons.length > 0

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
          {/* Last KPI swaps between roaster + importer count based on the
              recipient — Ahold sees importers, Dunkin sees roasters. */}
          <KpiCard
            label={data.client.sankey_type === 'importer'
              ? 'Shippers'
              : data.client.sankey_type === 'roaster' ? 'Importers' : 'Roasters'}
            value={data.client.sankey_type === 'importer'
              ? data.totals.exporter_count
              : data.client.sankey_type === 'roaster' ? data.totals.importer_count
              : data.totals.roaster_count}
            sublabel="distinct destinations"
          />
        </View>

        {/* Sankey panel takes the full content width. Donut moved to page 2. */}
        <View style={styles.sankeyPanel}>
          <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Supply chain flow</Text>
          <SankeyChart layout={data.sankey} columnLabels={data.sankey_columns} />
        </View>

        {Footer('Page 1 of 3 · Summary')}
      </Page>

      {/* ============ Page 2 — Quality breakdown ============ */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>
          Quality breakdown · {formatShortDate(data.period.start_date)} – {formatShortDate(displayEnd.toISOString())}
        </Text>

        {/* Row 1: supplier scorecard (wide) + sample-mix donut */}
        <View style={styles.page2Row}>
          <View style={styles.scorecardPanel}>
            <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Supplier scorecard</Text>
            {data.supplier_scorecard.length === 0 ? (
              <Text style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>
                No supplier activity in this period.
              </Text>
            ) : (
              <View style={styles.scoreTable}>
                <View style={styles.scoreHeader}>
                  <Text style={[styles.scoreHeaderCell, { width: '42%' }]}>Shipper</Text>
                  <Text style={[styles.scoreHeaderCell, { width: '12%', textAlign: 'right' }]}>Samples</Text>
                  <Text style={[styles.scoreHeaderCell, { width: '14%', textAlign: 'right' }]}>Bags</Text>
                  <Text style={[styles.scoreHeaderCell, { width: '32%' }]}>Approval rate</Text>
                </View>
                {data.supplier_scorecard.slice(0, 12).map((s, i) => (
                  <View
                    key={s.exporter_name}
                    style={[styles.scoreRow, { backgroundColor: i % 2 ? ZEBRA : '#FFFFFF' }]}
                  >
                    <Text style={[styles.scoreCell, { width: '42%' }]} wrap={false}>
                      {s.exporter_name}
                    </Text>
                    <Text style={[styles.scoreCell, { width: '12%', textAlign: 'right' }]}>
                      {s.total}
                    </Text>
                    <Text style={[styles.scoreCell, { width: '14%', textAlign: 'right' }]}>
                      {s.bags.toLocaleString('en-US')}
                    </Text>
                    <View
                      style={{
                        width: '32%',
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
                    +{data.supplier_scorecard.length - 12} more shippers
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.donutPanel}>
            <Text style={[styles.sectionLabel, { marginTop: 0, alignSelf: 'flex-start' }]}>Sample mix</Text>
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
              size={130}
              centerValue={`${approvalRate}%`}
              centerLabel="approved"
            />

            {/* Top destinations — what they look like depends on type. */}
            <View style={{ marginTop: 14, width: '100%' }}>
              <Text style={[styles.sectionLabel, { marginTop: 0 }]}>
                {data.client.sankey_type === 'final_buyer' ? 'Top roasters'
                  : data.client.sankey_type === 'roaster' ? 'Top importers'
                  : 'Top shippers'}
              </Text>
              {(data.client.sankey_type === 'final_buyer'
                ? data.roaster_breakdown
                : data.importer_breakdown
              )
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

        {/* Row 2: rejection reasons — only rendered when there are
            informative (non-Other) buckets. Hidden entirely for clients
            with zero rejections, which keeps the page from showing a
            half-empty placeholder. */}
        {showRejectionPanel && (
          <View style={styles.rejectionPanel}>
            <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Top rejection reasons</Text>
            <HorizontalBarChart
              rows={informativeReasons.map(r => ({ label: r.category, value: r.count }))}
              labelWidth={140}
              trackWidth={420}
              limit={10}
              chartColor="#ef4444"
            />
            <Text style={{ fontSize: 7.5, color: '#888', marginTop: 8 }}>
              Counts represent individual compliance violations — a single rejected
              certificate may contribute to more than one row.
            </Text>
          </View>
        )}

        {Footer('Page 2 of 3 · Quality')}
      </Page>

      {/* ============ Page 3 — Certificate appendix ============ */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        {Header}
        <Text style={styles.titleBar}>
          Certificate appendix · {data.totals.certificate_count} approved certificate{data.totals.certificate_count === 1 ? '' : 's'}
        </Text>

        <SSCertAppendixTable
          rows={data.rows}
          totals={{ certificate_count: data.totals.certificate_count, bag_count: data.totals.bag_count }}
          hideRoasterCol={data.client.is_roaster}
        />

        {Footer('Page 3 of 3 · Appendix')}
      </Page>
    </Document>
  )
}
