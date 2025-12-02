/**
 * Certificate sample info component
 * Displays sample tracking number, type, bags, processing method, ICO
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const infoStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    padding: 10,
    backgroundColor: COLORS.background,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 4,
  },
  value: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.dark,
  },
  trackingNumber: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.dark,
  },
})

interface CertificateSampleInfoProps {
  trackingNumber: string
  sampleType: string | null
  bags: number | null
  bagWeight: number | null
  processingMethod: string | null
  icoNumber: string | null
  containerNr: string | null
}

export function CertificateSampleInfo({
  trackingNumber,
  sampleType,
  bags,
  bagWeight,
  processingMethod,
  icoNumber,
  containerNr,
}: CertificateSampleInfoProps) {
  // Format sample type display
  const formatSampleType = (type: string | null): string => {
    if (!type) return '-'
    const typeMap: Record<string, string> = {
      pss: 'PSS',
      ss: 'SS',
      type: 'Type',
    }
    return typeMap[type.toLowerCase()] || type.toUpperCase()
  }

  // Format bags display
  const formatBags = (): string => {
    if (!bags) return '-'
    if (bagWeight) {
      return `${bags} x ${bagWeight}kg`
    }
    return `${bags} bags`
  }

  return (
    <View style={infoStyles.container}>
      <View style={infoStyles.row}>
        {/* Tracking number */}
        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Tracking:</Text>
          <Text style={infoStyles.trackingNumber}>{trackingNumber}</Text>
        </View>

        {/* Sample type */}
        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Type:</Text>
          <Text style={infoStyles.value}>{formatSampleType(sampleType)}</Text>
        </View>

        {/* Bags */}
        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Bags:</Text>
          <Text style={infoStyles.value}>{formatBags()}</Text>
        </View>

        {/* Processing method */}
        {processingMethod && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>Processing:</Text>
            <Text style={infoStyles.value}>{processingMethod}</Text>
          </View>
        )}

        {/* ICO number */}
        {icoNumber && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>ICO:</Text>
            <Text style={infoStyles.value}>{icoNumber}</Text>
          </View>
        )}

        {/* Container number */}
        {containerNr && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>Container:</Text>
            <Text style={infoStyles.value}>{containerNr}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
