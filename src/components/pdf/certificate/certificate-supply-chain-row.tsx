/**
 * Certificate supply chain row component
 * Redesigned with gray background and conditional columns
 * Shows: Tracking/Contract | Supplier | Exporter | Shipper | Importer | Roaster | QC Client
 * Each entity shows name, contract, and address (if available)
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { SupplyChainEntity } from '@/lib/certificate-data'

const rowStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    backgroundColor: COLORS.background,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  entityColumn: {
    minWidth: 80,
    maxWidth: 140,
  },
  referenceColumn: {
    minWidth: 100,
    maxWidth: 150,
  },
  label: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  name: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
    marginBottom: 1,
  },
  contract: {
    fontSize: 7,
    color: COLORS.muted,
    marginBottom: 1,
  },
  address: {
    fontSize: 7,
    color: COLORS.mutedLight,
  },
  separator: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 4,
    alignSelf: 'stretch',
  },
})

interface EntityColumnProps {
  label: string
  entity: SupplyChainEntity
  showSeparator?: boolean
}

function EntityColumn({ label, entity, showSeparator }: EntityColumnProps) {
  if (!entity.name) return null

  return (
    <>
      <View style={rowStyles.entityColumn}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.name}>{entity.name}</Text>
        {entity.contract && (
          <Text style={rowStyles.contract}>Ref: {entity.contract}</Text>
        )}
        {entity.address && (
          <Text style={rowStyles.address}>{entity.address}</Text>
        )}
      </View>
      {showSeparator && <View style={rowStyles.separator} />}
    </>
  )
}

// Wolthers contract column (tracking number removed - already shown in header)
interface ReferenceColumnProps {
  trackingNumber?: string | null
  wolthersContract?: string | null
  showSeparator?: boolean
}

function ReferenceColumn({ wolthersContract, showSeparator }: ReferenceColumnProps) {
  if (!wolthersContract) return null

  return (
    <>
      {/* Wolthers contract column only */}
      <View style={rowStyles.entityColumn}>
        <Text style={rowStyles.label}>Wolthers</Text>
        <Text style={rowStyles.name}>{wolthersContract}</Text>
      </View>
      {showSeparator && <View style={rowStyles.separator} />}
    </>
  )
}

export interface CertificateSupplyChainRowProps {
  trackingNumber?: string | null    // Sample tracking number
  wolthersContract?: string | null  // Wolthers contract reference
  supplier?: SupplyChainEntity | null
  exporter: SupplyChainEntity
  shipper?: SupplyChainEntity | null
  importer: SupplyChainEntity
  roaster: SupplyChainEntity
  endClient?: SupplyChainEntity | null
  qcClient?: SupplyChainEntity | null
  hasClientLogo?: boolean  // If true, don't show QC Client name (logo identifies them)
}

// Helper to compare names case-insensitively
function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase().trim() === b.toLowerCase().trim()
}

export function CertificateSupplyChainRow({
  trackingNumber,
  wolthersContract,
  supplier,
  exporter,
  shipper,
  importer,
  roaster,
  endClient,
  qcClient,
  hasClientLogo,
}: CertificateSupplyChainRowProps) {
  // Determine which entities to display
  const hasSupplier = Boolean(supplier?.name)
  const hasExporter = Boolean(exporter.name)
  // Show shipper only if it exists and is different from exporter
  const hasShipper = Boolean(shipper?.name) && !namesMatch(shipper?.name, exporter.name)
  const hasImporter = Boolean(importer.name)
  const hasRoaster = Boolean(roaster.name)
  const hasEndClient = Boolean(endClient?.name)
  // Don't show QC Client if:
  // 1. They have a logo displayed (logo identifies them), OR
  // 2. Their name matches importer or roaster
  const hasQcClient = Boolean(qcClient?.name) &&
    !hasClientLogo &&
    !namesMatch(qcClient?.name, importer.name) &&
    !namesMatch(qcClient?.name, roaster.name)

  // Show Wolthers column if we have a Wolthers contract (tracking number shown in header)
  const hasReference = Boolean(wolthersContract)

  // Count visible entities to determine separators
  // Note: "Supplier" is called "Seller" in the UI (farm/coop/producer selling the coffee)
  const entities = [
    { show: hasSupplier, label: 'Seller', entity: supplier },
    { show: hasExporter, label: 'Exporter', entity: exporter },
    { show: hasShipper, label: 'Shipper', entity: shipper },
    { show: hasImporter, label: 'Importer', entity: importer },
    { show: hasRoaster, label: 'Roaster', entity: roaster },
    { show: hasEndClient, label: 'End Client', entity: endClient },
    { show: hasQcClient, label: 'QC Client', entity: qcClient },
  ].filter(e => e.show)

  // If no supply chain data and no reference, don't render
  if (entities.length === 0 && !hasReference) {
    return null
  }

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.row}>
        {/* Reference column first (tracking number + Wolthers contract) */}
        <ReferenceColumn
          trackingNumber={trackingNumber}
          wolthersContract={wolthersContract}
          showSeparator={entities.length > 0}
        />
        {/* Supply chain entities */}
        {entities.map((e, index) => (
          <EntityColumn
            key={e.label}
            label={e.label}
            entity={e.entity!}
            showSeparator={index < entities.length - 1}
          />
        ))}
      </View>
    </View>
  )
}
