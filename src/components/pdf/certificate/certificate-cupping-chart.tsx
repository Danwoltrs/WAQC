/**
 * Certificate cupping chart component
 * Redesigned visualization with:
 * - "Attributes" title instead of "Cupping Scores"
 * - Attribute (spec) score format on left
 * - Proportional scale lines based on attribute ranges
 * - Charcoal/black diamonds for in-spec, red for out-of-spec
 * - Vertical tick marks showing scale range
 */

import React from 'react'
import { View, Text, Svg, Line, Path, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

// Charcoal color for in-spec values and lines
const CHARCOAL = '#333333'

const chartStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
  },
  title: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    minHeight: 14,
  },
  leftSection: {
    width: 130,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  attributeName: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  specText: {
    fontSize: 7,
    color: COLORS.muted,
    marginLeft: 2,
  },
  scoreValue: {
    fontSize: 9,
    fontWeight: 600,
    marginLeft: 4,
  },
  chartSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  scaleLabel: {
    fontSize: 6,
    color: COLORS.muted,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    paddingTop: 4,
    marginTop: 2,
  },
  totalLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    width: 130,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.dark,
  },
})

// Chart constants
const MAX_BAR_WIDTH = 160 // Maximum width for a 0-10 scale
const BAR_HEIGHT = 12
const RHOMBUS_SIZE = 4
const TICK_HEIGHT = 6
const SPEC_TICK_HEIGHT = 10

interface ValidationRule {
  type: 'minimum' | 'range'
  min_value: number
  max_value?: number
}

interface CuppingAttribute {
  attribute: string
  abbreviation?: string
  score: number | null
  validationRule?: ValidationRule | null
  scaleMin?: number
  scaleMax?: number
}

interface ScaleChartProps {
  score: number | null
  validationRule?: ValidationRule | null
  scaleMin: number
  scaleMax: number
  globalMaxScale: number
}

function ScaleChart({ score, validationRule, scaleMin, scaleMax, globalMaxScale }: ScaleChartProps) {
  const range = scaleMax - scaleMin
  if (range <= 0) return null

  // Calculate proportional width based on range relative to global max
  const proportionalWidth = (range / globalMaxScale) * MAX_BAR_WIDTH
  const barWidth = Math.max(proportionalWidth, 60) // Minimum width of 60

  // Calculate score position
  const scorePos = score !== null ? ((score - scaleMin) / range) * barWidth : null

  // Calculate spec range positions
  let specMinValue = scaleMin
  let specMaxValue = scaleMax

  if (validationRule) {
    specMinValue = validationRule.min_value
    if (validationRule.type === 'range' && validationRule.max_value !== undefined) {
      specMaxValue = validationRule.max_value
    } else {
      // For minimum type, the max is the scale max
      specMaxValue = scaleMax
    }
  }

  const specMinX = ((specMinValue - scaleMin) / range) * barWidth
  const specMaxX = ((specMaxValue - scaleMin) / range) * barWidth

  // Check if score is in spec
  const isInSpec = score !== null && (
    validationRule
      ? (validationRule.type === 'minimum'
        ? score >= validationRule.min_value
        : score >= validationRule.min_value && (!validationRule.max_value || score <= validationRule.max_value))
      : true
  )

  // Calculate tick positions for start, middle, and end
  const midValue = (scaleMin + scaleMax) / 2
  const midX = ((midValue - scaleMin) / range) * barWidth

  const svgHeight = 20
  const centerY = svgHeight / 2

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {/* Min scale label */}
      <Text style={[chartStyles.scaleLabel, { marginRight: 2, width: 10, textAlign: 'right' }]}>
        {scaleMin}
      </Text>

      <Svg width={barWidth} height={svgHeight}>
        {/* Main horizontal line (charcoal) */}
        <Line
          x1={0}
          y1={centerY}
          x2={barWidth}
          y2={centerY}
          stroke={CHARCOAL}
          strokeWidth={1}
        />

        {/* Start tick mark */}
        <Line
          x1={0}
          y1={centerY - TICK_HEIGHT / 2}
          x2={0}
          y2={centerY + TICK_HEIGHT / 2}
          stroke={CHARCOAL}
          strokeWidth={1}
        />

        {/* Middle tick mark */}
        <Line
          x1={midX}
          y1={centerY - TICK_HEIGHT / 2}
          x2={midX}
          y2={centerY + TICK_HEIGHT / 2}
          stroke={CHARCOAL}
          strokeWidth={0.5}
        />

        {/* End tick mark */}
        <Line
          x1={barWidth}
          y1={centerY - TICK_HEIGHT / 2}
          x2={barWidth}
          y2={centerY + TICK_HEIGHT / 2}
          stroke={CHARCOAL}
          strokeWidth={1}
        />

        {/* Spec range min line (taller) */}
        {validationRule && (
          <Line
            x1={specMinX}
            y1={centerY - SPEC_TICK_HEIGHT / 2}
            x2={specMinX}
            y2={centerY + SPEC_TICK_HEIGHT / 2}
            stroke={CHARCOAL}
            strokeWidth={1}
          />
        )}

        {/* Spec range max line (taller) - only for range type */}
        {validationRule && validationRule.type === 'range' && validationRule.max_value !== undefined && (
          <Line
            x1={specMaxX}
            y1={centerY - SPEC_TICK_HEIGHT / 2}
            x2={specMaxX}
            y2={centerY + SPEC_TICK_HEIGHT / 2}
            stroke={CHARCOAL}
            strokeWidth={1}
          />
        )}

        {/* Score marker (rhombus/diamond) */}
        {score !== null && scorePos !== null && (
          <Path
            d={`M ${scorePos} ${centerY - RHOMBUS_SIZE}
                L ${scorePos + RHOMBUS_SIZE} ${centerY}
                L ${scorePos} ${centerY + RHOMBUS_SIZE}
                L ${scorePos - RHOMBUS_SIZE} ${centerY} Z`}
            fill={isInSpec ? CHARCOAL : COLORS.outOfSpec}
          />
        )}
      </Svg>

      {/* Max scale label */}
      <Text style={[chartStyles.scaleLabel, { marginLeft: 2, width: 12 }]}>
        {scaleMax}
      </Text>
    </View>
  )
}

