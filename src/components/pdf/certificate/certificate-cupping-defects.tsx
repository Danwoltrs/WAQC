/**
 * Certificate cupping and defects combined section
 * Layout: Two separate bordered boxes - Cupping (left) | Defects (right)
 * Defects displayed as compact columns: Name (wt), Count, FD
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
    width: 20,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: 'right',
  },
  defectFDHeader: {
    width: 24,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: 'right',
  },
  // Defect data rows - aligned columns, no wrapping
  defectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 1,
  },
  defectName: {
    flex: 1,
    fontSize: 8,
    color: COLORS.dark,
    flexDirection: 'row',
  },
  defectWeight: {
    fontSize: 7,
    color: COLORS.muted,
  },
  defectCount: {
    width: 20,
    fontSize: 8,
    color: COLORS.dark,
    textAlign: 'right',
  },
  defectFD: {
    width: 24,
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
})

interface DefectsListProps {
  defects: GreenBeanAnalysis['defects']
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

      {/* Defects Columns */}
      <View style={sectionStyles.defectsRow}>
        {/* Primary Defects Column */}
        <View style={sectionStyles.defectTypeColumn}>
          <Text style={sectionStyles.defectTypeTitle}>Primary</Text>
          {/* Column headers */}
          <View style={sectionStyles.defectHeaderRow}>
            <Text style={sectionStyles.defectNameHeader}>Name</Text>
            <Text style={sectionStyles.defectCountHeader}>Cnt</Text>
            <Text style={sectionStyles.defectFDHeader}>FD</Text>
          </View>
          {primaryDefects.length === 0 ? (
            <Text style={sectionStyles.emptyText}>None</Text>
          ) : (
            <>
              {primaryDefects.map((defect, index) => (
                <View key={index} style={sectionStyles.defectRow}>
                  <Text style={sectionStyles.defectName}>
                    {defect.name} <Text style={sectionStyles.defectWeight}>({defect.weight})</Text>
                  </Text>
                  <Text style={sectionStyles.defectCount}>{defect.rawCount}</Text>
                  <Text style={sectionStyles.defectFD}>{formatNum(defect.weightedCount)}</Text>
                </View>
              ))}
            </>
          )}
          <View style={sectionStyles.defectTotal}>
            <Text style={sectionStyles.totalLabel}>Total:</Text>
            <Text style={sectionStyles.totalValue}>{formatNum(totalPrimary)}</Text>
          </View>
        </View>

        {/* Secondary Defects Column */}
        <View style={sectionStyles.defectTypeColumn}>
          <Text style={sectionStyles.defectTypeTitle}>Secondary</Text>
          {/* Column headers */}
          <View style={sectionStyles.defectHeaderRow}>
            <Text style={sectionStyles.defectNameHeader}>Name</Text>
            <Text style={sectionStyles.defectCountHeader}>Cnt</Text>
            <Text style={sectionStyles.defectFDHeader}>FD</Text>
          </View>
          {secondaryDefects.length === 0 ? (
            <Text style={sectionStyles.emptyText}>None</Text>
          ) : (
            <>
              {secondaryDefects.map((defect, index) => (
                <View key={index} style={sectionStyles.defectRow}>
                  <Text style={sectionStyles.defectName}>
                    {defect.name} <Text style={sectionStyles.defectWeight}>({defect.weight})</Text>
                  </Text>
                  <Text style={sectionStyles.defectCount}>{defect.rawCount}</Text>
                  <Text style={sectionStyles.defectFD}>{formatNum(defect.weightedCount)}</Text>
                </View>
              ))}
            </>
          )}
          <View style={sectionStyles.defectTotal}>
            <Text style={sectionStyles.totalLabel}>Total:</Text>
            <Text style={sectionStyles.totalValue}>{formatNum(totalSecondary)}</Text>
          </View>
        </View>
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
