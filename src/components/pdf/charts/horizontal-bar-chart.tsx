/**
 * Horizontal bar chart for PDF reports.
 *
 * Used for "top rejection reasons" — one row per reason, bar width
 * proportional to the count, with the count value rendered at the
 * end of the bar. Single-color olive bars by default; pass `colorFn`
 * to vary by row.
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelCell: {
    fontSize: 8.5,
    color: '#222',
    paddingRight: 8,
  },
  barTrack: {
    height: 12,
    backgroundColor: '#EEEEEE',
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bar: {
    height: 12,
    borderRadius: 4,
  },
  valueText: {
    fontSize: 8.5,
    fontWeight: 600,
    color: '#222',
    paddingLeft: 6,
  },
})

export interface BarRow {
  label: string
  value: number
  /** Optional override color for this row. Default uses chartColor. */
  color?: string
}

interface HorizontalBarChartProps {
  rows: BarRow[]
  /** Left-side label column width (px). Default 130. */
  labelWidth?: number
  /** Track width (px). Default 220. */
  trackWidth?: number
  /** Default bar color. */
  chartColor?: string
  /** Sort descending by value before rendering. Default true. */
  sortDesc?: boolean
  /** Cap to N rows after sorting. */
  limit?: number
}

export function HorizontalBarChart({
  rows,
  labelWidth = 130,
  trackWidth = 220,
  chartColor = '#556b2f',
  sortDesc = true,
  limit,
}: HorizontalBarChartProps) {
  if (rows.length === 0) {
    return (
      <Text style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>
        No data for this period.
      </Text>
    )
  }

  const sorted = sortDesc ? [...rows].sort((a, b) => b.value - a.value) : rows
  const limited = typeof limit === 'number' ? sorted.slice(0, limit) : sorted
  const max = Math.max(...limited.map(r => r.value), 1)

  return (
    <View>
      {limited.map((r, i) => {
        const widthPct = (r.value / max) * 100
        const widthPx = (widthPct / 100) * trackWidth
        return (
          <View key={`${r.label}-${i}`} style={styles.row}>
            <Text style={[styles.labelCell, { width: labelWidth }]} wrap={false}>
              {r.label}
            </Text>
            <View style={[styles.barTrack, { width: trackWidth }]}>
              <View
                style={[
                  styles.bar,
                  { width: widthPx, backgroundColor: r.color ?? chartColor },
                ]}
              />
            </View>
            <Text style={styles.valueText}>{r.value.toLocaleString('en-US')}</Text>
          </View>
        )
      })}
    </View>
  )
}
