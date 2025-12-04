/**
 * Certificate sample info component
 * Displays supply chain, sample details in compact rows
 * All text same size (9pt), only contracts smaller (8pt)
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
    fontSize: 9,
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
  // Single details row - spread across full width
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 9,
    color: COLORS.muted,
    marginRight: 4,
  },
  value: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
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
  // Sample info
  sampleType: string | null
  bags: number | null
  bagWeight: number | null
  bagsQuantityMt: number | null
  processingMethod: string | null
  icoNumber: string | null
  shipmentMonth: string | null
  // Origin
  origin: string
  originDisplay: string
  microOrigin: string | null
  flagBase64?: string
}

export function CertificateSampleInfo({
  exporter,
  roaster,
  sampleType,
  bags,
  bagWeight,
  bagsQuantityMt,
  processingMethod,
  icoNumber,
  shipmentMonth,
  origin,
  originDisplay,
  microOrigin,
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

  // Format bags display - show M/T primarily if available
  const formatBags = (): string => {
    if (bagsQuantityMt) {
      // Show M/T as primary with bag count as reference
      const mtStr = `${bagsQuantityMt.toFixed(3)} M/T`
      if (bags && bagWeight) {
        return `${mtStr} (${bags} x ${bagWeight}kg)`
      }
      return mtStr
    }
    if (!bags) return '-'
    if (bagWeight) {
      return `${bags} x ${bagWeight}kg`
    }
    return `${bags}`
  }

  // Format shipment month (YYYY-MM to Month YYYY)
  const formatShipmentMonth = (month: string | null): string => {
    if (!month) return '-'
    const [year, monthNum] = month.split('-')
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthIndex = parseInt(monthNum, 10) - 1
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${monthNames[monthIndex]} ${year}`
    }
    return month
  }

  // Format origin with micro-origin
  const formatOrigin = (): string => {
    const baseOrigin = originDisplay || origin
    if (microOrigin) {
      return `${baseOrigin} - ${microOrigin}`
    }
    return baseOrigin
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

      {/* Row 2: Type, Bags, Processing, ICO, Origin - spread across full width */}
      <View style={infoStyles.detailsRow}>
        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Type:</Text>
          <Text style={infoStyles.value}>{formatSampleType(sampleType)}</Text>
        </View>

        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Bags:</Text>
          <Text style={infoStyles.value}>{formatBags()}</Text>
        </View>

        <View style={infoStyles.item}>
          <Text style={infoStyles.label}>Processing:</Text>
          <Text style={infoStyles.value}>{processingMethod || '-'}</Text>
        </View>

        {icoNumber && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>ICO:</Text>
            <Text style={infoStyles.value}>{icoNumber}</Text>
          </View>
        )}

        {shipmentMonth && (
          <View style={infoStyles.item}>
            <Text style={infoStyles.label}>Shipment:</Text>
            <Text style={infoStyles.value}>{formatShipmentMonth(shipmentMonth)}</Text>
          </View>
        )}

        <View style={infoStyles.originItem}>
          <Text style={infoStyles.label}>Origin:</Text>
          <Text style={infoStyles.value}>{formatOrigin()}</Text>
          {flagBase64 && (
            <Image src={flagBase64} style={infoStyles.flag} />
          )}
        </View>
      </View>
    </View>
  )
}
