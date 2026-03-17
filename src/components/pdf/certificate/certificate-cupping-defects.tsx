/**
 * Certificate cupping and defects combined section
 * Layout: Two separate bordered boxes - Cupping (left) | Defects (right)
 * Defects displayed as compact columns: Name (wt), Count, FD
 *
 * Layout rules:
 * - When no primary defects: collapse primary column, show "No primary defects found" label,
 *   give secondary full width
 * - Defect name column is flexible with word-wrap; Cnt and FD are fixed narrow columns (28px)
 * - Minimum font size 8pt for defect data, weight coefficients in smaller subscript (6pt)
 * - Total row is visually distinct with top border and semi-bold text
 * - Numbers right-aligned in their columns
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { CertificateCupping } from './certificate-cupping'
import type { CuppingData, GreenBeanAnalysis } from '@/lib/certificate-data'

const sectionStyles = StyleSheet.create({
  // Two-box layout container
  twoBoxLayout: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  // Individual boxes with their own borders
  // Cupping box is smaller (1/3), defects gets more space (2/3)
  cuppingBox: {
    width: '32%',
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
  },
  defectsBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 10,
  },
  // Defects summary header - centered
  defectsSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  summaryItem: {
    fontSize: 8,
    color: COLORS.muted,
  },
  summaryValue: {
    fontWeight: 600,
    color: COLORS.dark,
  },
  summaryTotal: {
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.dark,
  },
  defectsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  defectTypeColumn: {
    flex: 1,
  },
  defectTypeTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  // Column header row
  defectHeaderRow: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingBottom: 2,
    borderBottomWidth: 0.25,
    borderBottomColor: COLORS.borderLight,
  },
  defectNameHeader: {
    flex: 1,
    fontSize: 7,
    color: COLORS.muted,
  },
  defectCountHeader: {
    width: 28,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: 'right',
  },
  defectFDHeader: {
    width: 28,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: 'right',
  },
  // Defect data rows - flex name column, fixed count/FD columns
  defectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 1,
  },
  defectNameContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  defectName: {
    fontSize: 8,
    color: COLORS.dark,
  },
  defectWeight: {
    fontSize: 6,
    color: COLORS.muted,
    marginLeft: 1,
  },
  defectCount: {
    width: 28,
    fontSize: 8,
    color: COLORS.dark,
    textAlign: 'right',
  },
  defectFD: {
    width: 28,
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
  },
  defectTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  totalValue: {
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.dark,
  },
  emptyText: {
    fontSize: 8,
    color: COLORS.mutedLight,
  },
  noPrimaryLabel: {
    fontSize: 7,
    color: COLORS.muted,
    marginBottom: 4,
    fontStyle: 'italic',
  },
})

interface DefectsListProps {
  defects: GreenBeanAnalysis['defects']
}

/**
 * Render a single defect column (Primary or Secondary)
 */
function DefectColumn({
  title,
  defects,
  total,
  formatNum,
}: {
  title: string
  defects: Array<{ name: string; rawCount: number; weight: number; weightedCount: number }>
  total: number
  formatNum: (n: number) => string
}) {
  return (
    <View style={sectionStyles.defectTypeColumn}>
      <Text style={sectionStyles.defectTypeTitle}>{title}</Text>
      <View style={sectionStyles.defectHeaderRow}>
        <Text style={sectionStyles.defectNameHeader}>Name</Text>
        <Text style={sectionStyles.defectCountHeader}>Cnt</Text>
        <Text style={sectionStyles.defectFDHeader}>FD</Text>
      </View>
      {defects.map((defect, index) => (
        <View key={index} style={sectionStyles.defectRow}>
          <View style={sectionStyles.defectNameContainer}>
            <Text style={sectionStyles.defectName}>{defect.name}</Text>
            <Text style={sectionStyles.defectWeight}> ({defect.weight})</Text>
          </View>
          <Text style={sectionStyles.defectCount}>{defect.rawCount}</Text>
          <Text style={sectionStyles.defectFD}>{formatNum(defect.weightedCount)}</Text>
        </View>
      ))}
      <View style={sectionStyles.defectTotal}>
        <Text style={sectionStyles.totalLabel}>Total:</Text>
        <Text style={sectionStyles.totalValue}>{formatNum(total)}</Text>
      </View>
    </View>
  )
}

