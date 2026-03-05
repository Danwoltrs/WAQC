/**
 * Certificate cupping chart component
 * Redesigned visualization with:
 * - "Attributes" title instead of "Cupping Scores"
 * - Attribute (spec) score format on left
 * - Proportional scale lines based on attribute ranges
 * - Charcoal/black diamonds for in-spec, red for out-of-spec
 * - Vertical tick marks showing scale range
 * - Scale numbers above the chart
 * - Clean Cup and Uniform Cup above Faults/Taints
 */

import React from 'react'
import { View, Text, Svg, Line, Path, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

// Charcoal color for in-spec values and lines
const CHARCOAL = '#333333'

const chartStyles = StyleSheet.create({
  container: {
    marginTop: 30,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  attributesSection: {
    paddingVertical: 6,
  },
  verticalSeparator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    marginVertical: 4,
    marginLeft: 8,
    marginRight: 8,
    alignSelf: 'stretch',
  },
  defectsSection: {
    flexDirection: 'column',
    paddingTop: 4,
    gap: 8,
  },
  cupStatusRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  faultsTaintsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  defectColumn: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
  },
  leftSection: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  attributeName: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  specText: {
    fontSize: 6,
    color: COLORS.muted,
    marginLeft: 1,
  },
  scoreValue: {
    fontSize: 9,
    fontWeight: 600,
    width: 28,
    textAlign: 'right',
    marginRight: 4,
  },
  chartSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scaleLabel: {
    fontSize: 5,
    color: COLORS.muted,
  },
  defectValue: {
    fontSize: 8,
    color: COLORS.dark,
  },
})

// Chart constants
const MAX_BAR_WIDTH = 160 // Maximum width for a 0-10 scale
const RHOMBUS_SIZE = 4
const TICK_HEIGHT = 5
const SPEC_TICK_HEIGHT = 9

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
}

// Light grid line color
const GRID_LINE_COLOR = '#E0E0E0'

