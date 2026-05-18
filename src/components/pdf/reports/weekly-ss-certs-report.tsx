/**
 * Weekly SS Certificates Report (client-facing PDF).
 *
 * Layout follows docs/report_examples/Brazil_certs_week_9_*.pdf — a landscape
 * A4 with: country flag + Wolthers logo + client logo header, green stat boxes
 * (# of bags / # of certificates / per-roaster / per-importer), and a single
 * green-banded table listing every SS certificate in the period.
 *
 * Inter font is registered globally by certificate-styles.ts; importing it for
 * the side-effect ensures Font.register runs before any rendering.
 */

import React from 'react'
import { Document, Page, View, Image, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { WeeklySSCertReportData } from '@/lib/report-data'

const GREEN = '#4f9b3a'        // matches the green bars in the legacy Excel report
const GREEN_DARK = '#2f6b21'   // total row + borders
const GRAY_BORDER = '#d9d9d9'
const ZEBRA = '#f3f3f3'

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
    marginBottom: 18,
    minHeight: 56,
  },
  headerLeft: { width: '20%', justifyContent: 'center', alignItems: 'flex-start' },
  headerCenter: { width: '60%', justifyContent: 'center', alignItems: 'center' },
  headerRight: { width: '20%', justifyContent: 'center', alignItems: 'flex-end' },
  flagImage: { width: 64, height: 44, objectFit: 'contain' },
  wolthersLogo: { width: 140, height: 28, objectFit: 'contain' },
  clientLogo: { maxWidth: 110, maxHeight: 40, objectFit: 'contain' },
  generationDate: {
    fontSize: 9,
    color: '#666',
    marginTop: 6,
  },
  // --- Stat blocks row ---
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  statsColLeft: {
    width: '34%',
    flexDirection: 'column',
    gap: 6,
  },
  statsColRoasters: {
    width: '33%',
    flexDirection: 'column',
  },
  statsColImporters: {
    width: '33%',
    flexDirection: 'column',
  },
  statBox: {
    backgroundColor: GREEN,
    color: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statBoxLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 600,
  },
  statBoxValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 700,
  },
  breakdownHeader: {
    fontSize: 9,
    color: '#444',
    textAlign: 'center',
    marginBottom: 4,
  },
  breakdownBox: {
    backgroundColor: GREEN,
    color: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 60,
    justifyContent: 'center',
  },
  breakdownLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  breakdownLineName: { color: '#FFFFFF', fontSize: 9 },
  breakdownLineValue: { color: '#FFFFFF', fontSize: 11, fontWeight: 700 },
  breakdownFooter: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  // --- Title bar above the table ---
  tableTitleBar: {
    backgroundColor: GREEN,
    color: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 11,
    marginBottom: 0,
  },
  // --- Table ---
  table: {
    borderTopWidth: 1,
    borderTopColor: GRAY_BORDER,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: GREEN,
  },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#FFFFFF',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: GRAY_BORDER,
  },
  tableCell: {
    fontSize: 8.5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: GRAY_BORDER,
    color: '#222',
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: GREEN_DARK,
  },
  totalCell: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: GREEN_DARK,
  },
})

