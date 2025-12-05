/**
 * Certificate supply chain component
 * Displays exporter > importer > roaster > qc client in a single line
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import type { SupplyChainEntity } from '@/lib/certificate-data'

const chainStyles = StyleSheet.create({
  container: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: COLORS.borderLight,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  entityGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginRight: 3,
  },
  name: {
    fontSize: 9,
    fontWeight: 600,
    color: COLORS.dark,
  },
  contract: {
    fontSize: 8,
    color: COLORS.muted,
    marginLeft: 2,
  },
  arrow: {
    fontSize: 10,
    color: COLORS.border,
    marginHorizontal: 8,
  },
})

interface CertificateSupplyChainProps {
  exporter: SupplyChainEntity
  importer: SupplyChainEntity
  roaster: SupplyChainEntity
  qcClient?: SupplyChainEntity
  wolthersContract: string | null
}

function EntityDisplay({
  label,
  entity,
}: {
  label: string
  entity: SupplyChainEntity
}) {
  if (!entity.name) return null

  return (
    <View style={chainStyles.entityGroup}>
      <Text style={chainStyles.label}>{label}:</Text>
      <Text style={chainStyles.name}>{entity.name}</Text>
      {entity.contract && (
        <Text style={chainStyles.contract}>({entity.contract})</Text>
      )}
    </View>
  )
}

export function CertificateSupplyChain({
  exporter,
  importer,
  roaster,
  qcClient,
}: CertificateSupplyChainProps) {
  const hasExporter = Boolean(exporter.name)
  const hasImporter = Boolean(importer.name)
  const hasRoaster = Boolean(roaster.name)
  // Only show QC Client if it's different from importer
  const hasQcClient = Boolean(qcClient?.name) && qcClient?.name !== importer.name

  // If no supply chain data, don't render
  if (!hasExporter && !hasImporter && !hasRoaster && !hasQcClient) {
    return null
  }

  return (
    <View style={chainStyles.container}>
      <View style={chainStyles.row}>
        {hasExporter && (
          <>
            <EntityDisplay label="Exporter" entity={exporter} />
            {(hasImporter || hasRoaster || hasQcClient) && (
              <Text style={chainStyles.arrow}>&gt;</Text>
            )}
          </>
        )}

        {hasImporter && (
          <>
            <EntityDisplay label="Importer" entity={importer} />
            {(hasRoaster || hasQcClient) && <Text style={chainStyles.arrow}>&gt;</Text>}
          </>
        )}

        {hasRoaster && (
          <>
            <EntityDisplay label="Roaster" entity={roaster} />
            {hasQcClient && <Text style={chainStyles.arrow}>&gt;</Text>}
          </>
        )}

        {hasQcClient && qcClient && (
          <EntityDisplay label="QC Client" entity={qcClient} />
        )}
      </View>
    </View>
  )
}
