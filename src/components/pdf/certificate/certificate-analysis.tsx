/**
 * Certificate analysis component
 * Two-column layout: Screen sizes (left) + Defects (right)
 * Bottom row: Moisture | Density | Green Aspect
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { GreenBeanAnalysis } from '@/lib/certificate-data'

const analysisStyles = StyleSheet.create({
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
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  column: {
    flex: 1,
  },
  columnTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // Screen sizes vertical list
  screenSizeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  screenLabel: {
    fontSize: 8,
    color: COLORS.dark,
  },
  screenValue: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  // Defects section
  defectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  defectName: {
    width: 80,
    fontSize: 8,
    color: COLORS.dark,
  },
  defectBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    marginHorizontal: 6,
    overflow: 'hidden',
  },
  defectBar: {
    height: '100%',
    borderRadius: 2,
  },
  defectCount: {
    width: 20,
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
  },
  defectTotals: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  defectTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  defectTotalItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  defectTotalLabel: {
    fontSize: 7,
    color: COLORS.muted,
    marginRight: 3,
  },
  defectTotalValue: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  // Bottom row (moisture, density, aspect)
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  bottomItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bottomLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginRight: 4,
  },
  bottomValue: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  emptyText: {
    fontSize: 8,
    color: COLORS.mutedLight,
  },
})

interface CertificateAnalysisProps {
  greenBean: GreenBeanAnalysis | null
  greenAspect?: string | null
}

function ScreenSizesList({ screenSizes }: { screenSizes: Record<string, number> | null }) {
  if (!screenSizes || Object.keys(screenSizes).length === 0) {
    return <Text style={analysisStyles.emptyText}>No data</Text>
  }

  // Sort screen sizes: largest first, Pan always last
  const sortedSizes = Object.entries(screenSizes)
    .filter(([, value]) => value > 0)
    .sort((a, b) => {
      const aIsPan = a[0].toLowerCase() === 'pan'
      const bIsPan = b[0].toLowerCase() === 'pan'
      if (aIsPan) return 1
      if (bIsPan) return -1
      // Extract numeric part for sorting
      const aNum = parseInt(a[0].replace(/\D/g, '')) || 0
      const bNum = parseInt(b[0].replace(/\D/g, '')) || 0
      return bNum - aNum // Descending (largest first)
    })

  if (sortedSizes.length === 0) {
    return <Text style={analysisStyles.emptyText}>No data</Text>
  }

  return (
    <View>
      {sortedSizes.map(([size, percent]) => (
        <View key={size} style={analysisStyles.screenSizeItem}>
          <Text style={analysisStyles.screenLabel}>{size}</Text>
          <Text style={analysisStyles.screenValue}>
            {typeof percent === 'number' ? `${percent.toFixed(1)}%` : percent}
          </Text>
        </View>
      ))}
    </View>
  )
}

function DefectsList({ defects }: { defects: GreenBeanAnalysis['defects'] }) {
  if (!defects) {
    return <Text style={analysisStyles.emptyText}>No defects recorded</Text>
  }

  const allDefects = [
    ...(defects.primary || []).map(d => ({ ...d, type: 'primary' })),
    ...(defects.secondary || []).map(d => ({ ...d, type: 'secondary' })),
  ]

  if (allDefects.length === 0) {
    return <Text style={analysisStyles.emptyText}>No defects recorded</Text>
  }

  // Find max for scaling bars
  const maxCount = Math.max(...allDefects.map(d => d.count), 1)
  const totalDefects = defects.total_primary + defects.total_secondary

  return (
    <View>
      {allDefects.map((defect, index) => (
        <View key={index} style={analysisStyles.defectItem}>
          <Text style={analysisStyles.defectName}>{defect.name}</Text>
          <View style={analysisStyles.defectBarContainer}>
            <View
              style={[
                analysisStyles.defectBar,
                {
                  width: `${(defect.count / maxCount) * 100}%`,
                  backgroundColor: defect.type === 'primary' ? COLORS.rejected : COLORS.secondary,
                },
              ]}
            />
          </View>
          <Text style={analysisStyles.defectCount}>{defect.count}</Text>
        </View>
      ))}

      <View style={analysisStyles.defectTotals}>
        <View style={analysisStyles.defectTotalRow}>
          <View style={analysisStyles.defectTotalItem}>
            <Text style={analysisStyles.defectTotalLabel}>Primary:</Text>
            <Text style={analysisStyles.defectTotalValue}>{defects.total_primary}</Text>
          </View>
          <View style={analysisStyles.defectTotalItem}>
            <Text style={analysisStyles.defectTotalLabel}>Secondary:</Text>
            <Text style={analysisStyles.defectTotalValue}>{defects.total_secondary}</Text>
          </View>
          <View style={analysisStyles.defectTotalItem}>
            <Text style={analysisStyles.defectTotalLabel}>Total:</Text>
            <Text style={analysisStyles.defectTotalValue}>{totalDefects}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export function CertificateAnalysis({ greenBean, greenAspect }: CertificateAnalysisProps) {
  const hasData = greenBean && (
    greenBean.moisture_percentage ||
    greenBean.density ||
    greenBean.screen_sizes ||
    greenBean.defects
  )

  // If no analysis data, don't render
  if (!hasData) {
    return null
  }

  return (
    <View style={analysisStyles.container}>
      <Text style={analysisStyles.sectionTitle}>Green Bean Analysis</Text>

      {/* Two columns: Screen Sizes (left) + Defects (right) */}
      <View style={analysisStyles.twoColumnRow}>
        {/* Left column: Screen sizes */}
        <View style={analysisStyles.column}>
          <Text style={analysisStyles.columnTitle}>Screen Sizes</Text>
          <ScreenSizesList screenSizes={greenBean?.screen_sizes || null} />
        </View>

        {/* Right column: Defects */}
        <View style={analysisStyles.column}>
          <Text style={analysisStyles.columnTitle}>Defects</Text>
          <DefectsList defects={greenBean?.defects || null} />
        </View>
      </View>

      {/* Bottom row: Moisture | Density | Aspect */}
      <View style={analysisStyles.bottomRow}>
        <View style={analysisStyles.bottomItem}>
          <Text style={analysisStyles.bottomLabel}>Moisture:</Text>
          <Text style={analysisStyles.bottomValue}>
            {greenBean?.moisture_percentage
              ? `${greenBean.moisture_percentage.toFixed(1)}%`
              : '-'}
          </Text>
        </View>

        <View style={analysisStyles.bottomItem}>
          <Text style={analysisStyles.bottomLabel}>Density:</Text>
          <Text style={analysisStyles.bottomValue}>
            {greenBean?.density ? `${greenBean.density.toFixed(2)} g/mL` : '-'}
          </Text>
        </View>

        <View style={analysisStyles.bottomItem}>
          <Text style={analysisStyles.bottomLabel}>Aspect:</Text>
          <Text style={analysisStyles.bottomValue}>
            {greenAspect || '-'}
          </Text>
        </View>
      </View>
    </View>
  )
}
