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

// "T.B.I." (to be informed/identified) is a placeholder party — treat it, and
// empty names, as "not linked" so the column is dropped rather than printing
// a meaningless "T.B.I.". Mirrors isTbi() in approval-notification.
function isTbi(s: string | null | undefined): boolean {
  return !s || /^t\.?b\.?i\.?$/i.test(s.trim())
}

interface MergedColumn {
  label: string
  id?: string | null
  name: string
  contracts: string[]
  address: string | null
  note?: string | null  // secondary line, e.g. "Sample 219/26", rendered un-prefixed
}

/**
 * Merge entities within a group that represent the same company.
 * Two entities match on company id when both have one, otherwise on name.
 * T.B.I./empty entities are skipped entirely. Returns merged columns.
 */
function mergeEntities(
  entities: Array<{ label: string; entity: SupplyChainEntity | null | undefined }>
): MergedColumn[] {
  const merged: MergedColumn[] = []

  for (const { label, entity } of entities) {
    if (!entity?.name || isTbi(entity.name)) continue

    // Merge when the same company id OR the same display name. Either catches
    // the "Ahold" case: importer "Ahold Delhaize B.V." and roaster "Ahold" are
    // distinct company rows, but both resolve to fantasy name "Ahold" → one col.
    const existing = merged.find(m =>
      (!!m.id && !!entity.id && m.id === entity.id) || namesMatch(m.name, entity.name)
    )

    if (existing) {
      // Merge: combine labels (e.g. "Seller / Shipper"), add contracts.
      // Dedup: when e.g. seller and exporter are the same company and carry the same
      // reference, only print one "Ref:" line (avoids a doubled reference now that the
      // seller ref is read through from sys while the exporter ref stays stored).
      existing.label = `${existing.label} / ${label}`
      if (entity.contract && !existing.contracts.some(c => c.trim().toLowerCase() === entity.contract!.trim().toLowerCase())) {
        existing.contracts.push(entity.contract)
      }
    } else {
      merged.push({
        label,
        id: entity.id ?? null,
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
  exporterSampleNumber?: string | null
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
  exporterSampleNumber,
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

  // Group 1: Wolthers — single column showing the Wolthers contract reference.
  // The exporter sample number is attached to the Seller column below (the seller
  // shipped the sample, so its reference belongs with them).
  const sampleNote = exporterSampleNumber ? `Sample ${exporterSampleNumber}` : null
  const wolthersColumns: MergedColumn[] = []
  if (wolthersContract) {
    wolthersColumns.push({ label: 'Wolthers', name: wolthersContract, contracts: [], address: null })
  }

  // Group 2: Supply-side (Seller, Exporter, Shipper) - merge if same name
  const supplySideEntities: Array<{ label: string; entity: SupplyChainEntity | null | undefined }> = [
    { label: 'Seller', entity: supplier },
    { label: 'Exporter', entity: exporter },
    { label: 'Shipper', entity: shipper },
  ]
  const supplySideColumns = mergeEntities(supplySideEntities)

  // When Seller/Exporter merge, drop "Exporter" from label for cleaner display
  for (const col of supplySideColumns) {
    if (col.label.includes('Seller') && col.label.includes('Exporter')) {
      col.label = col.label.replace(' / Exporter', '').replace('Exporter / ', '')
      if (col.label === 'Seller' && col.label.includes('Shipper')) {
        col.label = 'Seller / Shipper'
      }
    }
  }

  // The seller shipped the sample, so its sample number sits with the Seller
  // column (rendered as an un-prefixed line above any "Ref:" contract numbers).
  // Fall back to a Wolthers-side note, then a standalone column, when there is no
  // supply-side column to carry it.
  if (sampleNote) {
    if (supplySideColumns.length > 0) {
      supplySideColumns[0].note = sampleNote
    } else if (wolthersColumns.length > 0) {
      wolthersColumns[0].note = sampleNote
    } else if (exporterSampleNumber) {
      wolthersColumns.push({ label: 'Sample Nr', name: exporterSampleNumber, contracts: [], address: null })
    }
  }

  // Group 3: Buy-side (Importer, Roaster, QC Client) - merge if same name
  // End Client is not shown (QC client logo represents them)
  const buySideEntities: Array<{ label: string; entity: SupplyChainEntity | null | undefined }> = [
    { label: 'Importer', entity: importer },
    { label: 'Roaster', entity: roaster },
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
              {col.note && <Text style={rowStyles.contract}>{col.note}</Text>}
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
