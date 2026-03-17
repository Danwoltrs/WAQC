/**
 * Certificate screen distribution and defects section
 * Two separate sections: Screen | Defects
 * Screen: sorted largest to smallest with pan always last
 * Defects: constrained width (~55%), totals in section headings,
 *   compact total row, alternating row bg (#fafafa)
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { ScreenSizeLimit } from '@/lib/certificate-data'

const ALT_ROW_BG = '#fafafa'

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 8,
    gap: 10,
  },
  screenSection: {
    width: 100,
    padding: 6,
  },
  screenDefectsSeparator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    marginHorizontal: 10,
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
    alignItems: 'baseline',
    paddingVertical: 1,
  },
  screenLabel: {
    fontSize: 7,
    color: COLORS.dark,
    width: 42,
  },
  screenValue: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.dark,
  },
  screenValueOutOfSpec: {
    fontSize: 7,
    fontWeight: 700,
    color: COLORS.outOfSpec,
  },
  screenSpecNote: {
    fontSize: 5,
    color: COLORS.outOfSpec,
    marginLeft: 2,
  },
  // Defects section
  defectsSection: {
    flex: 1,
    paddingVertical: 6,
  },
  // Base container for defect columns — width set inline based on column count
  defectsColumnsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  columnSeparator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
    alignSelf: 'stretch',
    minHeight: 20,
  },
  // Section heading — just "PRIMARY" or "SECONDARY"
  defectColumnTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  // Header row — only QTY and DEF
  defectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 2,
  },
  defectHeaderSpacer: {
    flex: 1,
  },
  defectHeaderQty: {
    width: 30,
    fontSize: 6,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  defectHeaderDef: {
    width: 30,
    fontSize: 6,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
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
  defectNameText: {
    flex: 1,
    fontSize: 8,
    color: COLORS.dark,
    marginRight: 4,
  },
  defectQty: {
    width: 30,
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
  },
  defectDef: {
    width: 30,
    fontSize: 8,
    color: COLORS.dark,
    textAlign: 'right',
  },
  // Summary row: "Primary: 4 (max 1) | Secondary: 29.50 | Total: 33.50 (max 33)"
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
    gap: 6,
  },
  summaryText: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
  },
  summaryTextOutOfSpec: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.outOfSpec,
  },
  summaryValue: {
    fontSize: 7,
    fontWeight: 700,
    color: COLORS.dark,
  },
  summaryValueOutOfSpec: {
    fontSize: 7,
    fontWeight: 700,
    color: COLORS.outOfSpec,
  },
  summarySeparator: {
    fontSize: 7,
    color: COLORS.borderLight,
  },
  summarySpecNote: {
    fontSize: 5,
    color: COLORS.outOfSpec,
    marginLeft: 2,
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
  screenConstraints?: ScreenSizeLimit[]
  maxPrimaryDefects?: number
  maxSecondaryDefects?: number
  maxTotalDefects?: number
}

function extractScreenNumber(size: string | number): number {
  const str = String(size)
  const match = str.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : NaN
}

function formatScreenLabel(size: string | number): string {
  const str = String(size)
  const lower = str.toLowerCase()
  if (lower === 'pan' || lower === 'fondo') return str
  if (lower.startsWith('scr')) return str.replace(/^screen\s*/i, 'Scr. ')
  if (lower.startsWith('screen')) return str.replace(/^screen\s*/i, 'Scr. ')
  const num = str.match(/^\d+$/)
  if (num) return `Scr. ${str}`
  return str
}

function sortScreenSizes(sizes: ScreenSize[]): ScreenSize[] {
  return [...sizes].sort((a, b) => {
    const aStr = String(a.size).toLowerCase()
    const bStr = String(b.size).toLowerCase()
    if (aStr === 'pan' || aStr === 'fondo') return 1
    if (bStr === 'pan' || bStr === 'fondo') return -1
    const aNum = extractScreenNumber(a.size)
    const bNum = extractScreenNumber(b.size)
    if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum
    if (isNaN(aNum)) return 1
    if (isNaN(bNum)) return -1
    return 0
  })
}

function sortDefects(defects: Defect[]): Defect[] {
  return [...defects].sort((a, b) => b.count - a.count)
}

