/**
 * Vertical grouped bar chart for PDF reports (@react-pdf/renderer).
 * One group per category with Approved (green) + Rejected (red) bars, and a
 * stats grid beneath (Rejection rate / Rejected / Approved / MT approved).
 * Used by the Bi-Weekly report for Importer/Exporter performance, in counts
 * (PSS) or bags (SS).
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'

const GREEN = '#556b2f'
const RED = '#ef4444'
const BORDER = '#e3e3e3'

export interface GroupedBarCategory {
  label: string
  approved: number
  rejected: number
  approvedMt: number // metric tons, 1 decimal
  rejectedMt: number // metric tons, 1 decimal
  rejectionRate: number // 0-100
}

/** Round an axis maximum up to a clean tick value. */
export function niceAxisMax(max: number): number {
  if (max <= 0) return 1
  if (max <= 10) return max + 1
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / pow) * pow
}

const fmt = (n: number, metric: 'count' | 'bags') =>
  metric === 'bags' ? n.toLocaleString('en-US') : String(n)

const fmtMt = (n: number) => (n > 0 ? n.toFixed(1) : '-')

// Width of the leading row-label column in the stats grid. The plot adds a
// matching leading spacer so each bar group sits directly above its category
// column in the grid below.
const LABEL_W = 80

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  plot: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: BORDER },
  plotSpacer: { width: LABEL_W },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: '100%' },
  bar: { width: 16 },
  grid: { borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  gridLabel: { width: LABEL_W, fontSize: 7, color: '#555', padding: 3, borderRightWidth: 1, borderRightColor: BORDER },
  gridCell: { flex: 1, fontSize: 7.5, color: '#222', padding: 3, textAlign: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  catLabel: { flex: 1, fontSize: 7.5, fontWeight: 700, color: '#333', padding: 3, textAlign: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  legend: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  swatch: { width: 8, height: 8 },
  legendText: { fontSize: 7, color: '#555' },
})

export function VerticalGroupedBarChart({
  categories,
  metric,
  width = 520,
  height = 120,
}: {
  categories: GroupedBarCategory[]
  metric: 'count' | 'bags'
  width?: number
  height?: number
}) {
  const max = niceAxisMax(Math.max(0, ...categories.flatMap(c => [c.approved, c.rejected])))
  const h = (v: number) => (max > 0 ? (v / max) * height : 0)
  const dash = (v: number) => (v > 0 ? v : '-')

  return (
    <View style={[styles.wrap, { width }]}>
      <View style={[styles.plot, { height }]}>
        {/* Leading spacer aligns bar groups with the grid's category columns
            (which sit after the row-label column). */}
        <View style={styles.plotSpacer} />
        {categories.map(c => (
          <View key={c.label} style={styles.col}>
            <View style={styles.bars}>
              <View style={[styles.bar, { height: h(c.approved), backgroundColor: GREEN }]} />
              <View style={[styles.bar, { height: h(c.rejected), backgroundColor: RED }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}></Text>
          {categories.map(c => <Text key={c.label} style={styles.catLabel}>{c.label}</Text>)}
        </View>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}>Rejection rate</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{c.rejectionRate > 0 ? `${c.rejectionRate}%` : '-'}</Text>)}
        </View>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}>Rejected</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{dash(c.rejected) === '-' ? '-' : fmt(c.rejected, metric)}</Text>)}
        </View>
        <View style={styles.gridRow}>
          <Text style={styles.gridLabel}>Approved</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{dash(c.approved) === '-' ? '-' : fmt(c.approved, metric)}</Text>)}
        </View>
        {/* MT is listed regardless of the bar metric — the metric selects what
            the BARS encode, not what the grid reports. */}
        <View style={[styles.gridRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.gridLabel}>MT approved</Text>
          {categories.map(c => <Text key={c.label} style={styles.gridCell}>{fmtMt(c.approvedMt)}</Text>)}
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: GREEN }]} /><Text style={styles.legendText}>Approved</Text></View>
        <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: RED }]} /><Text style={styles.legendText}>Rejected</Text></View>
      </View>
    </View>
  )
}