function ScaleChart({ score, validationRule, scaleMin, scaleMax }: ScaleChartProps) {
  const range = scaleMax - scaleMin
  if (range <= 0) return null

  // All charts use full width regardless of scale range
  const barWidth = MAX_BAR_WIDTH

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

  // Generate grid values dynamically based on actual scale range
  // Create 5 evenly spaced values from scaleMin to scaleMax
  const gridCount = 5
  const gridStep = range / (gridCount - 1)
  const gridValues: number[] = []
  for (let i = 0; i < gridCount; i++) {
    const val = scaleMin + (i * gridStep)
    // Round to avoid floating point issues (e.g., 2.5 instead of 2.4999999)
    gridValues.push(Math.round(val * 10) / 10)
  }
  const gridPositions = gridValues.map(v => ((v - scaleMin) / range) * barWidth)

  // SVG height - fixed to match row height
  const svgHeight = 16
  const lineY = 8 // Center the line vertically

  // Add padding to prevent diamond clipping at edges
  const svgPadding = RHOMBUS_SIZE + 1
  const totalWidth = barWidth + svgPadding * 2

  return (
    <View style={{ flexDirection: 'column', minHeight: 16, justifyContent: 'center' }}>
      <Svg width={totalWidth} height={svgHeight}>
        {/* Light vertical grid lines */}
        {gridPositions.map((pos, idx) => (
          <Line
            key={idx}
            x1={pos + svgPadding}
            y1={0}
            x2={pos + svgPadding}
            y2={svgHeight}
            stroke={GRID_LINE_COLOR}
            strokeWidth={0.5}
          />
        ))}

        {/* Main horizontal line (charcoal) */}
        <Line
          x1={svgPadding}
          y1={lineY}
          x2={barWidth + svgPadding}
          y2={lineY}
          stroke={CHARCOAL}
          strokeWidth={1}
        />

        {/* Spec range min line (taller) */}
        {validationRule && (
          <Line
            x1={specMinX + svgPadding}
            y1={lineY - SPEC_TICK_HEIGHT / 2}
            x2={specMinX + svgPadding}
            y2={lineY + SPEC_TICK_HEIGHT / 2}
            stroke={CHARCOAL}
            strokeWidth={1}
          />
        )}

        {/* Spec range max line (taller) - for both range AND minimum types */}
        {validationRule && (
          <Line
            x1={specMaxX + svgPadding}
            y1={lineY - SPEC_TICK_HEIGHT / 2}
            x2={specMaxX + svgPadding}
            y2={lineY + SPEC_TICK_HEIGHT / 2}
            stroke={CHARCOAL}
            strokeWidth={1}
          />
        )}

        {/* Score marker (rhombus/diamond) */}
        {score !== null && scorePos !== null && (
          <Path
            d={`M ${scorePos + svgPadding} ${lineY - RHOMBUS_SIZE}
                L ${scorePos + svgPadding + RHOMBUS_SIZE} ${lineY}
                L ${scorePos + svgPadding} ${lineY + RHOMBUS_SIZE}
                L ${scorePos + svgPadding - RHOMBUS_SIZE} ${lineY} Z`}
            fill={isInSpec ? CHARCOAL : COLORS.outOfSpec}
          />
        )}
      </Svg>

      {/* Scale numbers rendered in header row, not duplicated here */}
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

interface DefectDetail {
  name: string
  intensity: number | null
  cups_affected?: number | null
}

export interface CertificateCuppingChartProps {
  attributes: CuppingAttribute[]
  totalScore?: number | null
  scaleMin?: number
  scaleMax?: number
  showLegend?: boolean
  faults?: number | null
  taints?: number | null
  faultDetails?: DefectDetail[]
  taintDetails?: DefectDetail[]
  cleanCup?: boolean | null
  uniformCup?: boolean | null
  // Spec limits
  maxTaints?: number
  maxFaults?: number
}

export function CertificateCuppingChart({
  attributes,
  scaleMin = 0,
  scaleMax = 10,
  faults,
  taints,
  faultDetails,
  taintDetails,
  cleanCup,
  uniformCup,
  maxTaints,
  maxFaults,
}: CertificateCuppingChartProps) {
  if (!attributes || attributes.length === 0) {
    return null
  }

  // Group attributes by scale range (e.g., 0-10 and 0-7)
  interface ScaleGroup {
    scaleMin: number
    scaleMax: number
    attrs: { attr: CuppingAttribute; originalIndex: number }[]
  }

  const groupMap = new Map<string, ScaleGroup>()
  attributes.forEach((attr, idx) => {
    const aMin = attr.scaleMin ?? scaleMin
    const aMax = attr.scaleMax ?? scaleMax
    const key = `${aMin}-${aMax}`
    if (!groupMap.has(key)) {
      groupMap.set(key, { scaleMin: aMin, scaleMax: aMax, attrs: [] })
    }
    groupMap.get(key)!.attrs.push({ attr, originalIndex: idx })
  })

  // Sort groups: largest range first
  const scaleGroups = Array.from(groupMap.values())
    .sort((a, b) => (b.scaleMax - b.scaleMin) - (a.scaleMax - a.scaleMin))

  // If any attribute has 2+ decimal places, show all with 2 decimals for consistency
  const hasMultiDecimal = attributes.some(attr => {
    if (attr.score === null) return false
    const str = String(attr.score)
    const dotIdx = str.indexOf('.')
    return dotIdx !== -1 && str.length - dotIdx - 1 >= 2
  })
  const decimalPlaces = hasMultiDecimal ? 2 : 1

  // Format faults and taints for display (numbers, 0 means none)
  const faultsDisplay = faults != null && faults > 0 ? String(faults) : 'None'
  const taintsDisplay = taints != null && taints > 0 ? String(taints) : 'None'

  // Taints/faults out-of-spec checks
  const taintsOutOfSpec = maxTaints !== undefined && taints != null && taints > maxTaints
  const faultsOutOfSpec = maxFaults !== undefined && faults != null && faults > maxFaults

  return (
    <View style={chartStyles.container}>
      {/* Attributes section (left) */}
      <View style={chartStyles.attributesSection}>
        {scaleGroups.map((group, groupIdx) => {
          const groupRange = group.scaleMax - group.scaleMin
          // All groups use the same bar width (100%) for visual consistency
          const headerBarWidth = MAX_BAR_WIDTH

          // Generate grid values for this group's header
          const gridCount = 5
          const gridStep = groupRange / (gridCount - 1)
          const headerGridValues: number[] = []
          for (let i = 0; i < gridCount; i++) {
            const val = group.scaleMin + (i * gridStep)
            headerGridValues.push(Math.round(val * 10) / 10)
          }
          const headerGridPositions = headerGridValues.map(
            v => ((v - group.scaleMin) / groupRange) * headerBarWidth
          )

          return (
            <View key={groupIdx}>
              {/* Scale header row for this group */}
              <View style={[chartStyles.attributeRow, { height: 12, marginTop: groupIdx > 0 ? 6 : 0 }]}>
                <View style={chartStyles.leftSection} />
                {/* Spacer matching scoreValue width + marginRight */}
                <View style={{ width: 32 }} />
                <View style={chartStyles.chartSection}>
                  <View style={{ flexDirection: 'row', width: headerBarWidth + (RHOMBUS_SIZE + 1) * 2, height: 10 }}>
                    {headerGridValues.map((val, idx) => {
                      const textWidth = String(val).length * 3
                      const offset = textWidth / 2
                      return (
                        <Text
                          key={idx}
                          style={[
                            chartStyles.scaleLabel,
                            {
                              position: 'absolute',
                              left: headerGridPositions[idx] + (RHOMBUS_SIZE + 1) - offset,
                            }
                          ]}
                        >
                          {val}
                        </Text>
                      )
                    })}
                  </View>
                </View>
              </View>

              {/* Attributes in this scale group */}
              {group.attrs.map(({ attr, originalIndex }) => {
                const attrScaleMin = attr.scaleMin ?? scaleMin
                const attrScaleMax = attr.scaleMax ?? scaleMax

                const isInSpec = attr.score !== null && (
                  attr.validationRule
                    ? (attr.validationRule.type === 'minimum'
                      ? attr.score >= attr.validationRule.min_value
                      : attr.score >= attr.validationRule.min_value && (!attr.validationRule.max_value || attr.score <= attr.validationRule.max_value))
                    : true
                )

                const displayName = attr.abbreviation || attr.attribute

                return (
                  <View key={originalIndex} style={chartStyles.attributeRow}>
                    <View style={chartStyles.leftSection}>
                      <Text style={chartStyles.attributeName}>{displayName}</Text>
                      <Text style={chartStyles.specText}>
                        {formatSpecText(attr.validationRule)}
                      </Text>
                    </View>

                    <Text
                      style={[
                        chartStyles.scoreValue,
                        { color: attr.score !== null && !isInSpec ? COLORS.outOfSpec : COLORS.dark },
                      ]}
                    >
                      {attr.score !== null && typeof attr.score === 'number' && !isNaN(attr.score) ? attr.score.toFixed(decimalPlaces) : '-'}
                    </Text>

                    <View style={chartStyles.chartSection}>
                      <ScaleChart
                        score={attr.score}
                        validationRule={attr.validationRule}
                        scaleMin={attrScaleMin}
                        scaleMax={attrScaleMax}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )
        })}
      </View>

      {/* Vertical separator */}
      <View style={chartStyles.verticalSeparator} />

      {/* Right section: Clean/Uniform Cup (side by side, above) + Faults/Taints (below) */}
      <View style={chartStyles.defectsSection}>
        {/* Row 1: Clean Cup and Uniform Cup side by side */}
        <View style={chartStyles.cupStatusRow}>
          {/* Clean Cup */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width={10} height={10} viewBox="0 0 14 14" style={{ marginRight: 4 }}>
              {cleanCup === true ? (
                <Path
                  d="M 2 7 L 5.5 10.5 L 12 4"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : cleanCup === false ? (
                <Path
                  d="M 3 3 L 11 11 M 11 3 L 3 11"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <Path
                  d="M 7 1 C 3.69 1 1 3.69 1 7 C 1 10.31 3.69 13 7 13 C 10.31 13 13 10.31 13 7 C 13 3.69 10.31 1 7 1"
                  stroke={COLORS.muted}
                  strokeWidth={1.5}
                  fill="none"
                />
              )}
            </Svg>
            <Text style={{ fontSize: 7, color: COLORS.dark }}>Clean Cup</Text>
          </View>

          {/* Uniform Cup */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Svg width={10} height={10} viewBox="0 0 14 14" style={{ marginRight: 4 }}>
              {uniformCup === true ? (
                <Path
                  d="M 2 7 L 5.5 10.5 L 12 4"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : uniformCup === false ? (
                <Path
                  d="M 3 3 L 11 11 M 11 3 L 3 11"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <Path
                  d="M 7 1 C 3.69 1 1 3.69 1 7 C 1 10.31 3.69 13 7 13 C 10.31 13 13 10.31 13 7 C 13 3.69 10.31 1 7 1"
                  stroke={COLORS.muted}
                  strokeWidth={1.5}
                  fill="none"
                />
              )}
            </Svg>
            <Text style={{ fontSize: 7, color: COLORS.dark }}>Uniform Cup</Text>
          </View>
        </View>

        {/* Row 2: Faults and Taints side by side */}
        <View style={chartStyles.faultsTaintsRow}>
          {/* Faults column */}
          <View style={chartStyles.defectColumn}>
            <Text style={chartStyles.title}>Faults</Text>
            {faultDetails && faultDetails.length > 0 ? (
              faultDetails.map((fault, idx) => (
                <Text key={idx} style={faultsOutOfSpec ? { ...chartStyles.defectValue, color: COLORS.outOfSpec, fontWeight: 700 } : chartStyles.defectValue}>
                  {fault.name}{fault.intensity ? ` (${fault.intensity})` : ''}
                </Text>
              ))
            ) : (
              <Text style={faultsOutOfSpec ? { ...chartStyles.defectValue, color: COLORS.outOfSpec, fontWeight: 700 } : chartStyles.defectValue}>
                {faultsDisplay}
              </Text>
            )}
            {faultsOutOfSpec && (
              <Text style={{ fontSize: 6, color: COLORS.outOfSpec }}>(max {maxFaults})</Text>
            )}
          </View>

          {/* Taints column */}
          <View style={chartStyles.defectColumn}>
            <Text style={chartStyles.title}>Taints</Text>
            {taintDetails && taintDetails.length > 0 ? (
              taintDetails.map((taint, idx) => (
                <Text key={idx} style={taintsOutOfSpec ? { ...chartStyles.defectValue, color: COLORS.outOfSpec, fontWeight: 700 } : chartStyles.defectValue}>
                  {taint.name}{taint.intensity ? ` (${taint.intensity})` : ''}
                </Text>
              ))
            ) : (
              <Text style={taintsOutOfSpec ? { ...chartStyles.defectValue, color: COLORS.outOfSpec, fontWeight: 700 } : chartStyles.defectValue}>
                {taintsDisplay}
              </Text>
            )}
            {taintsOutOfSpec && (
              <Text style={{ fontSize: 6, color: COLORS.outOfSpec }}>(max {maxTaints})</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
