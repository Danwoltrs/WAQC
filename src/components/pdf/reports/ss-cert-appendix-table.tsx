/**
 * Shared SS certificate appendix table for the Weekly + Bi-Weekly reports.
 * A tight per-certificate table (approved only) with a totals row. Extracted
 * verbatim from the Weekly report so both reports stay consistent.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { WeeklySSCertRow } from '@/lib/report-data'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

// Cert-appendix column widths. The Roaster column is suppressed when
// the client is itself a roaster (Ahold) — those bytes get redistributed
// to wider exporter + importer columns.
const COLS_WITH_ROASTER = {
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
const COLS_NO_ROASTER = {
  approvalDate: '10%',
  certificateNumber: '13%',
  exporter: '15%',
  importer: '17%',
  importerContract: '15%',
  container: '12%',
  icoMarks: '10%',
  bags: '8%',
}

const styles = StyleSheet.create({
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
})

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

export function SSCertAppendixTable({
  rows,
  totals,
  hideRoasterCol,
}: {
  rows: WeeklySSCertRow[]
  totals: { certificate_count: number; bag_count: number }
  hideRoasterCol: boolean
}) {
  const COLS = hideRoasterCol ? COLS_NO_ROASTER : COLS_WITH_ROASTER
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow} fixed>
        <Text style={[styles.tableHeaderCell, { width: COLS.approvalDate }]}>Approval date</Text>
        <Text style={[styles.tableHeaderCell, { width: COLS.certificateNumber }]}>Certificate #</Text>
        <Text style={[styles.tableHeaderCell, { width: COLS.exporter }]}>Shipper</Text>
        <Text style={[styles.tableHeaderCell, { width: COLS.importer }]}>Importer</Text>
        <Text style={[styles.tableHeaderCell, { width: COLS.importerContract }]}>Importer contract</Text>
        {!hideRoasterCol && (
          <Text style={[styles.tableHeaderCell, { width: (COLS as typeof COLS_WITH_ROASTER).roasterDestination }]}>
            Roaster destination
          </Text>
        )}
        <Text style={[styles.tableHeaderCell, { width: COLS.container }]}>Container</Text>
        <Text style={[styles.tableHeaderCell, { width: COLS.icoMarks }]}>ICO marks</Text>
        <Text style={[styles.tableHeaderCell, { width: COLS.bags, textAlign: 'right' }]}>Bags</Text>
      </View>

      {rows.length === 0 ? (
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', color: '#888' }]}>
            No SS certificates issued in this period.
          </Text>
        </View>
      ) : (
        rows.map((r, idx) => (
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
            {!hideRoasterCol && (
              <Text style={[styles.tableCell, { width: (COLS as typeof COLS_WITH_ROASTER).roasterDestination }]}>
                {r.roaster_name || '—'}
              </Text>
            )}
            <Text style={[styles.tableCell, { width: COLS.container }]}>{r.container_nr || '—'}</Text>
            <Text style={[styles.tableCell, { width: COLS.icoMarks }]}>{r.ico_marks || '—'}</Text>
            <Text style={[styles.tableCell, { width: COLS.bags, textAlign: 'right' }]}>{r.bags ?? '—'}</Text>
          </View>
        ))
      )}

      {rows.length > 0 ? (
        <View style={styles.totalRow}>
          <Text style={[styles.totalCell, { width: COLS.approvalDate }]}>Total</Text>
          <Text style={[styles.totalCell, { width: COLS.certificateNumber }]}>
            {totals.certificate_count}
          </Text>
          <Text style={[styles.totalCell, { width: COLS.exporter }]}></Text>
          <Text style={[styles.totalCell, { width: COLS.importer }]}></Text>
          <Text style={[styles.totalCell, { width: COLS.importerContract }]}></Text>
          {!hideRoasterCol && (
            <Text style={[styles.totalCell, { width: (COLS as typeof COLS_WITH_ROASTER).roasterDestination }]}></Text>
          )}
          <Text style={[styles.totalCell, { width: COLS.container }]}></Text>
          <Text style={[styles.totalCell, { width: COLS.icoMarks }]}></Text>
          <Text style={[styles.totalCell, { width: COLS.bags, textAlign: 'right' }]}>
            {totals.bag_count.toLocaleString('en-US')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
