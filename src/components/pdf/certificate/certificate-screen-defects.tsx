/**
 * Certificate screen distribution and defects section
 * Two separate sections: Screen | Defects
 * Screen: sorted largest to smallest with pan always last
 * Defects: summary row on top, two columns (Primary | Secondary) with dotted lines to counts
 * Supports out-of-spec highlighting (red+bold) with limit notes
 *
 * Layout rules:
 * - When no primary defects: collapse primary column, show "No primary defects found" label,
 *   give secondary full width
 * - Defect name column is flexible with word-wrap; QTY and DEF are fixed narrow columns
 * - Minimum font size 8pt for defect data, weight coefficients in smaller subscript
 * - Total row is visually distinct with top border and semi-bold text
 * - Numbers right-aligned in their columns
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { ScreenSizeLimit } from '@/lib/certificate-data'

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 8,
    gap: 10,
  },
  // Screen section styles
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
  // Defects section styles
  defectsSection: {
    flex: 1,
    paddingVertical: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 4,
  },
  summaryValue: {
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.dark,
  },
  summaryValueOutOfSpec: {
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.outOfSpec,
  },
  summarySpecNote: {
    fontSize: 5,
    color: COLORS.outOfSpec,
    marginLeft: 2,
  },
  defectsColumnsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  defectColumn: {
    flex: 1,
  },
  defectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 2,
  },
  defectHeaderName: {
    flex: 1,
    fontSize: 6,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  defectHeaderQty: {
    width: 28,
    fontSize: 6,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  defectHeaderDef: {
    width: 28,
    fontSize: 6,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  columnSeparator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
    alignSelf: 'stretch',
    minHeight: 20,
  },
  defectColumnTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
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
  defectQty: {
    width: 28,
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
    textAlign: 'right',
  },
  defectDef: {
    width: 28,
    fontSize: 8,
    color: COLORS.dark,
    textAlign: 'right',
  },
  noPrimaryLabel: {
    fontSize: 7,
    color: COLORS.muted,
    marginBottom: 4,
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
  // Spec limits
  screenConstraints?: ScreenSizeLimit[]
  maxPrimaryDefects?: number
  maxSecondaryDefects?: number
  maxTotalDefects?: number
}

/**
 * Sort screen sizes: numeric sizes descending (19, 18, 17...), with 'pan' always last
 */
function extractScreenNumber(size: string | number): number {
  const str = String(size)
  // Extract number from strings like "Screen 14", "14", "Scr 14", etc.
  const match = str.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : NaN
}

/**
 * Format screen size label: "Screen 14" → "Scr. 14", plain "14" → "Scr. 14", keep "Pan"/"Fondo" as-is
 */
function formatScreenLabel(size: string | number): string {
  const str = String(size)
  const lower = str.toLowerCase()
  if (lower === 'pan' || lower === 'fondo') return str
  // Already has "Scr" prefix
  if (lower.startsWith('scr')) return str.replace(/^screen\s*/i, 'Scr. ')
  // Has "Screen" prefix
  if (lower.startsWith('screen')) return str.replace(/^screen\s*/i, 'Scr. ')
  // Plain number
  const num = str.match(/^\d+$/)
  if (num) return `Scr. ${str}`
  return str
}

