/**
 * Certificate cup status row
 * Shows: Clean Cup icon | Uniform Cup icon | separator | Taints | Faults
 */

import React from 'react'
import { View, Text, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const statusStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
    gap: 16,
  },
  cupSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cupLabel: {
    fontSize: 8,
    color: COLORS.dark,
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.border,
  },
  defectSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  defectItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  defectLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
  },
  defectValue: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  defectNone: {
    fontSize: 8,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
})

// Checkmark icon SVG component
function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M 2 7 L 5.5 10.5 L 12 4"
        stroke={COLORS.inSpec}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// X icon SVG component
function XIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M 3 3 L 11 11 M 11 3 L 3 11"
        stroke={COLORS.outOfSpec}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// Question mark / unknown icon
function UnknownIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path
        d="M 7 1 C 3.69 1 1 3.69 1 7 C 1 10.31 3.69 13 7 13 C 10.31 13 13 10.31 13 7 C 13 3.69 10.31 1 7 1"
        stroke={COLORS.muted}
        strokeWidth={1.5}
        fill="none"
      />
      <Path
        d="M 5.5 5.5 C 5.5 4.67 6.17 4 7 4 C 7.83 4 8.5 4.67 8.5 5.5 C 8.5 6.33 7.83 7 7 7 L 7 8.5"
        stroke={COLORS.muted}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M 7 10.5 L 7 10.5"
        stroke={COLORS.muted}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  )
}

interface CupStatusIconProps {
  value: boolean | null
}

function CupStatusIcon({ value }: CupStatusIconProps) {
  if (value === true) {
    return <CheckIcon />
  } else if (value === false) {
    return <XIcon />
  } else {
    return <UnknownIcon />
  }
}

export interface CertificateCupStatusProps {
  cleanCup: boolean | null
  uniformCup: boolean | null
  taints?: number | string | null
  faults?: number | string | null
}

export function CertificateCupStatus({
  cleanCup,
  uniformCup,
  taints,
  faults,
}: CertificateCupStatusProps) {
  // Format taints/faults display
  const formatDefectValue = (value: number | string | null | undefined): string | null => {
    if (value === null || value === undefined) return null
    if (typeof value === 'number') {
      return value === 0 ? 'None' : value.toString()
    }
    return value || 'None'
  }

  const taintsDisplay = formatDefectValue(taints)
  const faultsDisplay = formatDefectValue(faults)

  // Only render if we have any data
  const hasData = cleanCup !== null || uniformCup !== null || taintsDisplay || faultsDisplay
  if (!hasData) {
    return null
  }

  return (
    <View style={statusStyles.container}>
      {/* Clean Cup and Uniform Cup icons */}
      <View style={statusStyles.cupSection}>
        <View style={statusStyles.cupItem}>
          <CupStatusIcon value={cleanCup} />
          <Text style={statusStyles.cupLabel}>Clean Cup</Text>
        </View>
        <View style={statusStyles.cupItem}>
          <CupStatusIcon value={uniformCup} />
          <Text style={statusStyles.cupLabel}>Uniform Cup</Text>
        </View>
      </View>

      {/* Separator */}
      {(taintsDisplay || faultsDisplay) && (
        <View style={statusStyles.separator} />
      )}

      {/* Taints and Faults */}
      <View style={statusStyles.defectSection}>
        {taintsDisplay && (
          <View style={statusStyles.defectItem}>
            <Text style={statusStyles.defectLabel}>Taints:</Text>
            <Text style={taintsDisplay === 'None' ? statusStyles.defectNone : statusStyles.defectValue}>
              {taintsDisplay}
            </Text>
          </View>
        )}
        {faultsDisplay && (
          <View style={statusStyles.defectItem}>
            <Text style={statusStyles.defectLabel}>Faults:</Text>
            <Text style={faultsDisplay === 'None' ? statusStyles.defectNone : statusStyles.defectValue}>
              {faultsDisplay}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}
