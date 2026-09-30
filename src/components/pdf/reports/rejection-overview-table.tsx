/**
 * "Rejection reasons per certificate": every rejected certificate of the
 * period with every reason it failed, the measured value against the limit in
 * each cell, grouped by seller and (only when a seller used more than one) by
 * shipper. The worst reason is red: the one the charts page counts it under.
 * Data: `buildRejectionOverview` (lib/reports/rejection-overview.ts).
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { reportDay } from '@/lib/reports/periods'
import { reasonShort, type RejectionReasonKey } from '@/lib/reports/rejection-reasons'
import type { RejectionOverview, OverviewRow } from '@/lib/reports/rejection-overview'

const GREEN = '#556b2f'
const GREEN_DARK = '#2f6b21'
const RED = '#ef4444'
const GRAY_BORDER = '#e3e3e3'
const ZEBRA = '#f7f7f5'
const BAND = '#F4F4F2'

type FixedKey = 'date' | 'cert' | 'container' | 'bags'
const FIXED: Array<{ key: FixedKey; label: string; weight: number; align?: 'right' }> = [
  { key: 'date', label: 'Date', weight: 48 },
  { key: 'cert', label: 'Certificate #', weight: 70 },
  { key: 'container', label: 'Container', weight: 84 },
  { key: 'bags', label: 'Bags', weight: 40, align: 'right' },
]
const REASON_WEIGHT = 76

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: '#222', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 4,
  },
  count: { fontSize: 8, color: '#888' },
  table: { borderTopWidth: 1, borderTopColor: GRAY_BORDER },
  headerRow: { flexDirection: 'row', backgroundColor: GREEN },
  headerCell: {
    color: '#FFFFFF', fontSize: 8.5, fontWeight: 700, paddingVertical: 6, paddingHorizontal: 5,
    borderRightWidth: 1, borderRightColor: '#FFFFFF',
  },
  sellerRow: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: BAND, paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  sellerName: { fontSize: 8.5, fontWeight: 700, color: '#222' },
  sellerMeta: { fontSize: 8, color: '#666', marginLeft: 6 },
  shipperRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 3, paddingLeft: 14, paddingRight: 5, borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  shipperName: { fontSize: 8, fontWeight: 600, color: '#555' },
  shipperMeta: { fontSize: 8, color: '#888', marginLeft: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRAY_BORDER },
  cell: {
    fontSize: 8, paddingVertical: 3, paddingHorizontal: 5, color: '#222',
    borderRightWidth: 1, borderRightColor: GRAY_BORDER,
  },
  worst: { color: RED, fontWeight: 700 },
  limit: { fontSize: 7, color: '#888' },
  totalRow: { flexDirection: 'row', backgroundColor: GREEN_DARK },
  totalCell: {
    color: '#FFFFFF', fontSize: 9, fontWeight: 700, paddingVertical: 5, paddingHorizontal: 5,
    borderRightWidth: 1, borderRightColor: GREEN_DARK,
  },
  legend: { fontSize: 7.5, color: '#666', marginTop: 6 },
})

/** dd/mm/yy of the São Paulo day, like the certificates table. */
const formatDate = (iso: string) => {
  const [yyyy, mm, dd] = reportDay(iso).split('-')
  return `${dd}/${mm}/${yyyy.slice(-2)}`
}
const fmt = (n: number) => n.toLocaleString('en-US')

