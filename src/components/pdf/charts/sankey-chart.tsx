/**
 * Sankey chart for PDF reports.
 *
 * Takes a pre-computed layout (see `src/lib/charts/sankey-layout.ts`)
 * and renders it with @react-pdf/renderer's SVG primitives. The layout
 * step lives outside React so the same math can be reused by other
 * consumers (e.g. CSV exporters) and is unit-testable.
 *
 * Column captions ("Exporter", "Importer", "Roaster") sit above the
 * chart so the recipient can read the flow without a legend.
 *
 * Note: @react-pdf/renderer exports a single `Text` component that's
 * dual-purpose — it renders as layout text outside <Svg> and as an SVG
 * text element when nested inside <Svg>. We use it both ways here.
 */

import React from 'react'
import { View, Text, Svg, G, Rect, Path, StyleSheet } from '@react-pdf/renderer'
import type { SankeyLayoutResult } from '@/lib/charts/sankey-layout'

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  captionLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: '#444',
  },
})

interface SankeyChartProps {
  layout: SankeyLayoutResult
  /** Column labels left → right. Length must match the highest column
   *  index used by the layout (e.g. 4 entries for a Shipper / Seller /
   *  Importer / Roaster chart, 2 entries for a Shipper / Seller chart). */
  columnLabels: string[]
  /** Bold node-label text. Default true. */
  showNodeLabels?: boolean
  /** Show node values (bag totals) next to labels. Default true. */
  showNodeValues?: boolean
}

export function SankeyChart({
  layout,
  columnLabels,
  showNodeLabels = true,
  showNodeValues = true,
}: SankeyChartProps) {
  const { width, height, nodes, links } = layout

  if (nodes.length === 0 || links.length === 0) {
    return (
      <View style={[styles.wrapper, { width, height, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 10, color: '#888' }}>
          Not enough supply-chain data to draw a Sankey for this period.
        </Text>
      </View>
    )
  }

  // Find the x-center of each column for the caption labels. Computed
  // from actual node positions so captions land above their column even
  // when one column is empty.
  const colCenters: Array<number | null> = columnLabels.map(() => null)
  for (const n of nodes) {
    if (n.column >= colCenters.length) continue
    const center = (n.x0 + n.x1) / 2
    if (colCenters[n.column] === null) colCenters[n.column] = center
  }

  return (
    <View style={[styles.wrapper, { width }]}>
      {/* Column captions — absolutely-positioned spans aligned to x-centers */}
      <View style={{ height: 14, position: 'relative', marginBottom: 2 }}>
        {colCenters.map((cx, i) => {
          if (cx === null) return null
          return (
            <Text
              key={i}
              style={[
                styles.captionLabel,
                {
                  position: 'absolute',
                  // Center on the column by offsetting half a fixed width.
                  left: cx - 24,
                  width: 48,
                  textAlign: 'center',
                },
              ]}
            >
              {columnLabels[i]}
            </Text>
          )
        })}
      </View>

      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Links first so node rects render on top of stroke ends. */}
        <G>
          {links.map((l, i) => (
            <Path
              key={`link-${i}`}
              d={l.path}
              stroke={l.stroke}
              strokeOpacity={l.strokeOpacity}
              strokeWidth={l.width}
              fill="none"
            />
          ))}
        </G>

        <G>
          {nodes.map(n => (
            <Rect
              key={`node-${n.id}`}
              x={n.x0}
              y={n.y0}
              width={Math.max(1, n.x1 - n.x0)}
              height={Math.max(1, n.y1 - n.y0)}
              fill={n.fill}
            />
          ))}
        </G>

        {/* Labels — left columns label-right of node, right column
            label-left. Keeps text within the chart bounds. */}
        {showNodeLabels && (
          <G>
            {nodes.map(n => {
              const isLast = n.column === columnLabels.length - 1
              const x = isLast ? n.x0 - 4 : n.x1 + 4
              const y = (n.y0 + n.y1) / 2
              const anchor = isLast ? 'end' : 'start'
              const valueLabel = showNodeValues
                ? ` (${Math.round(n.value).toLocaleString('en-US')})`
                : ''
              // @react-pdf SVG Text aligns to its y baseline, not center.
              // Nudge y down by ~3px (half cap-height of 8pt) so the label
              // visually centers on the node row.
              return (
                <Text
                  key={`label-${n.id}`}
                  x={x}
                  y={y + 3}
                  style={{ fontSize: 8, fill: '#222', fontFamily: 'Inter' }}
                  textAnchor={anchor}
                >
                  {`${n.label}${valueLabel}`}
                </Text>
              )
            })}
          </G>
        )}
      </Svg>

      {/* Legend below the chart — same color bands the dashboard uses. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
        <LegendDot color="#556b2f" label="≥ 90%" />
        <LegendDot color="#a9a454" label="70–89%" />
        <LegendDot color="#ef4444" label="< 70%" />
        <Text style={{ fontSize: 8, color: '#666' }}>approval rate</Text>
      </View>
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, backgroundColor: color, borderRadius: 2 }} />
      <Text style={{ fontSize: 8, color: '#444' }}>{label}</Text>
    </View>
  )
}