function DefectsList({ defects }: DefectsListProps) {
  const primaryDefects = defects?.primary || []
  const secondaryDefects = defects?.secondary || []
  const totalPrimary = defects?.total_primary || 0
  const totalSecondary = defects?.total_secondary || 0
  const grandTotal = totalPrimary + totalSecondary

  // Format number for display
  const formatNum = (n: number) => {
    if (Number.isInteger(n)) return n.toString()
    return n.toFixed(1)
  }

  const hasPrimary = primaryDefects.length > 0
  const hasSecondary = secondaryDefects.length > 0

  return (
    <View>
      {/* Summary Header */}
      <View style={sectionStyles.defectsSummary}>
        <Text style={sectionStyles.summaryItem}>
          Primary: <Text style={sectionStyles.summaryValue}>{formatNum(totalPrimary)}</Text>
        </Text>
        <Text style={sectionStyles.summaryItem}>|</Text>
        <Text style={sectionStyles.summaryItem}>
          Secondary: <Text style={sectionStyles.summaryValue}>{formatNum(totalSecondary)}</Text>
        </Text>
        <Text style={sectionStyles.summaryItem}>|</Text>
        <Text style={sectionStyles.summaryTotal}>
          Total: {formatNum(grandTotal)}
        </Text>
      </View>

      {/* When no primary defects: show muted label and give secondary full width */}
      {!hasPrimary && hasSecondary && (
        <Text style={sectionStyles.noPrimaryLabel}>No primary defects found</Text>
      )}

      {/* Defects Columns */}
      <View style={sectionStyles.defectsRow}>
        {/* Two-column layout only when both have entries */}
        {hasPrimary && hasSecondary && (
          <>
            <DefectColumn
              title="Primary"
              defects={primaryDefects}
              total={totalPrimary}
              formatNum={formatNum}
            />
            <DefectColumn
              title="Secondary"
              defects={secondaryDefects}
              total={totalSecondary}
              formatNum={formatNum}
            />
          </>
        )}

        {/* Only primary */}
        {hasPrimary && !hasSecondary && (
          <DefectColumn
            title="Primary"
            defects={primaryDefects}
            total={totalPrimary}
            formatNum={formatNum}
          />
        )}

        {/* Only secondary (primary collapsed) — full width */}
        {!hasPrimary && hasSecondary && (
          <DefectColumn
            title="Secondary"
            defects={secondaryDefects}
            total={totalSecondary}
            formatNum={formatNum}
          />
        )}

        {/* Neither */}
        {!hasPrimary && !hasSecondary && (
          <Text style={sectionStyles.emptyText}>No defects recorded</Text>
        )}
      </View>
    </View>
  )
}

interface CertificateCuppingDefectsProps {
  cuppingData: CuppingData | null
  defects: GreenBeanAnalysis['defects']
  hasQualityTemplate?: boolean
}

export function CertificateCuppingDefects({
  cuppingData,
  defects,
  hasQualityTemplate = false,
}: CertificateCuppingDefectsProps) {
  const hasCupping = cuppingData && cuppingData.attributes.length > 0
  const hasDefects = defects && (defects.primary.length > 0 || defects.secondary.length > 0)

  if (!hasCupping && !hasDefects) {
    return null
  }

  // If only defects (no cupping), show defects full width in its own box
  if (!hasCupping && hasDefects) {
    return (
      <View style={sectionStyles.defectsBox}>
        <DefectsList defects={defects} />
      </View>
    )
  }

  // If only cupping (no defects), show cupping full width in its own box
  if (hasCupping && !hasDefects) {
    return (
      <View style={sectionStyles.cuppingBox}>
        <CertificateCupping
          cuppingData={cuppingData}
          hasQualityTemplate={hasQualityTemplate}
        />
      </View>
    )
  }

  // Both cupping and defects - show in separate bordered boxes side by side
  return (
    <View style={sectionStyles.twoBoxLayout}>
      {/* Left Box: Cupping - with its own border */}
      <View style={sectionStyles.cuppingBox}>
        <CertificateCupping
          cuppingData={cuppingData}
          hasQualityTemplate={hasQualityTemplate}
        />
      </View>

      {/* Right Box: Defects - with its own border */}
      <View style={sectionStyles.defectsBox}>
        <DefectsList defects={defects} />
      </View>
    </View>
  )
}
