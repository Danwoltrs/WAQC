/**
 * Certificate sample details row
 * Horizontal row with items separated by pipe |
 * Shows: Quantity | Sample Type | Container/ICO# | Origin | Micro-Origin
 */

import React from 'react'
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const detailStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 3,
  },
  value: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  separator: {
    fontSize: 9,
    color: COLORS.border,
    marginHorizontal: 8,
  },
  flag: {
    width: 18,
    height: 12,
    marginRight: 4,
    objectFit: 'contain',
  },
  originGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})

export interface CertificateSampleDetailsProps {
  // Quantity info
  bagsQuantityMt: number | null
  bags: number | null
  bagType: string | null
  bagWeightKg: number | null
  equivalent60kgBags: number | null
  // Sample info
  sampleType: string | null
  containerNumber?: string | null
  icoNumber: string | null
  // Origin
  origin: string | null
  originDisplay?: string | null
  microOrigin?: string | null
  flagBase64?: string
  // Shipment
  shipmentMonth?: string | null
}

function formatQuantity(props: CertificateSampleDetailsProps): string {
  const { bagsQuantityMt, bags, bagType, bagWeightKg, equivalent60kgBags } = props

  // Primary format: "21.6 MT"
  let result = ''
  if (bagsQuantityMt !== null && bagsQuantityMt > 0) {
    result = `${bagsQuantityMt.toFixed(1)} MT`
  }

  // Add packaging detail
  if (bagType && bagType.toLowerCase() !== 'bulk') {
    if (bags && bagWeightKg) {
      result += ` (${bags} x ${bagWeightKg}kg ${bagType})`
    } else if (bags) {
      result += ` (${bags} ${bagType})`
    }
  } else if (bagType?.toLowerCase() === 'bulk') {
    if (equivalent60kgBags) {
      result += ` (in bulk, eq. ${equivalent60kgBags} x 60kg bags)`
    } else {
      result += ' (in bulk)'
    }
  }

  return result || 'N/A'
}

function formatSampleType(sampleType: string | null): string {
  if (!sampleType) return 'N/A'
  // PSS = Pre-Shipment Sample, SS = Shipment Sample
  const typeMap: Record<string, string> = {
    'pre_shipment': 'PSS',
    'shipment': 'SS',
    'pss': 'PSS',
    'ss': 'SS',
    'arrival': 'Arrival',
    'production': 'Production',
    'offer': 'Offer',
  }
  const normalized = sampleType.toLowerCase().replace(/[_\-\s]/g, '_')
  return typeMap[normalized] || sampleType
}

export function CertificateSampleDetails(props: CertificateSampleDetailsProps) {
  const {
    sampleType,
    containerNumber,
    icoNumber,
    origin,
    originDisplay,
    microOrigin,
    flagBase64,
    shipmentMonth,
  } = props

  const quantity = formatQuantity(props)
  const formattedType = formatSampleType(sampleType)

  // Build items array - only include items with values
  const items: { label: string; value: string | React.ReactNode }[] = []

  // Quantity
  if (quantity !== 'N/A') {
    items.push({ label: 'Qty', value: quantity })
  }

  // Sample type
  if (formattedType !== 'N/A') {
    items.push({ label: 'Type', value: formattedType })
  }

  // Container# or ICO#
  if (containerNumber) {
    items.push({ label: 'Container', value: containerNumber })
  } else if (icoNumber) {
    items.push({ label: 'ICO', value: icoNumber })
  }

  // Shipment month
  if (shipmentMonth) {
    items.push({ label: 'Ship', value: shipmentMonth })
  }

  // Origin with flag
  const displayOrigin = originDisplay || origin
  if (displayOrigin) {
    const originElement = (
      <View style={detailStyles.originGroup}>
        {flagBase64 && (
          <Image src={flagBase64} style={detailStyles.flag} />
        )}
        <Text style={detailStyles.value}>{displayOrigin}</Text>
      </View>
    )
    items.push({ label: 'Origin', value: originElement })
  }

  // Micro-origin
  if (microOrigin) {
    items.push({ label: 'Region', value: microOrigin })
  }

  if (items.length === 0) {
    return null
  }

  return (
    <View style={detailStyles.container}>
      <View style={detailStyles.row}>
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            <View style={detailStyles.item}>
              <Text style={detailStyles.label}>{item.label}:</Text>
              {typeof item.value === 'string' ? (
                <Text style={detailStyles.value}>{item.value}</Text>
              ) : (
                item.value
              )}
            </View>
            {index < items.length - 1 && (
              <Text style={detailStyles.separator}>|</Text>
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  )
}
