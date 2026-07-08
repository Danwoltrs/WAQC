/**
 * Donut chart for PDF reports.
 *
 * Pure SVG arcs computed inline — no chart library needed. Used for
 * the sample-type / approval-status breakdown on page 1 of the report.
 *
 * Renders a center label (e.g. total count) and an inline legend below
 * with color swatches.
 */

import React from 'react'
import { View, Text, Svg, Path, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#151618',
  },
  centerLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: 8, color: '#444' },
})

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  slices: DonutSlice[]
  /** Diameter in px. Default 120. */
  size?: number
  /** Inner cut radius as fraction of outer (0..1). Default 0.6. */
  innerRatio?: number
  /** Center value text. */
  centerValue?: string | number
  /** Center sub-label. */
  centerLabel?: string
  /** Render a legend below the chart. Default true. */
  showLegend?: boolean
}

export function DonutChart({
  slices,
  size = 120,
  innerRatio = 0.6,
  centerValue,
  centerLabel,
  showLegend = true,
}: DonutChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2
  const rInner = rOuter * innerRatio

  if (total === 0) {
    return (
      <View style={[styles.wrapper, { width: size, height: size, justifyContent: 'center' }]}>
        {/* No italic: Inter has no italic variant registered → render abort. */}
        <Text style={{ fontSize: 9, color: '#888' }}>No data</Text>
      </View>
    )
  }

  // Build arc segments. Start at 12 o'clock and walk clockwise.
  let startAngle = -Math.PI / 2
  const segments = slices
    .filter(s => s.value > 0)
    .map(s => {
      const angle = (s.value / total) * Math.PI * 2
      const endAngle = startAngle + angle
      const path = arcPath(cx, cy, rOuter, rInner, startAngle, endAngle)
      startAngle = endAngle
      return { ...s, path }
    })

  return (
    <View style={styles.wrapper}>
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((seg, i) => (
            <Path key={i} d={seg.path} fill={seg.color} />
          ))}
        </Svg>
        {(centerValue !== undefined || centerLabel) && (
          <View style={styles.centerOverlay}>
            {centerValue !== undefined ? (
              <Text style={styles.centerValue}>
                {typeof centerValue === 'number' ? centerValue.toLocaleString('en-US') : centerValue}
              </Text>
            ) : null}
            {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
          </View>
        )}
      </View>

      {showLegend && (
        <View style={styles.legend}>
          {slices.filter(s => s.value > 0).map(s => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendLabel}>
                {s.label} ({Math.round((s.value / total) * 100)}%)
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

/**
 * SVG path for an annular sector (donut wedge).
 *
 * Two arcs (outer + inner) joined by straight lines. Uses the
 * large-arc flag when the wedge sweeps >180° so single-slice donuts
 * (e.g. 100% approval) render correctly.
 */
function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  // Guard against full-circle paths — SVG can't represent a 360° arc
  // as one command. Subtract a tiny epsilon and let the renderer close
  // the gap visually with antialiasing.
  const sweep = endAngle - startAngle
  if (sweep >= Math.PI * 2 - 1e-6) {
    return fullDonutPath(cx, cy, rOuter, rInner)
  }
  const largeArc = sweep > Math.PI ? 1 : 0

  const x1 = cx + rOuter * Math.cos(startAngle)
  const y1 = cy + rOuter * Math.sin(startAngle)
  const x2 = cx + rOuter * Math.cos(endAngle)
  const y2 = cy + rOuter * Math.sin(endAngle)
  const x3 = cx + rInner * Math.cos(endAngle)
  const y3 = cy + rInner * Math.sin(endAngle)
  const x4 = cx + rInner * Math.cos(startAngle)
  const y4 = cy + rInner * Math.sin(startAngle)

  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

function fullDonutPath(cx: number, cy: number, rOuter: number, rInner: number): string {
  // Two concentric circles, outer clockwise + inner counter-clockwise
  // so the even-odd fill rule punches the center hole.
  return [
    `M ${cx - rOuter} ${cy}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy}`,
    'Z',
    `M ${cx - rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}`,
    'Z',
  ].join(' ')
}
