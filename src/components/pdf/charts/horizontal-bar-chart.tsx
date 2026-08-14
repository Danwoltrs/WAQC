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
  // Fixed-width right-aligned stat cell, so the header row above lines up with
  // the numbers below it. Only used when `statHeaders` is set.
  statCell: {
    fontSize: 8.5,
    color: '#222',
    textAlign: 'right',
    paddingLeft: 6,
  },
  statHeadRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3 },
  statHeadText: {
    fontSize: 6.5,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'right',
    paddingLeft: 6,
  },
})

export interface BarRow {
  label: string
  value: number
  /** Optional override color for this row. Default uses chartColor. */
  color?: string
  /**
   * Extra pre-formatted numbers shown to the right of `value`, under the 2nd..Nth
   * entries of `statHeaders`. A raw total says nothing about whether it was one
   * bad lot or many, so the defect blocks pass avg + max here.
   */
  stats?: string[]
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
  /**
   * Headings for the numeric columns. The FIRST covers `value`; the rest cover
   * `BarRow.stats` in order. Setting this switches the value cell to a fixed
   * width so the headings sit squarely above their numbers.
   */
  statHeaders?: string[]
  /** Width of each numeric column (px). Default 34. */
  statWidth?: number
}

export function HorizontalBarChart({
  rows,
  labelWidth = 130,
  trackWidth = 220,
  chartColor = '#556b2f',
  sortDesc = true,
  limit,
  statHeaders,
  statWidth = 34,
}: HorizontalBarChartProps) {
  if (rows.length === 0) {
    // No italic: Inter is registered only in weights 400/600/700, so
    // fontStyle:'italic' throws "Could not resolve font" and aborts render.
    return (
      <Text style={{ fontSize: 9, color: '#888' }}>
        No data for this period.
      </Text>
    )
  }

  const sorted = sortDesc ? [...rows].sort((a, b) => b.value - a.value) : rows
  const limited = typeof limit === 'number' ? sorted.slice(0, limit) : sorted
  const max = Math.max(...limited.map(r => r.value), 1)

  const statCols = statHeaders?.length ?? 0

  return (
    <View>
      {statCols > 0 && (
        <View style={styles.statHeadRow}>
          <View style={{ width: labelWidth }} />
          <View style={{ width: trackWidth }} />
          {statHeaders!.map(h => (
            <Text key={h} style={[styles.statHeadText, { width: statWidth }]}>{h}</Text>
          ))}
        </View>
      )}
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
            {statCols > 0 ? (
              <>
                <Text style={[styles.valueText, styles.statCell, { width: statWidth }]}>
                  {r.value.toLocaleString('en-US')}
                </Text>
                {Array.from({ length: statCols - 1 }, (_, k) => (
                  <Text key={k} style={[styles.statCell, { width: statWidth }]}>
                    {r.stats?.[k] ?? '-'}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.valueText}>{r.value.toLocaleString('en-US')}</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}
