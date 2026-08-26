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
  // CVA verdict colouring — the persisted, tri-state pass/fail (never
  // recomputed here). Overrides finalScoreValue's default colour.
  finalScorePassed: {
    color: COLORS.approved,
  },
  finalScoreFailed: {
    color: COLORS.rejected,
  },
  cvaMarkRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 1,
  },
  cvaMarkText: {
    fontSize: 7,
    color: COLORS.muted,
  },
  // The tri-state's null case: visibly distinct from both a pass and a fail,
  // never implied by an absent colour alone.
  cvaUnjudgedText: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    marginLeft: 4,
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

// Guard: always filter out Clean Cup / Uniform Cup from scored attributes
// These are boolean fields and must never appear as numeric rows
const BOOLEAN_CUP_NAMES = ['clean cup', 'cleancup', 'clean_cup', 'uniform cup', 'uniformcup', 'uniform_cup', 'uniformity']

function isBooleanCupAttribute(name: string): boolean {
  return BOOLEAN_CUP_NAMES.includes(name.toLowerCase())
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

  const { overallScore, comments, isSpecialty, taints, faults, flavorDescriptor, cvaVerdict } = cuppingData
  // Belt and suspenders: filter out Clean Cup / Uniform Cup even if they leaked in
  const attributes = cuppingData.attributes.filter(attr => !isBooleanCupAttribute(attr.name))
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

      {/* Taints & Faults — CVA has no taint/fault COUNT concept (cup
          integrity there is the clean/uniform booleans elsewhere on the
          certificate, not a defect count), so asserting "None" for a
          protocol that never counted them would be a claim this certificate
          has no basis for. cvaVerdict is non-null only for CVA-sourced data. */}
      {!cvaVerdict && (
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
      )}

      {isSpecialty && overallScore !== null && (
        <View style={cuppingStyles.finalScoreContainer}>
          <Text style={cuppingStyles.finalScoreLabel}>FINAL:</Text>
          <Text
            style={[
              cuppingStyles.finalScoreValue,
              cvaVerdict?.passed === true ? cuppingStyles.finalScorePassed : {},
              cvaVerdict?.passed === false ? cuppingStyles.finalScoreFailed : {},
            ]}
          >
            {formatScore(overallScore)}
          </Text>
        </View>
      )}
      {/* The mark + tri-state verdict, read from the persisted
          quality_assessments columns (never recomputed here) — "min X"
          matches the cert editor's CuppingQuadrant wording so the two
          surfaces agree. The null case is spelled out explicitly: cva_passed
          === null means the cup could not be judged, which must never be
          confused with, or rendered indistinguishably from, a fail. */}
      {isSpecialty && overallScore !== null && cvaVerdict && (cvaVerdict.minScore !== null || cvaVerdict.passed === null) && (
        <View style={cuppingStyles.cvaMarkRow}>
          {cvaVerdict.minScore !== null && (
            <Text style={cuppingStyles.cvaMarkText}>min {formatScore(cvaVerdict.minScore)}</Text>
          )}
          {cvaVerdict.passed === null && (
            <Text style={cuppingStyles.cvaUnjudgedText}>Could not be judged</Text>
          )}
        </View>
      )}
    </View>
  )
}
