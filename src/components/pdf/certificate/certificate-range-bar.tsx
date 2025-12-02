/**
 * Range bar SVG component for certificate cupping score visualization
 * Shows the allowed range as a box and the actual score as a marker
 */

import React from 'react'
import { Svg, Rect, Circle, G } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

interface RangeBarProps {
  value: number // Actual score
  rangeMin: number // Min allowed from quality spec
  rangeMax: number // Max allowed from quality spec
  scaleMin?: number // Scale start (default 0)
  scaleMax?: number // Scale end (default 10)
  width?: number // Bar width (default 100)
  height?: number // Bar height (default 12)
}

/**
 * Converts a value to X position on the bar
 */
function valueToX(value: number, scaleMin: number, scaleMax: number, width: number): number {
  const range = scaleMax - scaleMin
  const normalized = (value - scaleMin) / range
  return Math.max(0, Math.min(width, normalized * width))
}

/**
 * RangeBar component - SVG visualization of score within allowed range
 *
 * Layout:
 * [------------------TRACK------------------]
 *       [=====ALLOWED RANGE=====]
 *                   (*)  <- Score marker
 */
export function RangeBar({
  value,
  rangeMin,
  rangeMax,
  scaleMin = 0,
  scaleMax = 10,
  width = 100,
  height = 12,
}: RangeBarProps) {
  const trackHeight = 4
  const trackY = (height - trackHeight) / 2
  const rangeHeight = 8
  const rangeY = (height - rangeHeight) / 2
  const markerRadius = 4

  // Calculate positions
  const rangeStartX = valueToX(rangeMin, scaleMin, scaleMax, width)
  const rangeEndX = valueToX(rangeMax, scaleMin, scaleMax, width)
  const rangeWidth = rangeEndX - rangeStartX
  const scoreX = valueToX(value, scaleMin, scaleMax, width)

  // Determine if score is within spec
  const isInSpec = value >= rangeMin && value <= rangeMax
  const markerColor = isInSpec ? COLORS.inSpec : COLORS.outOfSpec

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <G>
        {/* Background track */}
        <Rect
          x={0}
          y={trackY}
          width={width}
          height={trackHeight}
          fill={COLORS.border}
          rx={2}
          ry={2}
        />

        {/* Allowed range box */}
        <Rect
          x={rangeStartX}
          y={rangeY}
          width={rangeWidth}
          height={rangeHeight}
          fill={COLORS.cream}
          stroke={COLORS.accent}
          strokeWidth={0.5}
          rx={2}
          ry={2}
        />

        {/* Score marker */}
        <Circle
          cx={scoreX}
          cy={height / 2}
          r={markerRadius}
          fill={markerColor}
        />

        {/* Score marker border for visibility */}
        <Circle
          cx={scoreX}
          cy={height / 2}
          r={markerRadius}
          fill="none"
          stroke={COLORS.white}
          strokeWidth={0.5}
        />
      </G>
    </Svg>
  )
}

/**
 * Horizontal bar for defect count visualization
 */
interface DefectBarProps {
  count: number
  maxCount: number
  width?: number
  height?: number
  color?: string
}

export function DefectBar({
  count,
  maxCount,
  width = 80,
  height = 10,
  color = COLORS.accent,
}: DefectBarProps) {
  const barWidth = maxCount > 0 ? (count / maxCount) * width : 0
  const trackHeight = 6
  const trackY = (height - trackHeight) / 2

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <G>
        {/* Background track */}
        <Rect
          x={0}
          y={trackY}
          width={width}
          height={trackHeight}
          fill={COLORS.borderLight}
          rx={2}
          ry={2}
        />

        {/* Filled bar */}
        {barWidth > 0 && (
          <Rect
            x={0}
            y={trackY}
            width={barWidth}
            height={trackHeight}
            fill={color}
            rx={2}
            ry={2}
          />
        )}
      </G>
    </Svg>
  )
}