function checkScreenSpec(
  size: string | number,
  percentage: number | null,
  constraints?: ScreenSizeLimit[]
): { outOfSpec: boolean; note: string } {
  if (!constraints || percentage === null) return { outOfSpec: false, note: '' }
  const sizeStr = String(size).toLowerCase()
  const constraint = constraints.find(c => c.screen_size.toLowerCase() === sizeStr)
  if (!constraint) return { outOfSpec: false, note: '' }
  switch (constraint.constraint_type) {
    case 'minimum':
      if (constraint.min_value !== undefined && percentage < constraint.min_value)
        return { outOfSpec: true, note: `(min ${constraint.min_value}%)` }
      break
    case 'maximum':
      if (constraint.max_value !== undefined && percentage > constraint.max_value)
        return { outOfSpec: true, note: `(max ${constraint.max_value}%)` }
      break
    case 'range':
      if (constraint.min_value !== undefined && percentage < constraint.min_value)
        return { outOfSpec: true, note: `(min ${constraint.min_value}%)` }
      if (constraint.max_value !== undefined && percentage > constraint.max_value)
        return { outOfSpec: true, note: `(max ${constraint.max_value}%)` }
      break
    case 'exact':
      if (constraint.min_value !== undefined && percentage !== constraint.min_value)
        return { outOfSpec: true, note: `(req ${constraint.min_value}%)` }
      break
  }
  return { outOfSpec: false, note: '' }
}

/** Format number: integer as-is, decimal to 2 places */
function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2)
}

/**
 * Render a defect column: heading with score, rows with name + qty + def
 */
/** Estimate column width from defect names: ~4.2px/char + QTY(30) + DEF(30) + padding */
function estimateColumnWidth(defects: Defect[]): number {
  const names = defects.map(d => {
    const w = d.weight ?? 1
    return w !== 1 ? `${d.name} (${w})` : d.name
  })
  const longest = names.reduce((a, b) => a.length > b.length ? a : b, '')
  return Math.max(longest.length * 4.2 + 30 + 30 + 16, 120)
}

function DefectColumnContent({
  title,
  defects,
  columnWidth,
}: {
  title: string
  defects: Defect[]
  columnWidth?: number
}) {
  const style = columnWidth ? { width: columnWidth } : {}
  return (
    <View style={style}>
      <Text style={styles.defectColumnTitle}>{title}</Text>
      {/* Header row — QTY and DEF */}
      <View style={styles.defectHeaderRow}>
        <View style={styles.defectHeaderSpacer} />
        <Text style={styles.defectHeaderQty}>Qty</Text>
        <Text style={styles.defectHeaderDef}>Def</Text>
      </View>
      {defects.map((defect, index) => {
        const weight = defect.weight ?? 1
        const weighted = Math.round((defect.count * weight) * 100) / 100
        const isAlt = index % 2 === 1
        const nameWithCoeff = weight !== 1
          ? `${defect.name} (${weight})`
          : defect.name
        return (
          <View key={index} style={isAlt ? styles.defectRowAlt : styles.defectRow}>
            <Text style={styles.defectNameText}>{nameWithCoeff}</Text>
            <Text style={styles.defectQty}>{defect.count}</Text>
            <Text style={styles.defectDef}>{weighted}</Text>
          </View>
        )
      })}
    </View>
  )
}