// Column widths sum to 100%. Tuned to match the legacy Excel layout — wider
// fields for exporter/importer/roaster destination since those carry the long
// company names.
const COLS = {
  approvalDate: '9%',
  certificateNumber: '10%',
  exporter: '11%',
  importer: '13%',
  importerContract: '13%',
  roasterDestination: '13%',
  container: '11%',
  icoMarks: '12%',
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

  // Period label for the green title bar. End is exclusive in our query but we
  // display the last-included day, so subtract one day for the display label.
  const displayEnd = new Date(new Date(data.period.end_date).getTime() - 86400000)
  const periodLabel = `Weekly SS Certificates from ${formatShortDate(data.period.start_date)} to ${formatShortDate(displayEnd.toISOString())}`

  // Truncate breakdown lists so the box doesn't overflow. Show top N + "+more".
  const MAX_BREAKDOWN_LINES = 4
  const roasterDisplay = data.roaster_breakdown.slice(0, MAX_BREAKDOWN_LINES)
  const roasterOverflow = data.roaster_breakdown.length - roasterDisplay.length
  const importerDisplay = data.importer_breakdown.slice(0, MAX_BREAKDOWN_LINES)
  const importerOverflow = data.importer_breakdown.length - importerDisplay.length

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* ---- Header ---- */}
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

        {/* ---- Stats / Breakdown row ---- */}
        <View style={styles.statsRow}>
          {/* Two stacked stat boxes — bags + certificates */}
          <View style={styles.statsColLeft}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxLabel}># of bags</Text>
              <Text style={styles.statBoxValue}>{formatThousands(data.totals.bag_count)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxLabel}># of certificates</Text>
              <Text style={styles.statBoxValue}>{data.totals.certificate_count}</Text>
            </View>
          </View>

          {/* Roasters breakdown */}
          <View style={styles.statsColRoasters}>
            <Text style={styles.breakdownHeader}>Roasters</Text>
            <View style={styles.breakdownBox}>
              {roasterDisplay.length === 0 ? (
                <Text style={{ color: '#FFFFFF', fontSize: 9, textAlign: 'center' }}>—</Text>
              ) : (
                roasterDisplay.map(r => (
                  <View key={r.name} style={styles.breakdownLine}>
                    <Text style={styles.breakdownLineName}>{r.name}</Text>
                    <Text style={styles.breakdownLineValue}>{formatThousands(r.bags)}</Text>
                  </View>
                ))
              )}
            </View>
            {roasterOverflow > 0 ? (
              <Text style={styles.breakdownFooter}>+{roasterOverflow} more</Text>
            ) : null}
          </View>

          {/* Importers breakdown */}
          <View style={styles.statsColImporters}>
            <Text style={styles.breakdownHeader}>Importers</Text>
            <View style={styles.breakdownBox}>
              {importerDisplay.length === 0 ? (
                <Text style={{ color: '#FFFFFF', fontSize: 9, textAlign: 'center' }}>—</Text>
              ) : (
                importerDisplay.map(i => (
                  <View key={i.name} style={styles.breakdownLine}>
                    <Text style={styles.breakdownLineName}>{i.name}</Text>
                    <Text style={styles.breakdownLineValue}>{formatThousands(i.bags)}</Text>
                  </View>
                ))
              )}
            </View>
            {importerOverflow > 0 ? (
              <Text style={styles.breakdownFooter}>+{importerOverflow} more</Text>
            ) : null}
          </View>
        </View>

        {/* ---- Title bar ---- */}
        <Text style={styles.tableTitleBar}>{periodLabel}</Text>

        {/* ---- Table ---- */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeaderRow} fixed>
            <Text style={[styles.tableHeaderCell, { width: COLS.approvalDate }]}>Approval date</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.certificateNumber }]}>Certificate#</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.exporter }]}>Exporter</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.importer }]}>Importer</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.importerContract }]}>Importer Contract #</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.roasterDestination }]}>Roaster Destination</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.container }]}>Container</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.icoMarks }]}>Ico Marks#</Text>
            <Text style={[styles.tableHeaderCell, { width: COLS.bags, textAlign: 'right' }]}>Bags</Text>
          </View>

          {/* Body */}
          {data.rows.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', color: '#888' }]}>
                No SS certificates issued in this period.
              </Text>
            </View>
          ) : (
            data.rows.map((r, idx) => (
              <View key={`${r.certificate_number}-${idx}`} style={[styles.tableRow, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#FFFFFF' }]}>
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

          {/* Total */}
          {data.rows.length > 0 ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalCell, { width: COLS.approvalDate }]}>Total</Text>
              <Text style={[styles.totalCell, { width: COLS.certificateNumber }]}>{data.totals.certificate_count}</Text>
              <Text style={[styles.totalCell, { width: COLS.exporter }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.importer }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.importerContract }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.roasterDestination }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.container }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.icoMarks }]}></Text>
              <Text style={[styles.totalCell, { width: COLS.bags, textAlign: 'right' }]}>
                {formatThousands(data.totals.bag_count)}
              </Text>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  )
}

// "1,356" — the legacy reports use a dot as the thousands separator but EN
// locales read commas more naturally; we use commas. Swap to . if the user
// wants to match the Excel exactly.
function formatThousands(n: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US')
}
