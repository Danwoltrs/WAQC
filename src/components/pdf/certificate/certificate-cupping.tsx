/**
 * Certificate cupping component
 * Adaptive layout: Cupping (2/3) + Roast Analysis (1/3) when roast exists
 * Full width for cupping when no roast analysis
 * Minimalistic display: Attribute | Range | Score (no visual bars)
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { CuppingData, CuppingAttribute, RoastAnalysis } from '@/lib/certificate-data'

const cuppingStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  adaptiveRow: {
    flexDirection: 'row',
    gap: 16,
  },
  cuppingColumn: {
    flex: 2,
  },
  cuppingColumnFull: {
    flex: 1,
  },
  roastColumn: {
    flex: 1,
    paddingLeft: 12,
    borderLeftWidth: 0.5,
    borderLeftColor: COLORS.borderLight,
  },
  // Cupping table
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 3,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  colAttribute: {
    flex: 2,
  },
  colRange: {
    flex: 1,
    textAlign: 'center',
  },
  colScore: {
    flex: 1,
    textAlign: 'right',
  },
  headerText: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  attributeName: {
    fontSize: 9,
    color: COLORS.dark,
  },
  rangeText: {
    fontSize: 8,
    color: COLORS.muted,
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
  },
  scoreOutOfSpec: {
    color: COLORS.rejected,
  },
  finalScoreContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  finalScoreLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
    marginRight: 12,
  },
  finalScoreValue: {
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.primary,
  },
  // Roast section
  roastTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  roastItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  roastLabel: {
    fontSize: 8,
    color: COLORS.muted,
  },
  roastValue: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  emptyText: {
    fontSize: 9,
    color: COLORS.mutedLight,
    textAlign: 'center',
    paddingVertical: 20,
  },
  commentsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  commentsLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 4,
  },
  commentsText: {
    fontSize: 9,
    color: COLORS.dark,
  },
})

// Format range as center±tolerance
function formatRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return '-'
  const center = (min + max) / 2
  const tolerance = (max - min) / 2
  // Use integer if tolerance is whole number
  const toleranceStr = tolerance % 1 === 0 ? tolerance.toString() : tolerance.toFixed(1)
  return `(${center.toFixed(1)}±${toleranceStr})`
}

// Check if score is within spec range
function isInSpec(score: number, min: number | null, max: number | null): boolean {
  if (min === null || max === null) return true // No spec means always in spec
  return score >= min && score <= max
}

interface AttributeRowProps {
  attribute: CuppingAttribute
  showRange: boolean
}

function AttributeRow({ attribute, showRange }: AttributeRowProps) {
  const { name, score, allowedMin, allowedMax } = attribute
  const inSpec = isInSpec(score, allowedMin, allowedMax)

  return (
    <View style={cuppingStyles.tableRow}>
      <View style={cuppingStyles.colAttribute}>
        <Text style={cuppingStyles.attributeName}>{name}</Text>
      </View>

      <View style={cuppingStyles.colRange}>
        {showRange && allowedMin !== null && allowedMax !== null ? (
          <Text style={cuppingStyles.rangeText}>
            {formatRange(allowedMin, allowedMax)}
          </Text>
        ) : (
          <Text style={cuppingStyles.rangeText}>-</Text>
        )}
      </View>

      <View style={cuppingStyles.colScore}>
        <Text
          style={[
            cuppingStyles.scoreText,
            !inSpec && showRange ? cuppingStyles.scoreOutOfSpec : {},
          ]}
        >
          {score.toFixed(2)}
        </Text>
      </View>
    </View>
  )
}

interface RoastSectionProps {
  roast: RoastAnalysis | null
}

function RoastSection({ roast }: RoastSectionProps) {
  if (!roast) return null

  return (
    <View>
      <Text style={cuppingStyles.roastTitle}>Roast Analysis</Text>

      {roast.agtron_score !== null && (
        <View style={cuppingStyles.roastItem}>
          <Text style={cuppingStyles.roastLabel}>Agtron:</Text>
          <Text style={cuppingStyles.roastValue}>{roast.agtron_score}</Text>
        </View>
      )}

      {roast.quaker_count !== null && (
        <View style={cuppingStyles.roastItem}>
          <Text style={cuppingStyles.roastLabel}>Quakers:</Text>
          <Text style={cuppingStyles.roastValue}>{roast.quaker_count}</Text>
        </View>
      )}

      {roast.roast_level && (
        <View style={cuppingStyles.roastItem}>
          <Text style={cuppingStyles.roastLabel}>Level:</Text>
          <Text style={cuppingStyles.roastValue}>{roast.roast_level}</Text>
        </View>
      )}

      {roast.roast_date && (
        <View style={cuppingStyles.roastItem}>
          <Text style={cuppingStyles.roastLabel}>Date:</Text>
          <Text style={cuppingStyles.roastValue}>
            {new Date(roast.roast_date).toLocaleDateString('en-GB')}
          </Text>
        </View>
      )}
    </View>
  )
}

interface CertificateCuppingProps {
  cuppingData: CuppingData | null
  roastAnalysis?: RoastAnalysis | null
  hasQualityTemplate?: boolean
}

export function CertificateCupping({
  cuppingData,
  roastAnalysis,
  hasQualityTemplate = false,
}: CertificateCuppingProps) {
  // If no cupping data, don't render the section at all
  if (!cuppingData || cuppingData.attributes.length === 0) {
    return null
  }

  const { attributes, overallScore, comments, isSpecialty } = cuppingData
  const hasRoast = roastAnalysis && (
    roastAnalysis.agtron_score !== null ||
    roastAnalysis.quaker_count !== null ||
    roastAnalysis.roast_level
  )

  // Show ranges only if we have a quality template with validation
  const showRanges = hasQualityTemplate

  return (
    <View style={cuppingStyles.container}>
      <Text style={cuppingStyles.sectionTitle}>Cupping Scores</Text>

      <View style={cuppingStyles.adaptiveRow}>
        {/* Cupping table - 2/3 width if roast exists, full if not */}
        <View style={hasRoast ? cuppingStyles.cuppingColumn : cuppingStyles.cuppingColumnFull}>
          <View style={cuppingStyles.table}>
            {/* Header */}
            <View style={cuppingStyles.tableHeader}>
              <View style={cuppingStyles.colAttribute}>
                <Text style={cuppingStyles.headerText}>Attribute</Text>
              </View>
              <View style={cuppingStyles.colRange}>
                <Text style={cuppingStyles.headerText}>Range</Text>
              </View>
              <View style={cuppingStyles.colScore}>
                <Text style={cuppingStyles.headerText}>Score</Text>
              </View>
            </View>

            {/* Rows */}
            {attributes.map((attr, index) => (
              <AttributeRow
                key={index}
                attribute={attr}
                showRange={showRanges}
              />
            ))}
          </View>

          {/* Final Score - only for specialty coffees */}
          {isSpecialty && overallScore !== null && (
            <View style={cuppingStyles.finalScoreContainer}>
              <Text style={cuppingStyles.finalScoreLabel}>FINAL SCORE:</Text>
              <Text style={cuppingStyles.finalScoreValue}>{overallScore.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Roast Analysis - 1/3 width when present */}
        {hasRoast && (
          <View style={cuppingStyles.roastColumn}>
            <RoastSection roast={roastAnalysis} />
          </View>
        )}
      </View>

      {/* Comments */}
      {comments && (
        <View style={cuppingStyles.commentsContainer}>
          <Text style={cuppingStyles.commentsLabel}>Comments:</Text>
          <Text style={cuppingStyles.commentsText}>{comments}</Text>
        </View>
      )}
    </View>
  )
}
