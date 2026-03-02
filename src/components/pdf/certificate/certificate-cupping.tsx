/**
 * Certificate cupping component
 * Simple two-column display: Attribute (with range) | Score
 * No title, compact spacing, all text 9pt
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
    justifyContent: 'space-between',
    paddingVertical: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  attributeText: {
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
    marginLeft: 4,
    minWidth: 28,
    textAlign: 'right',
  },
  scoreOutOfSpec: {
    color: COLORS.rejected,
  },
  // Taints/Faults section - compact
  taintsFaultsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  taintsFaultsItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  taintsFaultsLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 2,
  },
  taintsFaultsValue: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  taintsFaultsNone: {
    fontSize: 8,
    color: COLORS.mutedLight,
  },
  finalScoreContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  finalScoreLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    marginRight: 4,
  },
  finalScoreValue: {
    fontSize: 10,
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
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 2,
  },
  commentsText: {
    fontSize: 9,
    color: COLORS.dark,
  },
})

// Format range as (center +/- tolerance)
function formatRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return ''
  const center = (min + max) / 2
  const tolerance = (max - min) / 2
  const toleranceStr = tolerance % 1 === 0 ? tolerance.toString() : tolerance.toFixed(1)
  return ` (${center.toFixed(1)} +/- ${toleranceStr})`
}

// Format score - no decimals if whole number
function formatScore(score: number): string {
  // Check if the score is a whole number (or very close to it)
  if (Math.abs(score - Math.round(score)) < 0.001) {
    return Math.round(score).toString()
  }
  return score.toFixed(2)
}

// Check if score is within spec range
function isInSpec(score: number, min: number | null, max: number | null): boolean {
  if (min === null || max === null) return true
  return score >= min && score <= max
}

interface AttributeRowProps {
  attribute: CuppingAttribute
  showRange: boolean
  descriptor?: string | null
}

function AttributeRow({ attribute, showRange, descriptor }: AttributeRowProps) {
  const { name, score, allowedMin, allowedMax } = attribute
  const inSpec = isInSpec(score, allowedMin, allowedMax)
  const rangeStr = showRange && allowedMin !== null && allowedMax !== null
    ? formatRange(allowedMin, allowedMax)
    : ''

  return (
    <View style={cuppingStyles.tableRow}>
      <Text style={cuppingStyles.attributeText}>
        {name}
        {rangeStr && <Text style={cuppingStyles.rangeText}>{rangeStr}</Text>}
      </Text>
      <Text
        style={[
          cuppingStyles.scoreText,
          !inSpec && showRange ? cuppingStyles.scoreOutOfSpec : {},
        ]}
      >
        {formatScore(score)}{descriptor ? ` (${descriptor})` : ''}
      </Text>
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
  if (!cuppingData || cuppingData.attributes.length === 0) {
    return null
  }

  const { attributes, overallScore, comments, isSpecialty, taints, faults, flavorDescriptor } = cuppingData
  const showRanges = hasQualityTemplate

  // Check if taints or faults have values
  const hasTaints = taints !== null && taints > 0
  const hasFaults = faults !== null && faults > 0

  return (
    <View style={cuppingStyles.container}>
      <View style={cuppingStyles.table}>
        {attributes.map((attr, index) => {
          const isFlavorAttr = attr.name.toLowerCase() === 'flavor' || attr.name.toLowerCase() === 'flavor/bebida'
          return (
            <AttributeRow
              key={index}
              attribute={attr}
              showRange={showRanges}
              descriptor={isFlavorAttr ? flavorDescriptor : null}
            />
          )
        })}
      </View>

      {/* Taints & Faults */}
      <View style={cuppingStyles.taintsFaultsContainer}>
        <View style={cuppingStyles.taintsFaultsItem}>
          <Text style={cuppingStyles.taintsFaultsLabel}>Taints:</Text>
          {hasTaints ? (
            <Text style={cuppingStyles.taintsFaultsValue}>{taints}</Text>
          ) : (
            <Text style={cuppingStyles.taintsFaultsNone}>None</Text>
          )}
        </View>
        <View style={cuppingStyles.taintsFaultsItem}>
          <Text style={cuppingStyles.taintsFaultsLabel}>Faults:</Text>
          {hasFaults ? (
            <Text style={cuppingStyles.taintsFaultsValue}>{faults}</Text>
          ) : (
            <Text style={cuppingStyles.taintsFaultsNone}>None</Text>
          )}
        </View>
      </View>

      {isSpecialty && overallScore !== null && (
        <View style={cuppingStyles.finalScoreContainer}>
          <Text style={cuppingStyles.finalScoreLabel}>FINAL:</Text>
          <Text style={cuppingStyles.finalScoreValue}>{formatScore(overallScore)}</Text>
        </View>
      )}
    </View>
  )
}
