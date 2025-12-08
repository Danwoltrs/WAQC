/**
 * Certificate screen distribution and defects section
 * Left: Screen size distribution (vertical list)
 * Right: Defects with auto-overflow (primary 1 col, secondary 2-3 cols if >8)
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const screenStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  section: {
    flex: 1,
    padding: 8,
  },
  separator: {
    width: 0.5,
    backgroundColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  screenList: {
    flexDirection: 'column',
    gap: 2,
  },
  screenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
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
  defectsContainer: {
    flexDirection: 'column',
    gap: 6,
  },
  defectsGroup: {
    marginBottom: 4,
  },
  defectsGroupTitle: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  defectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  defectColumn: {
    width: '100%',
  },
  defectColumnHalf: {
    width: '50%',
  },
  defectColumnThird: {
    width: '33.33%',
  },
  defectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
    paddingRight: 8,
  },
  defectName: {
    fontSize: 7,
    color: COLORS.dark,
    flex: 1,
  },
  defectCount: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.dark,
    minWidth: 20,
    textAlign: 'right',
  },
  noData: {
    fontSize: 8,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  total: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  totalValue: {
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.dark,
  },
})

interface ScreenSize {
  size: string | number
  percentage: number | null
}

interface Defect {
  name: string
  count: number
  category?: 'primary' | 'secondary'
}

export interface CertificateScreenDefectsProps {
  // Screen sizes
  screenSizes?: ScreenSize[] | null
  // Defects
  defects?: Defect[] | null
  primaryDefectsCount?: number | null
  secondaryDefectsCount?: number | null
  totalDefectsWeight?: number | null
}

function ScreenSizeList({ screenSizes }: { screenSizes: ScreenSize[] }) {
  if (screenSizes.length === 0) {
    return <Text style={screenStyles.noData}>No screen data</Text>
  }

  return (
    <View style={screenStyles.screenList}>
      {screenSizes.map((screen, index) => (
        <View key={index} style={screenStyles.screenRow}>
          <Text style={screenStyles.screenLabel}>Screen {screen.size}</Text>
          <Text style={screenStyles.screenValue}>
            {screen.percentage !== null ? `${screen.percentage.toFixed(1)}%` : '-'}
          </Text>
        </View>
      ))}
    </View>
  )
}

function DefectsList({
  defects,
  groupTitle,
  useMultiColumn,
}: {
  defects: Defect[]
  groupTitle: string
  useMultiColumn: boolean
}) {
  if (defects.length === 0) {
    return null
  }

  // Determine column width based on count
  const columnStyle = useMultiColumn
    ? defects.length > 12
      ? screenStyles.defectColumnThird
      : screenStyles.defectColumnHalf
    : screenStyles.defectColumn

  // Split defects into columns if using multi-column
  let columns: Defect[][] = [defects]
  if (useMultiColumn && defects.length > 8) {
    const colCount = defects.length > 12 ? 3 : 2
    const itemsPerCol = Math.ceil(defects.length / colCount)
    columns = []
    for (let i = 0; i < colCount; i++) {
      columns.push(defects.slice(i * itemsPerCol, (i + 1) * itemsPerCol))
    }
  }

  return (
    <View style={screenStyles.defectsGroup}>
      <Text style={screenStyles.defectsGroupTitle}>{groupTitle}</Text>
      <View style={screenStyles.defectsGrid}>
        {columns.map((colDefects, colIndex) => (
          <View key={colIndex} style={columnStyle}>
            {colDefects.map((defect, index) => (
              <View key={index} style={screenStyles.defectRow}>
                <Text style={screenStyles.defectName}>{defect.name}</Text>
                <Text style={screenStyles.defectCount}>{defect.count}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

export function CertificateScreenDefects({
  screenSizes,
  defects,
  primaryDefectsCount,
  secondaryDefectsCount,
  totalDefectsWeight,
}: CertificateScreenDefectsProps) {
  const hasScreenData = screenSizes && screenSizes.length > 0
  const hasDefectData = defects && defects.length > 0

  if (!hasScreenData && !hasDefectData) {
    return null
  }

  // Separate defects by category
  const primaryDefects = defects?.filter(d => d.category === 'primary') || []
  const secondaryDefects = defects?.filter(d => d.category === 'secondary') || []
  const uncategorizedDefects = defects?.filter(d => !d.category) || []

  // If no categories, treat all as uncategorized
  const showPrimary = primaryDefects.length > 0
  const showSecondary = secondaryDefects.length > 0
  const showUncategorized = uncategorizedDefects.length > 0 && !showPrimary && !showSecondary

  return (
    <View style={screenStyles.container}>
      {/* Screen Sizes Section */}
      <View style={screenStyles.section}>
        <Text style={screenStyles.sectionTitle}>Screen Distribution</Text>
        {hasScreenData ? (
          <ScreenSizeList screenSizes={screenSizes!} />
        ) : (
          <Text style={screenStyles.noData}>No screen data</Text>
        )}
      </View>

      <View style={screenStyles.separator} />

      {/* Defects Section */}
      <View style={screenStyles.section}>
        <Text style={screenStyles.sectionTitle}>Defects</Text>
        <View style={screenStyles.defectsContainer}>
          {showPrimary && (
            <DefectsList
              defects={primaryDefects}
              groupTitle="Primary"
              useMultiColumn={false}
            />
          )}
          {showSecondary && (
            <DefectsList
              defects={secondaryDefects}
              groupTitle="Secondary"
              useMultiColumn={secondaryDefects.length > 8}
            />
          )}
          {showUncategorized && (
            <DefectsList
              defects={uncategorizedDefects}
              groupTitle="Defects"
              useMultiColumn={uncategorizedDefects.length > 8}
            />
          )}
          {!hasDefectData && (
            <Text style={screenStyles.noData}>No defects found</Text>
          )}

          {/* Totals */}
          {(primaryDefectsCount != null || secondaryDefectsCount != null || totalDefectsWeight != null) && (
            <View style={screenStyles.total}>
              {primaryDefectsCount != null && (
                <View style={{ flexDirection: 'row' }}>
                  <Text style={screenStyles.totalLabel}>Primary: </Text>
                  <Text style={screenStyles.totalValue}>{primaryDefectsCount}</Text>
                </View>
              )}
              {secondaryDefectsCount != null && (
                <View style={{ flexDirection: 'row', marginLeft: 12 }}>
                  <Text style={screenStyles.totalLabel}>Secondary: </Text>
                  <Text style={screenStyles.totalValue}>{secondaryDefectsCount}</Text>
                </View>
              )}
              {totalDefectsWeight != null && (
                <View style={{ flexDirection: 'row', marginLeft: 12 }}>
                  <Text style={screenStyles.totalLabel}>Weight: </Text>
                  <Text style={screenStyles.totalValue}>{totalDefectsWeight.toFixed(1)}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
