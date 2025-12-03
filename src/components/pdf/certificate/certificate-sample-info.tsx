/**
 * Certificate sample info component
 * Displays supply chain, certificate #, sample details, and origin
 * Redesigned to merge supply chain info and use consistent font sizes
 */

import React from 'react'
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { SupplyChainEntity } from '@/lib/certificate-data'

const infoStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  // Supply chain row (Exporter and Roaster)
  supplyChainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    marginBottom: 6,
  },
  entityGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  entityLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 4,
  },
  entityName: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  entityContract: {
    fontSize: 8,
    color: COLORS.muted,
    marginLeft: 4,
  },
  // Details row (Certificate #, Type, Bags)
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
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
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  // Origin row with flag
  originRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  originItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flag: {
    width: 20,
    height: 14,
    objectFit: 'contain',
  },
})

interface CertificateSampleInfoProps {
  // Supply chain
  exporter: SupplyChainEntity
  roaster: SupplyChainEntity
  // Certificate info
  certificateNumber: string | null
  // Sample info
  sampleType: string | null
  bags: number | null
  bagWeight: number | null
  processingMethod: string | null
  icoNumber: string | null
  // Origin
  origin: string
  originDisplay: string
  flagBase64?: string
}

export function CertificateSampleInfo({
  exporter,
  roaster,
  certificateNumber,
  sampleType,
  bags,
  bagWeight,
  processingMethod,
  icoNumber,
  origin,
  originDisplay,
  flagBase64,
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
    return `${bags}`
  }

  const hasExporter = Boolean(exporter.name)
  const hasRoaster = Boolean(roaster.name)

  return (
    <View style={infoStyles.container}>
      {/* Row 1: Supply Chain (Exporter and Roaster) */}
      {(hasExporter || hasRoaster) && (
        <View style={infoStyles.supplyChainRow}>
          {hasExporter && (
            <View style={infoStyles.entityGroup}>
              <Text style={infoStyles.entityLabel}>Exporter:</Text>
              <Text style={infoStyles.entityName}>{exporter.name}</Text>
              {exporter.contract && (
                <Text style={infoStyles.entityContract}>({exporter.contract})</Text>
              )}
            </View>
          )}
          {hasRoaster && (
            <View style={infoStyles.entityGroup}>
              <Text style={infoStyles.entityLabel}>Roaster:</Text>
              <Text style={infoStyles.entityName}>{roaster.name}</Text>
              {roaster.contract && (
                <Text style={infoStyles.entityContract}>({roaster.contract})</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Row 2: Certificate #, Type, Bags */}
      <View style={infoStyles.detailsRow}>
        {certificateNumber && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>Certificate #:</Text>
            <Text style={infoStyles.value}>{certificateNumber}</Text>
          </View>
        )}

        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Type:</Text>
          <Text style={infoStyles.value}>{formatSampleType(sampleType)}</Text>
        </View>

        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Bags:</Text>
          <Text style={infoStyles.value}>{formatBags()}</Text>
        </View>
      </View>

      {/* Row 3: Processing, ICO, Origin with flag */}
      <View style={infoStyles.originRow}>
        {processingMethod && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>Processing:</Text>
            <Text style={infoStyles.value}>{processingMethod}</Text>
          </View>
        )}

        {icoNumber && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>ICO:</Text>
            <Text style={infoStyles.value}>{icoNumber}</Text>
          </View>
        )}

        <View style={infoStyles.originItem}>
          <Text style={infoStyles.label}>Origin:</Text>
          <Text style={infoStyles.value}>{originDisplay || origin}</Text>
          {flagBase64 && (
            <Image src={flagBase64} style={infoStyles.flag} />
          )}
        </View>
      </View>
    </View>
  )
}