function formatSpecText(rule: ValidationRule | null | undefined): string {
  if (!rule) return ''
  if (rule.type === 'minimum') {
    return `(>=${rule.min_value})`
  }
  if (rule.type === 'range' && rule.max_value !== undefined) {
    // Calculate center and tolerance for +/- format
    const center = (rule.min_value + rule.max_value) / 2
    const tolerance = (rule.max_value - rule.min_value) / 2
    // Check if it's a clean +/- format
    if (tolerance === Math.floor(tolerance)) {
      return `(${center} +/-${tolerance})`
    }
    // Otherwise show as range
    return `(${rule.min_value}-${rule.max_value})`
  }
  return ''
}

export interface CertificateCuppingChartProps {
  attributes: CuppingAttribute[]
  totalScore?: number | null
  scaleMin?: number
  scaleMax?: number
  showLegend?: boolean
}

export function CertificateCuppingChart({
  attributes,
  totalScore,
  scaleMin = 0,
  scaleMax = 10,
}: CertificateCuppingChartProps) {
  if (!attributes || attributes.length === 0) {
    return null
  }

  // Find the maximum scale range for proportional sizing
  const globalMaxScale = Math.max(
    ...attributes.map(attr => {
      const attrMax = attr.scaleMax ?? scaleMax
      const attrMin = attr.scaleMin ?? scaleMin
      return attrMax - attrMin
    })
  )

  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>Attributes</Text>

      {attributes.map((attr, index) => {
        const attrScaleMin = attr.scaleMin ?? scaleMin
        const attrScaleMax = attr.scaleMax ?? scaleMax

        // Check if score is in spec (only matters for color - red if out of spec)
        const isInSpec = attr.score !== null && (
          attr.validationRule
            ? (attr.validationRule.type === 'minimum'
              ? attr.score >= attr.validationRule.min_value
              : attr.score >= attr.validationRule.min_value && (!attr.validationRule.max_value || attr.score <= attr.validationRule.max_value))
            : true
        )

        const displayName = attr.abbreviation || attr.attribute

        return (
          <View key={index} style={chartStyles.attributeRow}>
            {/* Left section: Attribute (spec) score */}
            <View style={chartStyles.leftSection}>
              <Text style={chartStyles.attributeName}>{displayName}</Text>
              <Text style={chartStyles.specText}>
                {formatSpecText(attr.validationRule)}
              </Text>
              <Text
                style={[
                  chartStyles.scoreValue,
                  // Only red for out-of-spec, otherwise dark/black
                  { color: attr.score !== null && !isInSpec ? COLORS.outOfSpec : COLORS.dark },
                ]}
              >
                {attr.score !== null ? attr.score.toFixed(attr.score % 1 === 0 ? 1 : 2) : '-'}
              </Text>
            </View>

            {/* Right section: Scale chart */}
            <View style={chartStyles.chartSection}>
              <ScaleChart
                score={attr.score}
                validationRule={attr.validationRule}
                scaleMin={attrScaleMin}
                scaleMax={attrScaleMax}
                globalMaxScale={globalMaxScale}
              />
            </View>
          </View>
        )
      })}

      {/* Total score row */}
      {totalScore != null && (
        <View style={chartStyles.totalRow}>
          <Text style={chartStyles.totalLabel}>Total</Text>
          <Text style={chartStyles.totalValue}>
            {totalScore.toFixed(1)}
          </Text>
        </View>
      )}
    </View>
  )
}
