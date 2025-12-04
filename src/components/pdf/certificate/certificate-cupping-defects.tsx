/**
 * Certificate cupping and defects combined section
 * Layout: Cupping (1/3) | Defects (2/3) - Primary and Secondary columns
 * Shows defect weight calculations inline: name | count x weight = weighted
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { CertificateCupping } from './certificate-cupping'
import type { CuppingData, GreenBeanAnalysis } from '@/lib/certificate-data'

const sectionStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  // Cupping column - 1/3
  cuppingColumn: {
    width: 180,
    paddingRight: 12,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.borderLight,
  },
  // Defects column - 2/3
  defectsColumn: {
    flex: 1,
  },
  // Defects summary header
  defectsSummary: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
    gap: 16,
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
  defectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 1,
  },
  defectName: {
    fontSize: 8,
    color: COLORS.dark,
    flex: 1,
  },
  defectCalc: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  defectRawCount: {
    fontSize: 8,
    color: COLORS.dark,
    textAlign: 'right',
    minWidth: 16,
  },
  defectWeight: {
    fontSize: 6,
    color: COLORS.muted,
  },
  defectWeighted: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
    minWidth: 20,
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
          {primaryDefects.length === 0 ? (
            <Text style={sectionStyles.emptyText}>None</Text>
          ) : (
            <>
              {primaryDefects.map((defect, index) => (
                <View key={index} style={sectionStyles.defectItem}>
                  <Text style={sectionStyles.defectName}>{defect.name}</Text>
                  <View style={sectionStyles.defectCalc}>
                    <Text style={sectionStyles.defectRawCount}>{defect.rawCount}</Text>
                    <Text style={sectionStyles.defectWeight}>x{defect.weight}</Text>
                    <Text style={sectionStyles.defectWeighted}>{formatNum(defect.weightedCount)}</Text>
                  </View>
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
          {secondaryDefects.length === 0 ? (
            <Text style={sectionStyles.emptyText}>None</Text>
          ) : (
            <>
              {secondaryDefects.map((defect, index) => (
                <View key={index} style={sectionStyles.defectItem}>
                  <Text style={sectionStyles.defectName}>{defect.name}</Text>
                  <View style={sectionStyles.defectCalc}>
                    <Text style={sectionStyles.defectRawCount}>{defect.rawCount}</Text>
                    <Text style={sectionStyles.defectWeight}>x{defect.weight}</Text>
                    <Text style={sectionStyles.defectWeighted}>{formatNum(defect.weightedCount)}</Text>
                  </View>
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

  // If only defects (no cupping), show defects full width
  if (!hasCupping && hasDefects) {
    return (
      <View style={sectionStyles.container}>
        <DefectsList defects={defects} />
      </View>
    )
  }

  // If only cupping (no defects), show cupping full width
  if (hasCupping && !hasDefects) {
    return (
      <View style={sectionStyles.container}>
        <CertificateCupping
          cuppingData={cuppingData}
          hasQualityTemplate={hasQualityTemplate}
        />
      </View>
    )
  }

  // Both cupping and defects - show side by side
  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.row}>
        {/* Cupping */}
        <View style={sectionStyles.cuppingColumn}>
          <CertificateCupping
            cuppingData={cuppingData}
            hasQualityTemplate={hasQualityTemplate}
          />
        </View>

        {/* Defects */}
        <View style={sectionStyles.defectsColumn}>
          <DefectsList defects={defects} />
        </View>
      </View>
    </View>
  )
}
