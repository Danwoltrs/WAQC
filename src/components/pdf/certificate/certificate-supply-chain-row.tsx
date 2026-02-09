/**
 * Certificate supply chain row component
 * Equal-width flex columns with entity deduplication
 * 3 groups: Wolthers (left) | Supply-side (middle) | Buy-side (right)
 * Entities with matching names within a group merge into one column
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
  },
  entityColumn: {
    flex: 1,
    paddingHorizontal: 4,
  },
  separator: {
    width: 0.5,
    backgroundColor: COLORS.border,
    alignSelf: 'stretch',
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
})

// Helper to compare names case-insensitively
function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase().trim() === b.toLowerCase().trim()
}

interface MergedColumn {
  label: string
  name: string
  contracts: string[]
  address: string | null
}

/**
 * Merge entities within a group that share the same name.
 * Returns an array of merged columns.
 */
function mergeEntities(
  entities: Array<{ label: string; entity: SupplyChainEntity | null | undefined }>
): MergedColumn[] {
  const merged: MergedColumn[] = []

  for (const { label, entity } of entities) {
    if (!entity?.name) continue

    // Find existing merged column with the same name (case-insensitive)
    const existing = merged.find(m => namesMatch(m.name, entity.name))

    if (existing) {
      // Merge: combine labels (e.g. "Seller / Shipper"), add contracts
      existing.label = `${existing.label} / ${label}`
      if (entity.contract) {
        existing.contracts.push(entity.contract)
      }
    } else {
      merged.push({
        label,
        name: entity.name,
        contracts: entity.contract ? [entity.contract] : [],
        address: entity.address || null,
      })
    }
  }

  return merged
}

export interface CertificateSupplyChainRowProps {
  trackingNumber?: string | null
  wolthersContract?: string | null
  supplier?: SupplyChainEntity | null
  exporter: SupplyChainEntity
  shipper?: SupplyChainEntity | null
  importer: SupplyChainEntity
  roaster: SupplyChainEntity
  endClient?: SupplyChainEntity | null
  qcClient?: SupplyChainEntity | null
  hasClientLogo?: boolean
}

export function CertificateSupplyChainRow({
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
  // Don't show QC Client if they have a logo or match importer/roaster
  const showQcClient = Boolean(qcClient?.name) &&
    !hasClientLogo &&
    !namesMatch(qcClient?.name, importer.name) &&
    !namesMatch(qcClient?.name, roaster.name)

  // Group 1: Wolthers (always first if present)
  const wolthersColumns: MergedColumn[] = wolthersContract
    ? [{ label: 'Wolthers', name: wolthersContract, contracts: [], address: null }]
    : []

  // Group 2: Supply-side (Seller, Exporter, Shipper) - merge if same name
  const supplySideEntities: Array<{ label: string; entity: SupplyChainEntity | null | undefined }> = [
    { label: 'Seller', entity: supplier },
    { label: 'Exporter', entity: exporter },
    { label: 'Shipper', entity: shipper },
  ]
  const supplySideColumns = mergeEntities(supplySideEntities)

  // When Seller/Exporter merge, drop "Exporter" from label for cleaner display
  for (const col of supplySideColumns) {
    // If both Seller and Exporter merged, simplify to "Seller / Shipper" if shipper also merged
    // or just "Seller" if it was Seller+Exporter
    if (col.label.includes('Seller') && col.label.includes('Exporter')) {
      col.label = col.label.replace(' / Exporter', '').replace('Exporter / ', '')
      // If only Seller remains and shipper was also merged
      if (col.label === 'Seller' && col.label.includes('Shipper')) {
        col.label = 'Seller / Shipper'
      }
    }
  }

  // Group 3: Buy-side (Importer, Roaster, End Client, QC Client) - merge if same name
  const buySideEntities: Array<{ label: string; entity: SupplyChainEntity | null | undefined }> = [
    { label: 'Importer', entity: importer },
    { label: 'Roaster', entity: roaster },
    { label: 'End Client', entity: endClient },
    ...(showQcClient ? [{ label: 'QC Client', entity: qcClient }] : []),
  ]
  const buySideColumns = mergeEntities(buySideEntities)

  // When Importer/Roaster/etc merge, simplify label to "Buyer"
  for (const col of buySideColumns) {
    if (col.label.includes('Importer') && col.label.includes('Roaster')) {
      col.label = 'Buyer'
    }
  }

  // Flatten all columns
  const allColumns = [...wolthersColumns, ...supplySideColumns, ...buySideColumns]

  if (allColumns.length === 0) return null

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.row}>
        {allColumns.map((col, index) => (
          <React.Fragment key={`${col.label}-${index}`}>
            {index > 0 && <View style={rowStyles.separator} />}
            <View style={rowStyles.entityColumn}>
              <Text style={rowStyles.label}>{col.label}</Text>
              <Text style={rowStyles.name}>{col.name}</Text>
              {col.contracts.length > 0 && (
                col.contracts.map((ref, refIdx) => (
                  <Text key={refIdx} style={rowStyles.contract}>Ref: {ref}</Text>
                ))
              )}
              {col.address && <Text style={rowStyles.address}>{col.address}</Text>}
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  )
}
