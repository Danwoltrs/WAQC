/**
 * Certificate defect chart component
 * Horizontal bar charts for primary and secondary defects
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { DefectBar } from './certificate-range-bar'
import type { GreenBeanAnalysis, DefectItem } from '@/lib/certificate-data'

const defectStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  chartSection: {
    padding: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  defectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  defectName: {
    width: 100,
    fontSize: 8,
    color: COLORS.dark,
  },
  barContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  countText: {
    width: 30,
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  totalLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 8,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.dark,
  },
  noDefectsText: {
    fontSize: 8,
    color: COLORS.mutedLight,
  },
})

interface DefectChartProps {
  title: string
  defects: DefectItem[]
  total: number
  barColor?: string
}

function DefectChart({ title, defects, total, barColor = COLORS.accent }: DefectChartProps) {
  // Find max count for scaling bars (use rawCount)
  const maxCount = Math.max(...defects.map((d) => d.rawCount), 1)

  return (
    <View style={defectStyles.chartSection}>
      <Text style={defectStyles.sectionTitle}>{title}</Text>

      {defects.map((defect, index) => (
        <View key={index} style={defectStyles.defectRow}>
          <Text style={defectStyles.defectName}>{defect.name}</Text>
          <View style={defectStyles.barContainer}>
            <DefectBar
              count={defect.rawCount}
              maxCount={maxCount}
              width={120}
              height={10}
              color={barColor}
            />
          </View>
          <Text style={defectStyles.countText}>{defect.rawCount}</Text>
        </View>
      ))}

      <View style={defectStyles.totalRow}>
        <Text style={defectStyles.totalLabel}>Total:</Text>
        <Text style={defectStyles.totalValue}>{total}</Text>
      </View>
    </View>
  )
}

interface CertificateDefectChartProps {
  defects: GreenBeanAnalysis['defects']
}

export function CertificateDefectChart({ defects }: CertificateDefectChartProps) {
  if (!defects) return null

  const hasPrimary = defects.primary && defects.primary.length > 0
  const hasSecondary = defects.secondary && defects.secondary.length > 0

  // If no defects at all, don't render anything
  if (!hasPrimary && !hasSecondary) return null

  return (
    <View style={defectStyles.container}>
      {/* Primary Defects Chart */}
      {hasPrimary && (
        <DefectChart
          title="Primary Defects"
          defects={defects.primary}
          total={defects.total_primary}
          barColor={COLORS.rejected} // Red for primary defects
        />
      )}

      {/* Secondary Defects Chart */}
      {hasSecondary && (
        <DefectChart
          title="Secondary Defects"
          defects={defects.secondary}
          total={defects.total_secondary}
          barColor={COLORS.secondary} // Yellow-ish for secondary
        />
      )}
    </View>
  )
}
