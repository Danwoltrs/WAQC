/**
 * Certificate analysis component
 * Two-column layout: Screen sizes (left) + Properties & Roast (right)
 * No section titles, compact spacing, numbers close to labels
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { GreenBeanAnalysis, RoastAnalysis } from '@/lib/certificate-data'

const analysisStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 20,
  },
  leftColumn: {
    width: 120,
  },
  rightColumn: {
    flex: 1,
  },
  // Screen sizes - compact list
  screenSizeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  screenLabel: {
    fontSize: 9,
    color: COLORS.dark,
  },
  screenValue: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
    marginLeft: 8,
  },
  // Properties section - horizontal layout
  propertiesRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 8,
  },
  propertyItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  propertyLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginRight: 4,
  },
  propertyValue: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  // Roast section
  roastContainer: {
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  roastTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  roastRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  roastItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  roastLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginRight: 4,
  },
  roastValue: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  emptyText: {
    fontSize: 9,
    color: COLORS.mutedLight,
  },
})

interface CertificateAnalysisProps {
  greenBean: GreenBeanAnalysis | null
  greenAspect?: string | null
  roastAnalysis?: RoastAnalysis | null
}

function ScreenSizesList({ screenSizes }: { screenSizes: Record<string, number> | null }) {
  if (!screenSizes || Object.keys(screenSizes).length === 0) {
    return <Text style={analysisStyles.emptyText}>-</Text>
  }

  // Sort screen sizes: largest first, Pan always last
  const sortedSizes = Object.entries(screenSizes)
    .filter(([, value]) => value > 0)
    .sort((a, b) => {
      const aIsPan = a[0].toLowerCase() === 'pan'
      const bIsPan = b[0].toLowerCase() === 'pan'
      if (aIsPan) return 1
      if (bIsPan) return -1
      const aNum = parseInt(a[0].replace(/\D/g, '')) || 0
      const bNum = parseInt(b[0].replace(/\D/g, '')) || 0
      return bNum - aNum
    })

  if (sortedSizes.length === 0) {
    return <Text style={analysisStyles.emptyText}>-</Text>
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

function RoastSection({ roast }: { roast: RoastAnalysis | null }) {
  if (!roast) return null

  const hasAnyData = roast.agtron_score !== null ||
    roast.quaker_count !== null ||
    roast.roast_level ||
    roast.roast_date

  if (!hasAnyData) return null

  return (
    <View style={analysisStyles.roastContainer}>
      <Text style={analysisStyles.roastTitle}>Roast Analysis</Text>
      <View style={analysisStyles.roastRow}>
        {roast.agtron_score !== null && (
          <View style={analysisStyles.roastItem}>
            <Text style={analysisStyles.roastLabel}>Agtron:</Text>
            <Text style={analysisStyles.roastValue}>{roast.agtron_score}</Text>
          </View>
        )}
        {roast.quaker_count !== null && (
          <View style={analysisStyles.roastItem}>
            <Text style={analysisStyles.roastLabel}>Quakers:</Text>
            <Text style={analysisStyles.roastValue}>{roast.quaker_count}</Text>
          </View>
        )}
        {roast.roast_level && (
          <View style={analysisStyles.roastItem}>
            <Text style={analysisStyles.roastLabel}>Level:</Text>
            <Text style={analysisStyles.roastValue}>{roast.roast_level}</Text>
          </View>
        )}
        {roast.roast_date && (
          <View style={analysisStyles.roastItem}>
            <Text style={analysisStyles.roastLabel}>Date:</Text>
            <Text style={analysisStyles.roastValue}>
              {new Date(roast.roast_date).toLocaleDateString('en-GB')}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

export function CertificateAnalysis({ greenBean, greenAspect, roastAnalysis }: CertificateAnalysisProps) {
  const hasScreenSizes = greenBean?.screen_sizes && Object.keys(greenBean.screen_sizes).length > 0
  const hasProperties = greenBean?.moisture_percentage || greenBean?.density || greenAspect
  const hasRoast = roastAnalysis && (
    roastAnalysis.agtron_score !== null ||
    roastAnalysis.quaker_count !== null ||
    roastAnalysis.roast_level
  )

  if (!hasScreenSizes && !hasProperties && !hasRoast) {
    return null
  }

  return (
    <View style={analysisStyles.container}>
      <View style={analysisStyles.twoColumnRow}>
        {/* Left column: Screen sizes - compact */}
        <View style={analysisStyles.leftColumn}>
          <ScreenSizesList screenSizes={greenBean?.screen_sizes || null} />
        </View>

        {/* Right column: Properties + Roast Analysis */}
        <View style={analysisStyles.rightColumn}>
          {/* Properties in a row */}
          <View style={analysisStyles.propertiesRow}>
            <View style={analysisStyles.propertyItem}>
              <Text style={analysisStyles.propertyLabel}>Moisture:</Text>
              <Text style={analysisStyles.propertyValue}>
                {greenBean?.moisture_percentage
                  ? `${greenBean.moisture_percentage.toFixed(1)}%`
                  : '-'}
              </Text>
            </View>

            <View style={analysisStyles.propertyItem}>
              <Text style={analysisStyles.propertyLabel}>Density:</Text>
              <Text style={analysisStyles.propertyValue}>
                {greenBean?.density ? `${greenBean.density.toFixed(2)} g/mL` : '-'}
              </Text>
            </View>

            <View style={analysisStyles.propertyItem}>
              <Text style={analysisStyles.propertyLabel}>Aspect:</Text>
              <Text style={analysisStyles.propertyValue}>
                {greenAspect || '-'}
              </Text>
            </View>
          </View>

          {/* Roast Analysis (if available) */}
          <RoastSection roast={roastAnalysis || null} />
        </View>
      </View>
    </View>
  )
}
