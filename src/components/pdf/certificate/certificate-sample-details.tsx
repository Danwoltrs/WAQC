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
    marginBottom: 6,
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
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.dark,
  },
  valueLight: {
    fontSize: 7,
    fontWeight: 400,
    color: COLORS.muted,
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

interface QuantityResult {
  mainValue: string
  packagingInfo: string | null
}

function formatQuantity(props: CertificateSampleDetailsProps): QuantityResult {
  const { bagsQuantityMt, bags, bagType, bagWeightKg, equivalent60kgBags } = props

  // Primary format: "21.6 MT"
  let mainValue = ''
  let packagingInfo: string | null = null

  // Add packaging detail
  const normalizedBagType = bagType?.toLowerCase() || ''

  // For bulk, "bags" (from bag_count) represents the equivalent 60kg bags the user entered
  // MT = equivalent_60kg_bags × 60 / 1000
  // Note: Some records have incorrect equivalent_60kg_bags, so we use bags as source of truth
  if (normalizedBagType === 'bulk') {
    // Use bags (bag_count) as the equivalent 60kg bags for bulk
    const eq60kgBags = bags && bags > 0 ? bags : equivalent60kgBags
    if (eq60kgBags && eq60kgBags > 0) {
      // Calculate correct MT from equivalent 60kg bags
      const correctedMt = (eq60kgBags * 60) / 1000
      mainValue = `${correctedMt.toFixed(1)} MT`
      packagingInfo = `(in bulk, eq. ${Math.round(eq60kgBags).toLocaleString('en-US')} × 60 kg bags)`
    } else if (bagsQuantityMt !== null && bagsQuantityMt > 0) {
      mainValue = `${bagsQuantityMt.toFixed(1)} MT`
      packagingInfo = '(in bulk)'
    }
  } else if (bagsQuantityMt !== null && bagsQuantityMt > 0) {
    mainValue = `${bagsQuantityMt.toFixed(1)} MT`
  }

  if (normalizedBagType === 'big bags' || normalizedBagType === 'bigbags' || normalizedBagType === 'big bag') {
    // Big bags format: "(in big bags, eq. 333 × 60 kg bags)"
    if (equivalent60kgBags) {
      packagingInfo = `(in big bags, eq. ${Math.round(equivalent60kgBags)} × 60 kg bags)`
    } else {
      packagingInfo = '(in big bags)'
    }
  } else if (bagType || bags || equivalent60kgBags) {
    // Standard bags format: "(320 × 60 kg jute bags)"
    const parts: string[] = []

    // Replace underscores with spaces in bag type for display
    const cleanBagType = bagType?.replace(/_/g, ' ') || ''
    // Check if bag type already contains "bag" to avoid "jute bag bags"
    const hasBagInType = cleanBagType.toLowerCase().includes('bag')
    const bagSuffix = hasBagInType ? 's' : ' bags'

    if (bags && bags > 0 && bagWeightKg) {
      const bagTypeLabel = cleanBagType ? ` ${cleanBagType}` : ''
      parts.push(`${bags} × ${bagWeightKg} kg${bagTypeLabel}${bagSuffix}`)
    } else if (bags && bags > 0) {
      const bagTypeLabel = cleanBagType ? ` ${cleanBagType}` : ''
      parts.push(`${bags}${bagTypeLabel}${bagSuffix}`)
    } else if (equivalent60kgBags && equivalent60kgBags > 0) {
      // Use equivalent 60kg bags when actual bag count is 0 or missing
      const bagTypeLabel = cleanBagType ? ` ${cleanBagType}` : ''
      parts.push(`${Math.round(equivalent60kgBags)} × 60 kg${bagTypeLabel}${bagSuffix}`)
    }

    if (parts.length > 0) {
      packagingInfo = `(${parts.join(', ')})`
    }
  }

  return { mainValue: mainValue || 'N/A', packagingInfo }
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

  // Quantity - render with separate styles for main value and packaging info
  if (quantity.mainValue !== 'N/A') {
    items.push({
      label: 'Quantity',
      value: (
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={detailStyles.value}>{quantity.mainValue}</Text>
          {quantity.packagingInfo && (
            <Text style={[detailStyles.valueLight, { marginLeft: 3 }]}>{quantity.packagingInfo}</Text>
          )}
        </View>
      )
    })
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
