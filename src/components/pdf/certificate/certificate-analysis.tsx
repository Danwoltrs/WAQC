/**
 * Certificate analysis component
 * Two-column layout for green bean and roast analysis
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { GreenBeanAnalysis, RoastAnalysis } from '@/lib/certificate-data'

const analysisStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
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
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  label: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
  },
  value: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  screenSizeContainer: {
    marginTop: 6,
  },
  screenSizeTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 4,
  },
  screenSizeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  screenSizeItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  screenSize: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  screenPercent: {
    fontSize: 8,
    color: COLORS.muted,
    marginLeft: 2,
  },
  emptyText: {
    fontSize: 8,
    color: COLORS.mutedLight,
    fontStyle: 'italic',
  },
})

interface CertificateAnalysisProps {
  greenBean: GreenBeanAnalysis | null
  roast: RoastAnalysis | null
}

function DataRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null

  return (
    <View style={analysisStyles.dataRow}>
      <Text style={analysisStyles.label}>{label}</Text>
      <Text style={analysisStyles.value}>{value}</Text>
    </View>
  )
}

function ScreenSizeDisplay({ screenSizes }: { screenSizes: Record<string, number> | null }) {
  if (!screenSizes || Object.keys(screenSizes).length === 0) return null

  // Sort screen sizes by key (descending to show largest first)
  const sortedSizes = Object.entries(screenSizes)
    .filter(([, value]) => value > 0)
    .sort((a, b) => {
      // Extract numeric part for sorting
      const aNum = parseInt(a[0].replace(/\D/g, '')) || 0
      const bNum = parseInt(b[0].replace(/\D/g, '')) || 0
      return bNum - aNum
    })

  if (sortedSizes.length === 0) return null

  return (
    <View style={analysisStyles.screenSizeContainer}>
      <Text style={analysisStyles.screenSizeTitle}>Screen Size Distribution</Text>
      <View style={analysisStyles.screenSizeRow}>
        {sortedSizes.map(([size, percent]) => (
          <View key={size} style={analysisStyles.screenSizeItem}>
            <Text style={analysisStyles.screenSize}>{size}</Text>
            <Text style={analysisStyles.screenPercent}>
              {typeof percent === 'number' ? `${percent.toFixed(1)}%` : percent}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function CertificateAnalysis({ greenBean, roast }: CertificateAnalysisProps) {
  const hasGreenBean = greenBean && (
    greenBean.moisture_percentage ||
    greenBean.density ||
    greenBean.humidity ||
    greenBean.screen_sizes
  )

  const hasRoast = roast && (
    roast.agtron_score ||
    roast.quaker_count !== null ||
    roast.roast_level
  )

  // If no analysis data, don't render
  if (!hasGreenBean && !hasRoast) {
    return null
  }

  return (
    <View style={analysisStyles.container}>
      {/* Green Bean Analysis Column */}
      <View style={analysisStyles.column}>
        <Text style={analysisStyles.sectionTitle}>Green Bean Analysis</Text>

        {hasGreenBean ? (
          <>
            <DataRow
              label="Moisture"
              value={greenBean?.moisture_percentage ? `${greenBean.moisture_percentage.toFixed(1)}%` : null}
            />
            <DataRow
              label="Density"
              value={greenBean?.density ? `${greenBean.density.toFixed(2)} g/mL` : null}
            />
            <DataRow
              label="Humidity"
              value={greenBean?.humidity ? `${greenBean.humidity.toFixed(1)}%` : null}
            />
            <ScreenSizeDisplay screenSizes={greenBean?.screen_sizes || null} />
          </>
        ) : (
          <Text style={analysisStyles.emptyText}>No data available</Text>
        )}
      </View>

      {/* Roast Analysis Column */}
      <View style={analysisStyles.column}>
        <Text style={analysisStyles.sectionTitle}>Roast Analysis</Text>

        {hasRoast ? (
          <>
            <DataRow
              label="Agtron Score"
              value={roast?.agtron_score}
            />
            <DataRow
              label="Quakers"
              value={roast?.quaker_count !== null ? roast.quaker_count : null}
            />
            <DataRow
              label="Roast Level"
              value={roast?.roast_level}
            />
            <DataRow
              label="Roast Date"
              value={roast?.roast_date ? new Date(roast.roast_date).toLocaleDateString('en-GB') : null}
            />
          </>
        ) : (
          <Text style={analysisStyles.emptyText}>No data available</Text>
        )}
      </View>
    </View>
  )
}
