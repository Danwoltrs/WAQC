/**
 * Certificate cupping component
 * Minimalistic two-column display: Attribute (with range) | Score
 * No title, no visual bars
 * Range shown as (center +/- tolerance) inline with attribute name
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { CuppingData, CuppingAttribute } from '@/lib/certificate-data'

const cuppingStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  table: {
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  colAttribute: {
    flex: 3,
  },
  colScore: {
    flex: 1,
    textAlign: 'right',
  },
  attributeName: {
    fontSize: 8,
    color: COLORS.dark,
  },
  rangeText: {
    fontSize: 7,
    color: COLORS.muted,
  },
  scoreText: {
    fontSize: 8,
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
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  finalScoreLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    marginRight: 8,
  },
  finalScoreValue: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.primary,
  },
  commentsContainer: {
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  commentsLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 2,
  },
  commentsText: {
    fontSize: 8,
    color: COLORS.dark,
  },
})

// Format range as (center +/- tolerance)
function formatRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return ''
  const center = (min + max) / 2
  const tolerance = (max - min) / 2
  // Use integer if tolerance is whole number
  const toleranceStr = tolerance % 1 === 0 ? tolerance.toString() : tolerance.toFixed(1)
  return `(${center.toFixed(1)} +/- ${toleranceStr})`
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
  const rangeStr = showRange && allowedMin !== null && allowedMax !== null
    ? ` ${formatRange(allowedMin, allowedMax)}`
    : ''

  return (
    <View style={cuppingStyles.tableRow}>
      <View style={cuppingStyles.colAttribute}>
        <Text style={cuppingStyles.attributeName}>
          {name}
          {rangeStr && <Text style={cuppingStyles.rangeText}>{rangeStr}</Text>}
        </Text>
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

interface CertificateCuppingProps {
  cuppingData: CuppingData | null
  hasQualityTemplate?: boolean
}

export function CertificateCupping({
  cuppingData,
  hasQualityTemplate = false,
}: CertificateCuppingProps) {
  // If no cupping data, don't render
  if (!cuppingData || cuppingData.attributes.length === 0) {
    return null
  }

  const { attributes, overallScore, comments, isSpecialty } = cuppingData

  // Show ranges only if we have a quality template with validation
  const showRanges = hasQualityTemplate

  return (
    <View style={cuppingStyles.container}>
      <View style={cuppingStyles.table}>
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
          <Text style={cuppingStyles.finalScoreLabel}>FINAL:</Text>
          <Text style={cuppingStyles.finalScoreValue}>{overallScore.toFixed(2)}</Text>
        </View>
      )}

      {/* Comments */}
      {comments && (
        <View style={cuppingStyles.commentsContainer}>
          <Text style={cuppingStyles.commentsLabel}>Notes:</Text>
          <Text style={cuppingStyles.commentsText}>{comments}</Text>
        </View>
      )}
    </View>
  )
}
