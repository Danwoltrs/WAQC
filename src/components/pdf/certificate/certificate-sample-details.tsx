/**
 * Certificate sample details row
 * Horizontal row with items separated by pipe |
 * Shows: Quantity | Sample Type | Container/ICO# | Micro-Origin
 * Note: Origin moved to header section
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
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
  // Region/micro-origin
  microOrigin?: string | null
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
  const normalizedBagType = bagType?.toLowerCase() || ''

  if (normalizedBagType === 'bulk') {
    // Bulk format: "21.6 MT (in bulk, eq. 360 × 60 kg bags)"
    if (equivalent60kgBags) {
      result += ` (in bulk, eq. ${equivalent60kgBags} × 60 kg bags)`
    } else {
      result += ' (in bulk)'
    }
  } else if (normalizedBagType === 'big bags' || normalizedBagType === 'bigbags' || normalizedBagType === 'big bag') {
    // Big bags format: "20 MT (in big bags, eq. 333 × 60 kg bags)"
    if (equivalent60kgBags) {
      result += ` (in big bags, eq. ${equivalent60kgBags} × 60 kg bags)`
    } else {
      result += ' (in big bags)'
    }
  } else if (bagType || bags) {
    // Standard bags format: "19.2 MT (320 × 60 kg jute bags)"
    // Only show equivalent if bag weight is NOT 60kg
    const parts: string[] = []

    // Show actual bags with weight and type
    if (bags && bagWeightKg) {
      const bagTypeLabel = bagType ? ` ${bagType}` : ''
      parts.push(`${bags} × ${bagWeightKg} kg${bagTypeLabel} bags`)
    } else if (bags) {
      const bagTypeLabel = bagType ? ` ${bagType}` : ''
      parts.push(`${bags}${bagTypeLabel} bags`)
    }

    // Add equivalent 60kg bags ONLY if bag weight is different from 60kg
    if (equivalent60kgBags && bagWeightKg && bagWeightKg !== 60) {
      parts.push(`eq. ${equivalent60kgBags} × 60 kg bags`)
    }

    if (parts.length > 0) {
      result += ` (${parts.join(', ')})`
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
    microOrigin,
    shipmentMonth,
  } = props

  const quantity = formatQuantity(props)
  const formattedType = formatSampleType(sampleType)

  // Build items array - only include items with values
  const items: { label: string; value: string | React.ReactNode }[] = []

  // Quantity
  if (quantity !== 'N/A') {
    items.push({ label: 'Quantity', value: quantity })
  }

  // Sample type
  if (formattedType !== 'N/A') {
    items.push({ label: 'Type', value: formattedType })
  }

  // Container# and/or ICO#
  if (containerNumber) {
    items.push({ label: 'Container', value: containerNumber })
  }
  if (icoNumber) {
    items.push({ label: 'ICO', value: icoNumber })
  }

  // Shipment month
  if (shipmentMonth) {
    items.push({ label: 'Ship', value: shipmentMonth })
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
