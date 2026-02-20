/**
 * Certificate physical properties section
 * Left: Green Bean (Moisture, Density, Aspect)
 * Right: Roast (Quakers, Roast Aspect)
 * Supports out-of-spec highlighting (red+bold) with limit notes
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
  sectionLeft: {
    width: 290,
    padding: 8,
  },
  sectionRight: {
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
  valueOutOfSpec: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.outOfSpec,
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
  specNote: {
    fontSize: 7,
    color: COLORS.outOfSpec,
  },
})

interface PropertyItemProps {
  label: string
  value: string | number | null
  unit?: string
  small?: boolean
  outOfSpec?: boolean
  specNote?: string
  integer?: boolean
}

function PropertyItem({ label, value, unit, small, outOfSpec, specNote, integer }: PropertyItemProps) {
  if (value === null || value === undefined || value === '') return null

  const formatValue = (v: string | number) => {
    if (typeof v !== 'number') return v
    return integer ? String(Math.round(v)) : v.toFixed(1)
  }

  return (
    <View style={propStyles.propertyItem}>
      <Text style={propStyles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Text style={outOfSpec ? propStyles.valueOutOfSpec : (small ? propStyles.valueSmall : propStyles.value)}>
          {formatValue(value)}
        </Text>
        {unit && (
          <Text style={outOfSpec ? { ...propStyles.unit, color: COLORS.outOfSpec } : propStyles.unit}>
            {' '}{unit}
          </Text>
        )}
        {specNote && <Text style={propStyles.specNote}> {specNote}</Text>}
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
  // Spec limits
  moistureMin?: number
  moistureMax?: number
  maxQuakers?: number
  showQuakers?: boolean
}

export function CertificatePhysicalProperties({
  moisture,
  density,
  greenAspect,
  quakers,
  roastAspect,
  moistureMin,
  moistureMax,
  maxQuakers,
  showQuakers,
}: CertificatePhysicalPropertiesProps) {
  // Check if we have any data to display
  const hasGreenData = moisture !== null || density !== null || greenAspect
  // Only show quakers if the quality spec asks for it (showQuakers=true)
  const shouldShowQuakers = showQuakers === true
  const hasRoastData = shouldShowQuakers || roastAspect

  if (!hasGreenData && !hasRoastData) {
    return null
  }

  // Moisture out-of-spec check
  let moistureOutOfSpec = false
  let moistureNote = ''
  if (moisture !== null) {
    if (moistureMin !== undefined && moisture < moistureMin) {
      moistureOutOfSpec = true
      moistureNote = `(min ${moistureMin}%)`
    } else if (moistureMax !== undefined && moisture > moistureMax) {
      moistureOutOfSpec = true
      moistureNote = `(max ${moistureMax}%)`
    }
  }

  // Quakers out-of-spec check
  let quakersOutOfSpec = false
  let quakersNote = ''
  if (quakers !== null && maxQuakers !== undefined && quakers > maxQuakers) {
    quakersOutOfSpec = true
    quakersNote = `(max ${maxQuakers})`
  }

  return (
    <View style={propStyles.container}>
      {/* Green Bean Section */}
      <View style={propStyles.sectionLeft}>
        <Text style={propStyles.sectionTitle}>Green Bean</Text>
        <View style={propStyles.propertiesRow}>
          <PropertyItem
            label="Moisture"
            value={moisture}
            unit="%"
            outOfSpec={moistureOutOfSpec}
            specNote={moistureNote}
          />
          <PropertyItem label="Density" value={density} unit="g/L" />
          {greenAspect && (
            <PropertyItem label="Aspect" value={greenAspect} small />
          )}
        </View>
      </View>

      <View style={propStyles.separator} />

      {/* Roast Section */}
      <View style={propStyles.sectionRight}>
        <Text style={propStyles.sectionTitle}>Roast Analysis</Text>
        <View style={propStyles.propertiesRow}>
          {shouldShowQuakers && (
            <PropertyItem
              label="Quakers"
              value={quakers}
              outOfSpec={quakersOutOfSpec}
              specNote={quakersNote}
              integer
            />
          )}
          {roastAspect && (
            <PropertyItem label="Roast Aspect" value={roastAspect} small />
          )}
        </View>
      </View>
    </View>
  )
}
