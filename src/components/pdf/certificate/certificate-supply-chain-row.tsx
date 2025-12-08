/**
 * Certificate supply chain row component
 * Redesigned with gray background and conditional columns
 * Shows: Supplier | Exporter | Shipper | Importer | Roaster | QC Client
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

export interface CertificateSupplyChainRowProps {
  supplier?: SupplyChainEntity | null
  exporter: SupplyChainEntity
  shipper?: SupplyChainEntity | null
  importer: SupplyChainEntity
  roaster: SupplyChainEntity
  qcClient?: SupplyChainEntity | null
}

export function CertificateSupplyChainRow({
  supplier,
  exporter,
  shipper,
  importer,
  roaster,
  qcClient,
}: CertificateSupplyChainRowProps) {
  // Determine which entities to display
  const hasSupplier = Boolean(supplier?.name)
  const hasExporter = Boolean(exporter.name)
  // Show shipper only if it exists and is different from exporter
  const hasShipper = Boolean(shipper?.name) && shipper?.name !== exporter.name
  const hasImporter = Boolean(importer.name)
  const hasRoaster = Boolean(roaster.name)
  // Show QC Client only if different from both importer and roaster
  const hasQcClient = Boolean(qcClient?.name) &&
    qcClient?.name !== importer.name &&
    qcClient?.name !== roaster.name

  // Count visible entities to determine separators
  const entities = [
    { show: hasSupplier, label: 'Supplier', entity: supplier },
    { show: hasExporter, label: 'Exporter', entity: exporter },
    { show: hasShipper, label: 'Shipper', entity: shipper },
    { show: hasImporter, label: 'Importer', entity: importer },
    { show: hasRoaster, label: 'Roaster', entity: roaster },
    { show: hasQcClient, label: 'QC Client', entity: qcClient },
  ].filter(e => e.show)

  // If no supply chain data, don't render
  if (entities.length === 0) {
    return null
  }

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.row}>
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