export function CertificateScreenDefects({
  screenSizes,
  defects,
  primaryDefectsCount,
  secondaryDefectsCount,
  screenConstraints,
  maxPrimaryDefects,
  maxSecondaryDefects,
  maxTotalDefects,
}: CertificateScreenDefectsProps) {
  const hasScreenData = screenSizes && screenSizes.length > 0
  const hasDefectData = defects && defects.length > 0

  if (!hasScreenData && !hasDefectData) {
    return null
  }

  const sortedScreenSizes = hasScreenData ? sortScreenSizes(screenSizes!) : []

  let primaryDefects: Defect[] = []
  let secondaryDefects: Defect[] = []

  if (defects) {
    primaryDefects = sortDefects(defects.filter(d => d.category === 'primary'))
    secondaryDefects = sortDefects(defects.filter(d => d.category === 'secondary'))
    if (primaryDefects.length === 0 && secondaryDefects.length === 0) {
      secondaryDefects = sortDefects([...defects])
    }
  }

  const totalDefects = ((primaryDefectsCount ?? 0) + (secondaryDefectsCount ?? 0))
  const primaryVal = primaryDefectsCount ?? 0
  const secondaryVal = secondaryDefectsCount ?? 0
  const primaryOutOfSpec = maxPrimaryDefects !== undefined && primaryVal > maxPrimaryDefects
  const secondaryOutOfSpec = maxSecondaryDefects !== undefined && secondaryVal > maxSecondaryDefects

  // Estimate single-column width from longest defect name
  // ~4.2px per char at 8pt Inter + coefficient text + 30+30 for QTY/DEF + padding
  const allDefectNames = [...primaryDefects, ...secondaryDefects].map(d => {
    const w = d.weight ?? 1
    return w !== 1 ? `${d.name} (${w})` : d.name
  })
  const longestName = allDefectNames.reduce((a, b) => a.length > b.length ? a : b, '')
  const estimatedNameWidth = longestName.length * 4.2
  const singleColumnWidth = Math.min(Math.max(estimatedNameWidth + 30 + 30 + 20, 160), 320)
  const totalOutOfSpec = maxTotalDefects !== undefined && totalDefects > maxTotalDefects

  const hasPrimary = primaryDefects.length > 0
  const hasSecondary = secondaryDefects.length > 0

  return (
    <View style={styles.container}>
      {/* Screen Distribution */}
      {hasScreenData && (
        <View style={styles.screenSection}>
          <Text style={styles.screenTitle}>Screen</Text>
          {sortedScreenSizes.map((screen, index) => {
            const spec = checkScreenSpec(screen.size, screen.percentage, screenConstraints)
            return (
              <View key={index} style={styles.screenRow}>
                <Text style={styles.screenLabel}>{formatScreenLabel(screen.size)}</Text>
                <Text style={spec.outOfSpec ? styles.screenValueOutOfSpec : styles.screenValue}>
                  {screen.percentage !== null ? `${Math.round(screen.percentage)}%` : '-'}
                </Text>
                {spec.note && <Text style={styles.screenSpecNote}>{spec.note}</Text>}
              </View>
            )
          })}
        </View>
      )}

      {hasScreenData && <View style={styles.screenDefectsSeparator} />}

      {/* Defects Section */}
      <View style={styles.defectsSection}>
        {/* Summary line: No primary defects | Secondary: 7.50 | Total: 7.50 */}
        <View style={styles.summaryRow}>
          <Text style={primaryOutOfSpec ? styles.summaryTextOutOfSpec : styles.summaryText}>
            {hasPrimary ? `Primary: ` : 'No primary defects'}
          </Text>
          {hasPrimary && (
            <>
              <Text style={primaryOutOfSpec ? styles.summaryValueOutOfSpec : styles.summaryValue}>
                {fmtNum(primaryVal)}
              </Text>
              {primaryOutOfSpec && maxPrimaryDefects !== undefined && (
                <Text style={styles.summarySpecNote}>(max {maxPrimaryDefects})</Text>
              )}
            </>
          )}
          <Text style={styles.summarySeparator}>|</Text>
          <Text style={secondaryOutOfSpec ? styles.summaryTextOutOfSpec : styles.summaryText}>
            Secondary:{' '}
          </Text>
          <Text style={secondaryOutOfSpec ? styles.summaryValueOutOfSpec : styles.summaryValue}>
            {fmtNum(secondaryVal)}
          </Text>
          {secondaryOutOfSpec && maxSecondaryDefects !== undefined && (
            <Text style={styles.summarySpecNote}>(max {maxSecondaryDefects})</Text>
          )}
          <Text style={styles.summarySeparator}>|</Text>
          <Text style={totalOutOfSpec ? styles.summaryTextOutOfSpec : styles.summaryText}>
            Total:{' '}
          </Text>
          <Text style={totalOutOfSpec ? styles.summaryValueOutOfSpec : styles.summaryValue}>
            {fmtNum(totalDefects)}
          </Text>
          {totalOutOfSpec && maxTotalDefects !== undefined && (
            <Text style={styles.summarySpecNote}>(max {maxTotalDefects})</Text>
          )}
        </View>

        {/* Defect columns — each sized to its content */}
        <View style={styles.defectsColumnsContainer}>
          {hasPrimary && hasSecondary && (
            <>
              <DefectColumnContent
                title="Primary"
                defects={primaryDefects}
                columnWidth={estimateColumnWidth(primaryDefects)}
              />
              <View style={styles.columnSeparator} />
              <DefectColumnContent
                title="Secondary"
                defects={secondaryDefects}
                columnWidth={estimateColumnWidth(secondaryDefects)}
              />
            </>
          )}
          {hasPrimary && !hasSecondary && (
            <DefectColumnContent
              title="Primary"
              defects={primaryDefects}
              columnWidth={singleColumnWidth}
            />
          )}
          {!hasPrimary && hasSecondary && (
            <DefectColumnContent
              title="Secondary"
              defects={secondaryDefects}
              columnWidth={singleColumnWidth}
            />
          )}
        </View>
      </View>
    </View>
  )
}
