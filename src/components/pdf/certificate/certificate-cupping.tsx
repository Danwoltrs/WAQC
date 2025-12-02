/**
 * Certificate cupping component
 * Displays cupping scores with range bar visualization
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { RangeBar } from './certificate-range-bar'
import type { CuppingData, CuppingAttribute } from '@/lib/certificate-data'

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
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  colAttribute: {
    width: '30%',
  },
  colScore: {
    width: '15%',
    textAlign: 'center',
  },
  colVisualization: {
    width: '35%',
    paddingHorizontal: 8,
  },
  colSpec: {
    width: '20%',
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
  scoreText: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'center',
  },
  specText: {
    fontSize: 8,
    color: COLORS.muted,
    textAlign: 'right',
  },
  finalScoreContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  finalScoreLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.dark,
    marginRight: 12,
  },
  finalScoreValue: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.primary,
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
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 9,
    color: COLORS.mutedLight,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
})

interface CertificateCuppingProps {
  cuppingData: CuppingData | null
}

function AttributeRow({ attribute }: { attribute: CuppingAttribute }) {
  const { name, score, allowedMin, allowedMax } = attribute

  // Default SCA range if not specified
  const min = allowedMin ?? 6
  const max = allowedMax ?? 10

  return (
    <View style={cuppingStyles.tableRow}>
      <View style={cuppingStyles.colAttribute}>
        <Text style={cuppingStyles.attributeName}>{name}</Text>
      </View>

      <View style={cuppingStyles.colScore}>
        <Text style={cuppingStyles.scoreText}>{score.toFixed(2)}</Text>
      </View>

      <View style={cuppingStyles.colVisualization}>
        <RangeBar
          value={score}
          rangeMin={min}
          rangeMax={max}
          scaleMin={0}
          scaleMax={10}
          width={100}
          height={12}
        />
      </View>

      <View style={cuppingStyles.colSpec}>
        <Text style={cuppingStyles.specText}>
          {min.toFixed(1)} - {max.toFixed(1)}
        </Text>
      </View>
    </View>
  )
}

export function CertificateCupping({ cuppingData }: CertificateCuppingProps) {
  if (!cuppingData || cuppingData.attributes.length === 0) {
    return (
      <View style={cuppingStyles.container}>
        <Text style={cuppingStyles.sectionTitle}>Cupping Scores</Text>
        <Text style={cuppingStyles.emptyText}>No cupping data available</Text>
      </View>
    )
  }

  const { attributes, overallScore, comments, isSpecialty } = cuppingData

  return (
    <View style={cuppingStyles.container}>
      <Text style={cuppingStyles.sectionTitle}>Cupping Scores</Text>

      {/* Table */}
      <View style={cuppingStyles.table}>
        {/* Header */}
        <View style={cuppingStyles.tableHeader}>
          <View style={cuppingStyles.colAttribute}>
            <Text style={cuppingStyles.headerText}>Attribute</Text>
          </View>
          <View style={cuppingStyles.colScore}>
            <Text style={cuppingStyles.headerText}>Score</Text>
          </View>
          <View style={cuppingStyles.colVisualization}>
            <Text style={cuppingStyles.headerText}>Range</Text>
          </View>
          <View style={cuppingStyles.colSpec}>
            <Text style={cuppingStyles.headerText}>Spec</Text>
          </View>
        </View>

        {/* Rows */}
        {attributes.map((attr, index) => (
          <AttributeRow key={index} attribute={attr} />
        ))}
      </View>

      {/* Final Score - only for specialty coffees */}
      {isSpecialty && overallScore !== null && (
        <View style={cuppingStyles.finalScoreContainer}>
          <Text style={cuppingStyles.finalScoreLabel}>FINAL SCORE:</Text>
          <Text style={cuppingStyles.finalScoreValue}>{overallScore.toFixed(2)}</Text>
        </View>
      )}

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
