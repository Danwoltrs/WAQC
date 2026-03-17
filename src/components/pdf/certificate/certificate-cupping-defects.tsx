/**
 * Certificate cupping and defects combined section
 * Layout: Two separate bordered boxes - Cupping (left) | Defects (right)
 * Defects: totals in section headings, compact total row,
 *   alternating row bg (#fafafa), no leader dots
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { CertificateCupping } from './certificate-cupping'
import type { CuppingData, GreenBeanAnalysis } from '@/lib/certificate-data'

const ALT_ROW_BG = '#fafafa'

const sectionStyles = StyleSheet.create({
  twoBoxLayout: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
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
  defectsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  defectTypeColumn: {
    flex: 1,
  },
  // Section heading with inline score
  defectTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  defectTypeTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  defectTitleScore: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    marginLeft: 4,
  },
  // Header row — only Cnt and FD
  defectHeaderRow: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingBottom: 2,
    borderBottomWidth: 0.25,
    borderBottomColor: COLORS.borderLight,
  },
  defectHeaderSpacer: {
    flex: 1,
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
  // Defect data rows
  defectRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  defectRowAlt: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 2,
    paddingHorizontal: 2,
    backgroundColor: ALT_ROW_BG,
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
    color: '#9CA3AF',
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
  // Compact total row
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'baseline',
    marginTop: 4,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    marginRight: 4,
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
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
})

interface DefectsListProps {
  defects: GreenBeanAnalysis['defects']
}

/** Format number: integer as-is, decimal to 1 place */
function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(1)
}

/**
 * Render a defect column with heading score and rows
 */
function DefectColumn({
  title,
  defects,
  total,
}: {
  title: string
  defects: Array<{ name: string; rawCount: number; weight: number; weightedCount: number }>
  total: number
}) {
  return (
    <View style={sectionStyles.defectTypeColumn}>
      {/* Heading with inline score */}
      <View style={sectionStyles.defectTitleRow}>
        <Text style={sectionStyles.defectTypeTitle}>{title}</Text>
        <Text style={sectionStyles.defectTitleScore}>
          {` \u2014 ${fmtNum(total)} pts`}
        </Text>
      </View>
      {/* Header row — only Cnt and FD */}
      <View style={sectionStyles.defectHeaderRow}>
        <View style={sectionStyles.defectHeaderSpacer} />
        <Text style={sectionStyles.defectCountHeader}>Cnt</Text>
        <Text style={sectionStyles.defectFDHeader}>FD</Text>
      </View>
      {defects.map((defect, index) => {
        const isAlt = index % 2 === 1
        return (
          <View key={index} style={isAlt ? sectionStyles.defectRowAlt : sectionStyles.defectRow}>
            <View style={sectionStyles.defectNameContainer}>
              <Text style={sectionStyles.defectName}>{defect.name}</Text>
              <Text style={sectionStyles.defectWeight}> ({defect.weight})</Text>
            </View>
            <Text style={sectionStyles.defectCount}>{defect.rawCount}</Text>
            <Text style={sectionStyles.defectFD}>{fmtNum(defect.weightedCount)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function DefectsList({ defects }: DefectsListProps) {
  const primaryDefects = defects?.primary || []
  const secondaryDefects = defects?.secondary || []
  const totalPrimary = defects?.total_primary || 0
  const totalSecondary = defects?.total_secondary || 0
  const grandTotal = totalPrimary + totalSecondary

  const hasPrimary = primaryDefects.length > 0
  const hasSecondary = secondaryDefects.length > 0

  return (
    <View>
      {!hasPrimary && hasSecondary && (
        <Text style={sectionStyles.noPrimaryLabel}>No primary defects</Text>
      )}

      <View style={sectionStyles.defectsRow}>
        {hasPrimary && hasSecondary && (
          <>
            <DefectColumn title="Primary" defects={primaryDefects} total={totalPrimary} />
            <DefectColumn title="Secondary" defects={secondaryDefects} total={totalSecondary} />
          </>
        )}
        {hasPrimary && !hasSecondary && (
          <DefectColumn title="Primary" defects={primaryDefects} total={totalPrimary} />
        )}
        {!hasPrimary && hasSecondary && (
          <DefectColumn title="Secondary" defects={secondaryDefects} total={totalSecondary} />
        )}
        {!hasPrimary && !hasSecondary && (
          <Text style={sectionStyles.emptyText}>No defects recorded</Text>
        )}
      </View>

      {/* Compact total row */}
      <View style={sectionStyles.totalRow}>
        <Text style={sectionStyles.totalLabel}>Total:</Text>
        <Text style={sectionStyles.totalValue}>{fmtNum(grandTotal)}</Text>
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

  if (!hasCupping && hasDefects) {
    return (
      <View style={sectionStyles.defectsBox}>
        <DefectsList defects={defects} />
      </View>
    )
  }

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

  return (
    <View style={sectionStyles.twoBoxLayout}>
      <View style={sectionStyles.cuppingBox}>
        <CertificateCupping
          cuppingData={cuppingData}
          hasQualityTemplate={hasQualityTemplate}
        />
      </View>
      <View style={sectionStyles.defectsBox}>
        <DefectsList defects={defects} />
      </View>
    </View>
  )
}
