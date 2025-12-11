/**
 * Certificate screen distribution and defects section
 * Two separate sections: Screen | Defects
 * Screen: sorted largest to smallest with pan always last
 * Defects: summary row on top, two columns (Primary | Secondary) with dotted lines to counts
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 10,
  },
  // Screen section styles
  screenSection: {
    width: 85,
    padding: 6,
  },
  screenDefectsSeparator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    marginHorizontal: 6,
    alignSelf: 'stretch',
  },
  screenTitle: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  screenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  screenLabel: {
    fontSize: 7,
    color: COLORS.dark,
  },
  screenValue: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.dark,
  },
  // Defects section styles
  defectsSection: {
    flex: 1,
    paddingVertical: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 4,
  },
  summaryValue: {
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.dark,
  },
  defectsColumnsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  defectColumn: {
    width: 110,
  },
  columnSeparator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
    alignSelf: 'stretch',
    minHeight: 20,
  },
  defectColumnTitle: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  defectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 1,
  },
  defectName: {
    fontSize: 7,
    color: COLORS.dark,
  },
  defectDots: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    borderBottomStyle: 'dotted',
    marginHorizontal: 3,
    marginBottom: 2,
  },
  defectCount: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.dark,
    minWidth: 18,
    textAlign: 'right',
  },
  defectWeighted: {
    fontSize: 6,
    color: COLORS.muted,
    minWidth: 24,
    textAlign: 'right',
  },
  noData: {
    fontSize: 7,
    color: COLORS.muted,
  },
})

interface ScreenSize {
  size: string | number
  percentage: number | null
}

interface Defect {
  name: string
  count: number
  weight?: number
  weightedCount?: number
  category?: 'primary' | 'secondary'
}

export interface CertificateScreenDefectsProps {
  screenSizes?: ScreenSize[] | null
  defects?: Defect[] | null
  primaryDefectsCount?: number | null
  secondaryDefectsCount?: number | null
  totalDefectsWeight?: number | null
}

/**
 * Sort screen sizes: numeric sizes descending (19, 18, 17...), with 'pan' always last
 */
function sortScreenSizes(sizes: ScreenSize[]): ScreenSize[] {
  return [...sizes].sort((a, b) => {
    const aStr = String(a.size).toLowerCase()
    const bStr = String(b.size).toLowerCase()

    // Pan always goes last
    if (aStr === 'pan' || aStr === 'fondo') return 1
    if (bStr === 'pan' || bStr === 'fondo') return -1

    // Parse numeric values for comparison
    const aNum = parseInt(String(a.size), 10)
    const bNum = parseInt(String(b.size), 10)

    // If both are numbers, sort descending
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return bNum - aNum
    }

    // Non-numeric strings go after numbers but before pan
    if (isNaN(aNum)) return 1
    if (isNaN(bNum)) return -1

    return 0
  })
}

/**
 * Sort defects by count descending
 */
function sortDefects(defects: Defect[]): Defect[] {
  return [...defects].sort((a, b) => b.count - a.count)
}

export function CertificateScreenDefects({
  screenSizes,
  defects,
  primaryDefectsCount,
  secondaryDefectsCount,
}: CertificateScreenDefectsProps) {
  const hasScreenData = screenSizes && screenSizes.length > 0
  const hasDefectData = defects && defects.length > 0

  if (!hasScreenData && !hasDefectData) {
    return null
  }

  // Sort screen sizes: largest to smallest, pan last
  const sortedScreenSizes = hasScreenData ? sortScreenSizes(screenSizes!) : []

  // Separate defects by category and sort by count
  let primaryDefects: Defect[] = []
  let secondaryDefects: Defect[] = []

  if (defects) {
    primaryDefects = sortDefects(defects.filter(d => d.category === 'primary'))
    secondaryDefects = sortDefects(defects.filter(d => d.category === 'secondary'))

    // If no categories assigned, all go to secondary by default
    if (primaryDefects.length === 0 && secondaryDefects.length === 0) {
      secondaryDefects = sortDefects([...defects])
    }
  }

  // Calculate totals
  const totalDefects = ((primaryDefectsCount ?? 0) + (secondaryDefectsCount ?? 0))

  return (
    <View style={styles.container}>
      {/* Screen Distribution Section */}
      {hasScreenData && (
        <View style={styles.screenSection}>
          <Text style={styles.screenTitle}>Screen</Text>
          {sortedScreenSizes.map((screen, index) => (
            <View key={index} style={styles.screenRow}>
              <Text style={styles.screenLabel}>{screen.size}</Text>
              <Text style={styles.screenValue}>
                {screen.percentage !== null ? `${screen.percentage.toFixed(1)}%` : '-'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Separator between Screen and Defects */}
      {hasScreenData && hasDefectData && (
        <View style={styles.screenDefectsSeparator} />
      )}

      {/* Defects Section */}
      {hasDefectData && (
        <View style={styles.defectsSection}>
          {/* Summary row on top */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Primary:</Text>
              <Text style={styles.summaryValue}>{primaryDefectsCount ?? 0}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Secondary:</Text>
              <Text style={styles.summaryValue}>{secondaryDefectsCount?.toFixed(2) ?? '0'}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total:</Text>
              <Text style={styles.summaryValue}>{totalDefects.toFixed(2)}</Text>
            </View>
          </View>

          {/* Defect columns */}
          <View style={styles.defectsColumnsContainer}>
            {/* Primary Defects Column */}
            <View style={styles.defectColumn}>
              <Text style={styles.defectColumnTitle}>Primary</Text>
              {primaryDefects.length > 0 ? (
                primaryDefects.map((defect, index) => (
                  <View key={index} style={styles.defectRow}>
                    <Text style={styles.defectName}>{defect.name}</Text>
                    <View style={styles.defectDots} />
                    <Text style={styles.defectCount}>{defect.count}</Text>
                    {defect.weightedCount !== undefined && defect.weightedCount !== defect.count && (
                      <Text style={styles.defectWeighted}>={defect.weightedCount}</Text>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.noData}>None</Text>
              )}
            </View>

            {/* Vertical separator */}
            <View style={styles.columnSeparator} />

            {/* Secondary Defects Column */}
            <View style={styles.defectColumn}>
              <Text style={styles.defectColumnTitle}>Secondary</Text>
              {secondaryDefects.length > 0 ? (
                secondaryDefects.map((defect, index) => (
                  <View key={index} style={styles.defectRow}>
                    <Text style={styles.defectName}>{defect.name}</Text>
                    <View style={styles.defectDots} />
                    <Text style={styles.defectCount}>{defect.count}</Text>
                    {defect.weightedCount !== undefined && defect.weightedCount !== defect.count && (
                      <Text style={styles.defectWeighted}>={defect.weightedCount}</Text>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.noData}>None</Text>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
