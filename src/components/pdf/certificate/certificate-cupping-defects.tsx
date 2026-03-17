/**
 * Certificate cupping and defects combined section
 * Layout: Two separate bordered boxes - Cupping (left) | Defects (right)
 * Defects: menu-style layout with leader dots, alternating rows,
 *   clean totals block, no "Defect"/"Name" column header
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { CertificateCupping } from './certificate-cupping'
import type { CuppingData, GreenBeanAnalysis } from '@/lib/certificate-data'

const LEADER_DOTS = ' . . . . . . . . . . . . . . . . . . . . '
const ALT_ROW_BG = '#f9f9f9'

const sectionStyles = StyleSheet.create({
  // Two-box layout container
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
  defectTypeTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  // Header row — only Cnt and FD labels, no "Name" column header
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
  // Defect data rows with leader dots
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
  defectName: {
    fontSize: 8,
    color: COLORS.dark,
  },
  defectWeight: {
    fontSize: 6,
    color: '#9CA3AF',
    marginLeft: 1,
  },
  leaderDots: {
    flex: 1,
    fontSize: 6,
    color: '#D1D5DB',
    overflow: 'hidden',
    marginHorizontal: 2,
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
  // Totals block — right-aligned, separated by border
  totalsBlock: {
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  totalsLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 6,
  },
  totalsValue: {
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

/**
 * Render a single defect column with menu-style layout
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
      {/* Header row — only Cnt and FD, no "Name" */}
      <View style={sectionStyles.defectHeaderRow}>
        <View style={sectionStyles.defectHeaderSpacer} />
        <Text style={sectionStyles.defectCountHeader}>Cnt</Text>
        <Text style={sectionStyles.defectFDHeader}>FD</Text>
      </View>
      {defects.map((defect, index) => {
        const isAlt = index % 2 === 1
        return (
          <View key={index} style={isAlt ? sectionStyles.defectRowAlt : sectionStyles.defectRow}>
            <Text style={sectionStyles.defectName}>{defect.name}</Text>
            <Text style={sectionStyles.defectWeight}> ({defect.weight})</Text>
            <Text style={sectionStyles.leaderDots}>{LEADER_DOTS}</Text>
            <Text style={sectionStyles.defectCount}>{defect.rawCount}</Text>
            <Text style={sectionStyles.defectFD}>{formatNum(defect.weightedCount)}</Text>
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

  const formatNum = (n: number) => {
    if (Number.isInteger(n)) return n.toString()
    return n.toFixed(1)
  }

  const hasPrimary = primaryDefects.length > 0
  const hasSecondary = secondaryDefects.length > 0
  const showBothTotals = hasPrimary && hasSecondary

  return (
    <View>
      {/* When no primary defects: show muted label */}
      {!hasPrimary && hasSecondary && (
        <Text style={sectionStyles.noPrimaryLabel}>No primary defects</Text>
      )}

      {/* Defects Columns */}
      <View style={sectionStyles.defectsRow}>
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
        {hasPrimary && !hasSecondary && (
          <DefectColumn
            title="Primary"
            defects={primaryDefects}
            total={totalPrimary}
            formatNum={formatNum}
          />
        )}
        {!hasPrimary && hasSecondary && (
          <DefectColumn
            title="Secondary"
            defects={secondaryDefects}
            total={totalSecondary}
            formatNum={formatNum}
          />
        )}
        {!hasPrimary && !hasSecondary && (
          <Text style={sectionStyles.emptyText}>No defects recorded</Text>
        )}
      </View>

      {/* Totals block — clean, right-aligned */}
      <View style={sectionStyles.totalsBlock}>
        {showBothTotals && (
          <>
            <View style={sectionStyles.totalsRow}>
              <Text style={sectionStyles.totalsLabel}>Primary:</Text>
              <Text style={sectionStyles.totalsValue}>{formatNum(totalPrimary)}</Text>
            </View>
            <View style={sectionStyles.totalsRow}>
              <Text style={sectionStyles.totalsLabel}>Secondary:</Text>
              <Text style={sectionStyles.totalsValue}>{formatNum(totalSecondary)}</Text>
            </View>
          </>
        )}
        <View style={sectionStyles.totalsRow}>
          <Text style={sectionStyles.totalsLabel}>Total defects:</Text>
          <Text style={sectionStyles.totalsValue}>{formatNum(grandTotal)}</Text>
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