export function RejectionOverviewTable({
  overview,
  evaluated,
  hideContainer = false,
}: {
  overview: RejectionOverview
  /** Certificates in the period, for "15 of 53 certificates rejected". */
  evaluated: number
  /** PSS has no container. */
  hideContainer?: boolean
}) {
  const fixed = FIXED.filter(c => c.key !== 'container' || !hideContainer)
  const total = fixed.reduce((s, c) => s + c.weight, 0) + overview.reasons.length * REASON_WEIGHT
  const pct = (w: number) => `${((w / total) * 100).toFixed(2)}%`
  const reasonWidth = pct(REASON_WEIGHT)
  // The totals row spans every fixed column but Bags with its label.
  const labelWidth = pct(fixed.filter(c => c.key !== 'bags').reduce((s, c) => s + c.weight, 0))
  const bagsWidth = pct(FIXED.find(c => c.key === 'bags')!.weight)

  const fixedText = (o: OverviewRow, key: FixedKey) => {
    switch (key) {
      case 'date': return formatDate(o.row.approval_date)
      case 'cert': return o.row.certificate_number
      case 'container': return o.row.container_nr || '—'
      case 'bags': return o.row.bags != null ? fmt(o.row.bags) : '—'
    }
  }

  const reasonCell = (o: OverviewRow, k: RejectionReasonKey) => {
    const values = o.cells[k] ?? []
    return (
      <Text key={k} style={[styles.cell, { width: reasonWidth }]}>
        {values.map((v, i) => (
          <Text key={i}>
            {i > 0 ? '\n' : ''}
            <Text style={o.worst === k ? styles.worst : {}}>{v.value}</Text>
            {v.limit ? <Text style={styles.limit}> {v.limit}</Text> : null}
          </Text>
        ))}
      </Text>
    )
  }

  const certWord = overview.total === 1 ? 'certificate' : 'certificates'
  let zebra = 0

  return (
    <>
      <View style={styles.head}>
        <Text style={styles.sectionLabel}>Rejection reasons per certificate</Text>
        <Text style={styles.count}>{overview.total} of {evaluated} {certWord} rejected</Text>
      </View>
      <View style={styles.table}>
        <View style={styles.headerRow} fixed>
          {fixed.map(c => (
            <Text key={c.key} style={[styles.headerCell, { width: pct(c.weight) }, c.align ? { textAlign: c.align } : {}]}>
              {c.label}
            </Text>
          ))}
          {overview.reasons.map(k => (
            <Text key={k} style={[styles.headerCell, { width: reasonWidth }]}>{reasonShort(k)}</Text>
          ))}
        </View>

        {overview.sellers.map(s => (
          <View key={s.seller}>
            {/* A heading never sits alone at the foot of a page. */}
            <View style={styles.sellerRow} wrap={false} minPresenceAhead={40}>
              <Text style={styles.sellerName}>{s.seller}</Text>
              <Text style={styles.sellerMeta}>{s.certificates} rejected · {fmt(s.bags)} bags</Text>
            </View>
            {s.shippers.map(sh => (
              <View key={sh.shipper}>
                {s.showShippers && (
                  <View style={styles.shipperRow} wrap={false} minPresenceAhead={20}>
                    <Text style={styles.shipperName}>Shipper: {sh.shipper}</Text>
                    <Text style={styles.shipperMeta}>· {sh.rows.length}</Text>
                  </View>
                )}
                {sh.rows.map(o => (
                  <View
                    key={o.row.certificate_number}
                    style={[styles.row, { backgroundColor: zebra++ % 2 === 1 ? ZEBRA : '#FFFFFF' }]}
                    wrap={false}
                  >
                    {fixed.map(c => (
                      <Text key={c.key} style={[styles.cell, { width: pct(c.weight) }, c.align ? { textAlign: c.align } : {}]}>
                        {fixedText(o, c.key)}
                      </Text>
                    ))}
                    {overview.reasons.map(k => reasonCell(o, k))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totalRow} wrap={false}>
          <Text style={[styles.totalCell, { width: labelWidth }]}>Certificates failing each reason</Text>
          <Text style={[styles.totalCell, { width: bagsWidth, textAlign: 'right' }]}>{fmt(overview.bags)}</Text>
          {overview.reasons.map(k => (
            <Text key={k} style={[styles.totalCell, { width: reasonWidth, textAlign: 'center' }]}>
              {overview.failing[k] ?? 0}
            </Text>
          ))}
        </View>
      </View>
      <Text style={styles.legend}>
        <Text style={{ color: RED, fontWeight: 700 }}>Red</Text>: worst reason, the one the charts page counts. Grey: the specification&apos;s limit.
        {'   '}A certificate counts under every reason it failed, so the bottom row can add up to more than {overview.total}.
      </Text>
    </>
  )
}
