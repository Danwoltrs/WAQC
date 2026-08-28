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
import type { CvaDescriptorGroups } from '@/lib/cupping/cva-descriptors'
import { CertificateFlavorWheel } from './certificate-flavor-wheel'

// Charcoal color for in-spec values and lines
const CHARCOAL = '#333333'

const chartStyles = StyleSheet.create({
  container: {
    marginTop: 14,
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
  descriptorBand: {
    marginTop: 2,
    marginBottom: 8,
  },
  descriptorGroups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  descriptorGroup: {
    fontSize: 7.5,
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

/** Round a value to the nearest 0.25 for display */
function roundToQuarter(value: number): number {
  return Math.round(value * 4) / 4
}

/** Generate 5 visually clean tick values for a given scale range */
function getFixedTicks(min: number, max: number): number[] {
  // For common ranges, use hand-picked nice values
  if (min === 0 && max === 10) return [0, 2.5, 5, 7.5, 10]
  if (min === 1 && max === 10) return [1, 2.5, 5, 7.5, 10]
  if (min === 0 && max === 7) return [0, 1.75, 3.5, 5.25, 7]
  if (min === 1 && max === 7) return [1, 2.5, 4, 5.5, 7]
  if (min === 0 && max === 8) return [0, 2, 4, 6, 8]
  if (min === 1 && max === 8) return [1, 2.75, 4.5, 6.25, 8]
  // Fallback: 5 evenly spaced values rounded to nearest 0.25
  const step = (max - min) / 4
  return [0, 1, 2, 3, 4].map(i => roundToQuarter(min + i * step))
}

/**
 * One group of wheel selections, label stacked above the terms.
 *
 * Deliberately NOT label-and-terms on a single row: this column is narrow
 * (it shares the block with Faults/Taints), and an inline label left so
 * little room that react-pdf hyphenated the terms themselves — the first
 * render of this block printed "Flavour Choco-/late". Stacking gives the
 * terms the full column width and matches the Description block above.
 */
function DescriptorLine({ label, terms }: { label: string; terms: string[] }) {
  return (
    <View style={{ marginBottom: 2 }}>
      <Text style={{ fontSize: 6, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontSize: 7.5, color: COLORS.dark, fontWeight: 600 }}>
        {terms.join(', ')}
      </Text>
    </View>
  )
}

/**
 * The cupper's wheel picks, printed full width beneath the whole cupping block.
 *
 * Below everything rather than beside the wheel: the wheel now fills its column
 * edge to edge, and terms squeezed alongside it hyphenated mid-word. Across the
 * full 535pt they read as a caption to the wheel, and the group labels echo the
 * attribute names in the chart to its left.
 *
 * Label and terms share one line here — the stacked form this replaced existed
 * only to survive the narrow right-hand column, and at full width one line per
 * group halves the band, which is what keeps a heavily-described lot on a
 * single page. Groups wrap, so the band grows downward rather than off the page.
 */
function CvaDescriptorBand({ groups }: { groups: CvaDescriptorGroups }) {
  const entries: { label: string; terms: string[] }[] = [
    { label: 'Fragrance / Aroma', terms: groups.aroma },
    { label: 'Flavour / Aftertaste', terms: groups.flavor },
    { label: 'Mouthfeel', terms: groups.mouthfeel },
    { label: 'Basic taste', terms: groups.mainTastes },
  ].filter((entry) => entry.terms.length > 0)

  if (entries.length === 0) return null

  return (
    <View style={chartStyles.descriptorBand}>
      <Text style={chartStyles.title}>Flavour wheel</Text>
      <View style={chartStyles.descriptorGroups}>
        {entries.map((entry) => (
          <Text key={entry.label} style={chartStyles.descriptorGroup}>
            <Text style={{ color: COLORS.muted }}>{entry.label}: </Text>
            <Text style={{ color: COLORS.dark, fontWeight: 600 }}>{entry.terms.join(', ')}</Text>
          </Text>
        ))}
      </View>
    </View>
  )
}

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

  // Calculate score position using rounded display value
  const roundedScore = score !== null ? roundToQuarter(score) : null
  const scorePos = roundedScore !== null ? ((roundedScore - scaleMin) / range) * barWidth : null

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

  // Use fixed visually clean tick values
  const gridValues = getFixedTicks(scaleMin, scaleMax)
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
  flavorDescriptor?: string | null
  compact?: boolean
  /** What the cupper highlighted on the SCA flavour wheel, if anything. */
  cvaDescriptors?: CvaDescriptorGroups | null
  /**
   * True for a specialty (SCA CVA) lot. Two things change:
   *
   *  - the flavour wheel takes the place of the Clean Cup / Uniform Cup marks.
   *    CVA judges cup integrity by counting non-uniform and defective cups, and
   *    the score already carries that; the pair of ticks adds nothing a
   *    specialty buyer reads.
   *  - Faults / Taints are dropped. CVA has no fault or taint COUNT concept at
   *    all, so printing "None" asserts a measurement the protocol never made.
   *    Commodity certificates keep printing it, where "None" IS a finding.
   */
  isSpecialtyCva?: boolean
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
  flavorDescriptor,
  compact,
  cvaDescriptors,
  isSpecialtyCva = false,
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

  // Format a single defect detail as e.g. "Past crop - 12 cups at intensity level of 1"
  const formatDefectDetail = (d: { name: string; intensity: number | null; cups_affected?: number | null }): string => {
    const parts: string[] = []
    if (d.cups_affected != null && d.cups_affected > 0) {
      parts.push(`${d.cups_affected} cup${d.cups_affected === 1 ? '' : 's'}`)
    }
    if (d.intensity != null) {
      parts.push(`intensity level of ${d.intensity}`)
    }
    return parts.length > 0 ? `${d.name} - ${parts.join(' at ')}` : d.name
  }

  // Taints/faults out-of-spec checks
  const taintsOutOfSpec = maxTaints !== undefined && taints != null && taints > maxTaints
  const faultsOutOfSpec = maxFaults !== undefined && faults != null && faults > maxFaults

  return (
    <View>
    <View style={[chartStyles.container, compact ? { marginTop: 30 - 25 } : {}]}>
      {/* Attributes section (left) */}
      <View style={chartStyles.attributesSection}>
        {scaleGroups.map((group, groupIdx) => {
          const groupRange = group.scaleMax - group.scaleMin
          // All groups use the same bar width (100%) for visual consistency
          const headerBarWidth = MAX_BAR_WIDTH

          // Use fixed visually clean tick values for this group's header
          const headerGridValues = getFixedTicks(group.scaleMin, group.scaleMax)
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
                      {attr.score !== null && typeof attr.score === 'number' && !isNaN(attr.score) ? roundToQuarter(attr.score).toFixed(decimalPlaces) : '-'}
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
      <View style={[chartStyles.defectsSection, isSpecialtyCva ? { flex: 1 } : {}]}>
        {/* The flavour wheel takes this slot on a specialty certificate — see
            isSpecialtyCva. Rendered from the same geometry and colours as the
            wheel the cupper actually clicked. */}
        {isSpecialtyCva && cvaDescriptors && cvaDescriptors.paths.length > 0 && (
          /* Centred in the space left over beside the attributes chart: the
             column is only as wide as its widest child, so the wheel needs the
             section to claim the leftover width (flex: 1) before alignSelf can
             place it. Only the wheel is centred — anything else in this column
             stays left-aligned with the block above it. */
          <View style={{ marginBottom: 2, alignSelf: 'center' }}>
            <CertificateFlavorWheel paths={cvaDescriptors.paths} />
          </View>
        )}

        {/* Row 1: Clean Cup and Uniform Cup side by side */}
        {!isSpecialtyCva && (
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

        )}

        {/* Flavor Descriptor */}
        {flavorDescriptor && (
          <View style={{ marginTop: 6, marginBottom: 2 }}>
            <Text style={{ fontSize: 7, color: COLORS.muted, marginBottom: 1 }}>Description</Text>
            <Text style={{ fontSize: 8, color: COLORS.dark, fontWeight: 600 }}>{flavorDescriptor}</Text>
          </View>
        )}

        {/* What the cupper highlighted on the SCA flavour wheel. Only the most
            specific term of each pick is printed — see cvaDescriptors, which
            returns null when nothing was selected so no empty heading appears.
            Each group is omitted individually for the same reason. */}
        {cvaDescriptors && !isSpecialtyCva && (
          <View style={{ marginTop: 6, marginBottom: 2 }}>
            <Text style={{ fontSize: 7, color: COLORS.muted, marginBottom: 2 }}>Flavour wheel</Text>
            {cvaDescriptors.aroma.length > 0 && (
              <DescriptorLine label="Aroma" terms={cvaDescriptors.aroma} />
            )}
            {cvaDescriptors.flavor.length > 0 && (
              <DescriptorLine label="Flavour" terms={cvaDescriptors.flavor} />
            )}
            {cvaDescriptors.mouthfeel.length > 0 && (
              <DescriptorLine label="Mouthfeel" terms={cvaDescriptors.mouthfeel} />
            )}
            {cvaDescriptors.mainTastes.length > 0 && (
              <DescriptorLine label="Basic taste" terms={cvaDescriptors.mainTastes} />
            )}
          </View>
        )}

        {/* Row 2: Faults and Taints side by side — commodity only. */}
        {!isSpecialtyCva && (
        <View style={chartStyles.faultsTaintsRow}>
          {/* Faults column */}
          <View style={chartStyles.defectColumn}>
            <Text style={chartStyles.title}>Faults</Text>
            {faultDetails && faultDetails.length > 0 ? (
              faultDetails.map((fault, idx) => (
                <Text key={idx} style={faultsOutOfSpec ? { ...chartStyles.defectValue, color: COLORS.outOfSpec, fontWeight: 700 } : chartStyles.defectValue}>
                  {formatDefectDetail(fault)}
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
                  {formatDefectDetail(taint)}
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
        )}
      </View>
    </View>
    {isSpecialtyCva && cvaDescriptors && <CvaDescriptorBand groups={cvaDescriptors} />}
    </View>
  )
}
