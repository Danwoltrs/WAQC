/**
 * Certificate cupping chart component
 * Box plot visualization with validation ranges and rhombus score markers
 * 3-column layout: Attribute name | Validation bar | Score value
 */

import React from 'react'
import { View, Text, Svg, Rect, Path, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

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
    marginBottom: 8,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    minHeight: 18,
  },
  attributeName: {
    width: 80,
    fontSize: 8,
    color: COLORS.dark,
  },
  attributeNameAbbrev: {
    fontSize: 7,
    color: COLORS.muted,
  },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  validationText: {
    fontSize: 7,
    color: COLORS.muted,
    width: 35,
    textAlign: 'right',
    marginRight: 6,
  },
  scoreValue: {
    width: 28,
    fontSize: 9,
    fontWeight: 600,
    textAlign: 'right',
  },
  inSpec: {
    color: COLORS.inSpec,
  },
  outOfSpec: {
    color: COLORS.outOfSpec,
  },
  noScore: {
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    fontSize: 7,
    color: COLORS.muted,
  },
})

// Chart constants
const BAR_HEIGHT = 10
const BAR_WIDTH = 140
const RHOMBUS_SIZE = 4

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

interface BarChartProps {
  score: number | null
  validationRule?: ValidationRule | null
  scaleMin: number
  scaleMax: number
}

function BarChart({ score, validationRule, scaleMin, scaleMax }: BarChartProps) {
  const range = scaleMax - scaleMin
  if (range <= 0) return null

  // Calculate positions
  const scorePos = score !== null ? ((score - scaleMin) / range) * BAR_WIDTH : null

  // Calculate validation range positions
  let validMin = scaleMin
  let validMax = scaleMax

  if (validationRule) {
    validMin = validationRule.min_value
    if (validationRule.type === 'range' && validationRule.max_value !== undefined) {
      validMax = validationRule.max_value
    }
  }

  const validStartX = ((validMin - scaleMin) / range) * BAR_WIDTH
  const validEndX = ((validMax - scaleMin) / range) * BAR_WIDTH
  const validWidth = validEndX - validStartX

  // Check if score is in spec
  const isInSpec = score !== null && (
    validationRule
      ? (validationRule.type === 'minimum'
        ? score >= validationRule.min_value
        : score >= validationRule.min_value && (!validationRule.max_value || score <= validationRule.max_value))
      : true
  )

  return (
    <Svg width={BAR_WIDTH} height={BAR_HEIGHT + 4}>
      {/* Background track (full scale) */}
      <Rect
        x={0}
        y={(BAR_HEIGHT + 4 - 4) / 2}
        width={BAR_WIDTH}
        height={4}
        fill={COLORS.borderLight}
        rx={2}
      />

      {/* Validation range box (cream/tan color) */}
      {validationRule && (
        <Rect
          x={validStartX}
          y={(BAR_HEIGHT + 4 - 8) / 2}
          width={Math.max(validWidth, 4)}
          height={8}
          fill={COLORS.cream}
          rx={2}
        />
      )}

      {/* Score marker (rhombus) */}
      {score !== null && scorePos !== null && (
        <Path
          d={`M ${scorePos} ${(BAR_HEIGHT + 4) / 2 - RHOMBUS_SIZE}
              L ${scorePos + RHOMBUS_SIZE} ${(BAR_HEIGHT + 4) / 2}
              L ${scorePos} ${(BAR_HEIGHT + 4) / 2 + RHOMBUS_SIZE}
              L ${scorePos - RHOMBUS_SIZE} ${(BAR_HEIGHT + 4) / 2} Z`}
          fill={isInSpec ? COLORS.inSpec : COLORS.outOfSpec}
        />
      )}
    </Svg>
  )
}

function formatValidationText(rule: ValidationRule | null | undefined): string {
  if (!rule) return ''
  if (rule.type === 'minimum') {
    return `>=${rule.min_value}`
  }
  if (rule.type === 'range' && rule.max_value !== undefined) {
    return `${rule.min_value}-${rule.max_value}`
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
  showLegend = true,
}: CertificateCuppingChartProps) {
  if (!attributes || attributes.length === 0) {
    return null
  }

  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>Cupping Scores</Text>

      {attributes.map((attr, index) => {
        const attrScaleMin = attr.scaleMin ?? scaleMin
        const attrScaleMax = attr.scaleMax ?? scaleMax

        // Check if score is in spec
        const isInSpec = attr.score !== null && (
          attr.validationRule
            ? (attr.validationRule.type === 'minimum'
              ? attr.score >= attr.validationRule.min_value
              : attr.score >= attr.validationRule.min_value && (!attr.validationRule.max_value || attr.score <= attr.validationRule.max_value))
            : true
        )

        return (
          <View key={index} style={chartStyles.attributeRow}>
            {/* Attribute name */}
            <View style={chartStyles.attributeName}>
              <Text>{attr.abbreviation || attr.attribute}</Text>
              {attr.abbreviation && attr.abbreviation !== attr.attribute && (
                <Text style={chartStyles.attributeNameAbbrev}>
                  {attr.attribute.length > 15 ? attr.attribute.substring(0, 15) + '...' : ''}
                </Text>
              )}
            </View>

            {/* Bar container with validation text */}
            <View style={chartStyles.barContainer}>
              <Text style={chartStyles.validationText}>
                {formatValidationText(attr.validationRule)}
              </Text>
              <BarChart
                score={attr.score}
                validationRule={attr.validationRule}
                scaleMin={attrScaleMin}
                scaleMax={attrScaleMax}
              />
            </View>

            {/* Score value */}
            <Text
              style={[
                chartStyles.scoreValue,
                attr.score !== null
                  ? isInSpec
                    ? chartStyles.inSpec
                    : chartStyles.outOfSpec
                  : chartStyles.noScore,
              ]}
            >
              {attr.score !== null ? attr.score.toFixed(1) : '-'}
            </Text>
          </View>
        )
      })}

      {/* Total score row */}
      {totalScore != null && (
        <View style={[chartStyles.attributeRow, { borderTopWidth: 0.5, borderTopColor: COLORS.border, paddingTop: 6, marginTop: 4 }]}>
          <Text style={[chartStyles.attributeName, { fontWeight: 600 }]}>Total</Text>
          <View style={chartStyles.barContainer} />
          <Text style={[chartStyles.scoreValue, { fontWeight: 700, color: COLORS.dark }]}>
            {totalScore.toFixed(1)}
          </Text>
        </View>
      )}

      {/* Legend */}
      {showLegend && (
        <View style={chartStyles.legend}>
          <View style={chartStyles.legendItem}>
            <Svg width={10} height={10}>
              <Rect x={0} y={2} width={10} height={6} fill={COLORS.cream} rx={2} />
            </Svg>
            <Text style={chartStyles.legendText}>Spec range</Text>
          </View>
          <View style={chartStyles.legendItem}>
            <Svg width={10} height={10}>
              <Path
                d="M 5 1 L 9 5 L 5 9 L 1 5 Z"
                fill={COLORS.inSpec}
              />
            </Svg>
            <Text style={chartStyles.legendText}>In spec</Text>
          </View>
          <View style={chartStyles.legendItem}>
            <Svg width={10} height={10}>
              <Path
                d="M 5 1 L 9 5 L 5 9 L 1 5 Z"
                fill={COLORS.outOfSpec}
              />
            </Svg>
            <Text style={chartStyles.legendText}>Out of spec</Text>
          </View>
        </View>
      )}
    </View>
  )
}