function sortScreenSizes(sizes: ScreenSize[]): ScreenSize[] {
  return [...sizes].sort((a, b) => {
    const aStr = String(a.size).toLowerCase()
    const bStr = String(b.size).toLowerCase()

    // Pan/Fondo always goes last
    if (aStr === 'pan' || aStr === 'fondo') return 1
    if (bStr === 'pan' || bStr === 'fondo') return -1

    // Extract numeric values for comparison (handles "Screen 14", "14", etc.)
    const aNum = extractScreenNumber(a.size)
    const bNum = extractScreenNumber(b.size)

    // If both have numbers, sort descending (largest first)
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

/**
 * Check a screen size value against constraints
 */
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
      if (constraint.min_value !== undefined && percentage < constraint.min_value) {
        return { outOfSpec: true, note: `(min ${constraint.min_value}%)` }
      }
      break
    case 'maximum':
      if (constraint.max_value !== undefined && percentage > constraint.max_value) {
        return { outOfSpec: true, note: `(max ${constraint.max_value}%)` }
      }
      break
    case 'range':
      if (constraint.min_value !== undefined && percentage < constraint.min_value) {
        return { outOfSpec: true, note: `(min ${constraint.min_value}%)` }
      }
      if (constraint.max_value !== undefined && percentage > constraint.max_value) {
        return { outOfSpec: true, note: `(max ${constraint.max_value}%)` }
      }
      break
    case 'exact':
      if (constraint.min_value !== undefined && percentage !== constraint.min_value) {
        return { outOfSpec: true, note: `(req ${constraint.min_value}%)` }
      }
      break
  }

  return { outOfSpec: false, note: '' }
}

/**
 * Render a single defect column (Primary or Secondary)
 */
function DefectColumnContent({
  title,
  defects,
}: {
  title: string
  defects: Defect[]
}) {
  return (
    <View style={styles.defectColumn}>
      <Text style={styles.defectColumnTitle}>{title}</Text>
      <View style={styles.defectHeaderRow}>
        <Text style={styles.defectHeaderName}>Defect</Text>
        <Text style={styles.defectHeaderQty}>Qty</Text>
        <Text style={styles.defectHeaderDef}>Def</Text>
      </View>
      {defects.map((defect, index) => {
        const weight = defect.weight ?? 1
        const weighted = Math.round((defect.count * weight) * 100) / 100
        return (
          <View key={index} style={styles.defectRow}>
            <View style={styles.defectNameContainer}>
              <Text style={styles.defectName}>{defect.name}</Text>
              {weight !== 1 && (
                <Text style={styles.defectWeight}> ({weight})</Text>
              )}
            </View>
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

  // Defect summary out-of-spec checks
  const primaryVal = primaryDefectsCount ?? 0
  const secondaryVal = secondaryDefectsCount ?? 0
  const primaryOutOfSpec = maxPrimaryDefects !== undefined && primaryVal > maxPrimaryDefects
  const secondaryOutOfSpec = maxSecondaryDefects !== undefined && secondaryVal > maxSecondaryDefects
  const totalOutOfSpec = maxTotalDefects !== undefined && totalDefects > maxTotalDefects

  const hasPrimary = primaryDefects.length > 0
  const hasSecondary = secondaryDefects.length > 0

  return (
    <View style={styles.container}>
      {/* Screen Distribution Section */}
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

      {/* Separator between Screen and Defects */}
      {hasScreenData && (
        <View style={styles.screenDefectsSeparator} />
      )}

      {/* Defects Section */}
      <View style={styles.defectsSection}>
        {/* When no primary defects: show muted label and give secondary full width */}
        {!hasPrimary && hasSecondary && (
          <Text style={styles.noPrimaryLabel}>No primary defects found</Text>
        )}

        {/* Defect columns */}
        <View style={styles.defectsColumnsContainer}>
          {/* Two-column layout only when both have entries */}
          {hasPrimary && hasSecondary && (
            <>
              <DefectColumnContent title="Primary" defects={primaryDefects} />
              <View style={styles.columnSeparator} />
              <DefectColumnContent title="Secondary" defects={secondaryDefects} />
            </>
          )}

          {/* Only primary */}
          {hasPrimary && !hasSecondary && (
            <DefectColumnContent title="Primary" defects={primaryDefects} />
          )}

          {/* Only secondary (primary collapsed) — full width */}
          {!hasPrimary && hasSecondary && (
            <DefectColumnContent title="Secondary" defects={secondaryDefects} />
          )}
        </View>

        {/* Summary row below defect tables */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Primary:</Text>
            <Text style={primaryOutOfSpec ? styles.summaryValueOutOfSpec : styles.summaryValue}>
              {primaryDefectsCount ?? 0}
            </Text>
            {primaryOutOfSpec && (
              <Text style={styles.summarySpecNote}>(max {maxPrimaryDefects})</Text>
            )}
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Secondary:</Text>
            <Text style={secondaryOutOfSpec ? styles.summaryValueOutOfSpec : styles.summaryValue}>
              {typeof secondaryDefectsCount === 'number' && !isNaN(secondaryDefectsCount) ? secondaryDefectsCount.toFixed(2) : '0'}
            </Text>
            {secondaryOutOfSpec && (
              <Text style={styles.summarySpecNote}>(max {maxSecondaryDefects})</Text>
            )}
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total:</Text>
            <Text style={totalOutOfSpec ? styles.summaryValueOutOfSpec : styles.summaryValue}>
              {totalDefects.toFixed(2)}
            </Text>
            {totalOutOfSpec && (
              <Text style={styles.summarySpecNote}>(max {maxTotalDefects})</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
