/**
 * Year-to-date supplier rating — the report-side twin of the supplier-review
 * leaderboard, printed side by side for shippers and sellers.
 *
 * Inter is registered by certificate-styles.ts in 400/600/700 with NO italic;
 * never set fontStyle here or the whole render aborts.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { SupplierRatingRow } from '@/lib/reports/supplier-ratings'

const GREEN = '#556b2f'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'

/** Rows per table. Beyond this the block stops fitting beside the flow chart. */
const DEFAULT_LIMIT = 8

const styles = StyleSheet.create({
  panel: { marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  windowLabel: { fontSize: 8, color: '#888' },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  subLabel: {
    fontSize: 8.5, fontWeight: 700, color: '#555', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 4,
  },
  headerRow: { flexDirection: 'row', backgroundColor: '#F4F4F2' },
  headerCell: { fontSize: 7.5, fontWeight: 700, color: '#555', textTransform: 'uppercase', paddingVertical: 3, paddingHorizontal: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  cell: { fontSize: 8, color: '#222', paddingVertical: 3, paddingHorizontal: 4 },
  noneText: { fontSize: 9, color: '#888' },
})

const W_RANK = '8%'
const W_NAME = '42%'
const W_NUM = '12.5%'
const W_RATE = '12.5%'

const rateColor = (rate: number) => (rate >= 95 ? GREEN : rate >= 80 ? '#a9a454' : RED)

function RatingTable({ title, rows, limit }: { title: string; rows: SupplierRatingRow[]; limit: number }) {
  const shown = rows.slice(0, limit)
  return (
    <View style={styles.col}>
      <Text style={styles.subLabel}>{title}</Text>
      {shown.length === 0 ? (
        <Text style={styles.noneText}>No certificates this year.</Text>
      ) : (
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, { width: W_RANK }]}>#</Text>
            <Text style={[styles.headerCell, { width: W_NAME }]}>Name</Text>
            <Text style={[styles.headerCell, { width: W_NUM, textAlign: 'right' }]}>Certs</Text>
            <Text style={[styles.headerCell, { width: W_NUM, textAlign: 'right' }]}>PSS</Text>
            <Text style={[styles.headerCell, { width: W_NUM, textAlign: 'right' }]}>SS</Text>
            <Text style={[styles.headerCell, { width: W_RATE, textAlign: 'right' }]}>Appr.</Text>
          </View>
          {shown.map((r, idx) => (
            <View
              key={r.name}
              style={[styles.row, { backgroundColor: idx % 2 === 1 ? ZEBRA : '#FFFFFF' }]}
              wrap={false}
            >
              <Text style={[styles.cell, { width: W_RANK }]}>{r.rank}</Text>
              <Text style={[styles.cell, { width: W_NAME }]}>{r.name}</Text>
              <Text style={[styles.cell, { width: W_NUM, textAlign: 'right' }]}>{r.total}</Text>
              <Text style={[styles.cell, { width: W_NUM, textAlign: 'right' }]}>{r.pss || '-'}</Text>
              <Text style={[styles.cell, { width: W_NUM, textAlign: 'right' }]}>{r.ss || '-'}</Text>
              <Text style={[styles.cell, { width: W_RATE, textAlign: 'right', color: rateColor(r.approvalRate), fontWeight: 700 }]}>
                {r.approvalRate}%
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

export function SupplierRatingTables({
  shippers,
  sellers,
  windowLabel,
  limit = DEFAULT_LIMIT,
}: {
  shippers: SupplierRatingRow[]
  sellers: SupplierRatingRow[]
  /** Human range, e.g. "Jan 01 – Jul 31". */
  windowLabel: string
  limit?: number
}) {
  if (shippers.length === 0 && sellers.length === 0) return null
  return (
    <View style={styles.panel} wrap={false}>
      <View style={styles.head}>
        <Text style={styles.sectionLabel}>Supplier rating · year to date</Text>
        <Text style={styles.windowLabel}>{windowLabel}</Text>
      </View>
      <View style={styles.cols}>
        <RatingTable title="By shipper" rows={shippers} limit={limit} />
        <RatingTable title="By seller" rows={sellers} limit={limit} />
      </View>
    </View>
  )
}
