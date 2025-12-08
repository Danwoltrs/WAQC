/**
 * Certificate physical properties section
 * Left: Green Bean (Moisture, Density, Aspect)
 * Right: Roast (Quakers, Roast Aspect)
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const propStyles = StyleSheet.create({
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
  propertiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  propertyItem: {
    minWidth: 60,
  },
  label: {
    fontSize: 7,
    color: COLORS.muted,
    marginBottom: 1,
  },
  value: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.dark,
  },
  valueSmall: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  unit: {
    fontSize: 7,
    color: COLORS.muted,
  },
})

interface PropertyItemProps {
  label: string
  value: string | number | null
  unit?: string
  small?: boolean
}

function PropertyItem({ label, value, unit, small }: PropertyItemProps) {
  if (value === null || value === undefined || value === '') return null

  return (
    <View style={propStyles.propertyItem}>
      <Text style={propStyles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={small ? propStyles.valueSmall : propStyles.value}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </Text>
        {unit && <Text style={propStyles.unit}> {unit}</Text>}
      </View>
    </View>
  )
}

export interface CertificatePhysicalPropertiesProps {
  // Green bean properties
  moisture: number | null
  density: number | null
  greenAspect?: string | null
  // Roast properties
  quakers: number | null
  roastAspect?: string | null
}

export function CertificatePhysicalProperties({
  moisture,
  density,
  greenAspect,
  quakers,
  roastAspect,
}: CertificatePhysicalPropertiesProps) {
  // Check if we have any data to display
  const hasGreenData = moisture !== null || density !== null || greenAspect
  const hasRoastData = quakers !== null || roastAspect

  if (!hasGreenData && !hasRoastData) {
    return null
  }

  return (
    <View style={propStyles.container}>
      {/* Green Bean Section */}
      <View style={propStyles.section}>
        <Text style={propStyles.sectionTitle}>Green Bean</Text>
        <View style={propStyles.propertiesRow}>
          <PropertyItem label="Moisture" value={moisture} unit="%" />
          <PropertyItem label="Density" value={density} unit="g/L" />
          {greenAspect && (
            <PropertyItem label="Aspect" value={greenAspect} small />
          )}
        </View>
      </View>

      <View style={propStyles.separator} />

      {/* Roast Section */}
      <View style={propStyles.section}>
        <Text style={propStyles.sectionTitle}>Roast Analysis</Text>
        <View style={propStyles.propertiesRow}>
          <PropertyItem label="Quakers" value={quakers} />
          {roastAspect && (
            <PropertyItem label="Roast Aspect" value={roastAspect} small />
          )}
        </View>
      </View>
    </View>
  )
}
