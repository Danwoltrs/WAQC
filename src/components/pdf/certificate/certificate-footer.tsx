/**
 * Certificate footer component
 * Displays laboratory name, address, and tax ID
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const footerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    // 14pt off the paper edge (was 20): a three-line footer is 39pt tall, and
    // the page's 50pt bottom padding must keep the flow above its rule.
    bottom: 14,
    left: 30,
    right: 30,
    textAlign: 'center',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  labName: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 2,
  },
  address: {
    fontSize: 7,
    color: COLORS.mutedLight,
    marginBottom: 2,
  },
  taxId: {
    fontSize: 7,
    color: COLORS.mutedLight,
  },
})

interface CertificateFooterProps {
  labName: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  vatNumber: string | null
}

export function CertificateFooter({
  labName,
  address,
  city,
  state,
  country,
  vatNumber,
}: CertificateFooterProps) {
  // Build address parts
  const addressParts: string[] = []

  if (address) addressParts.push(address)

  const locationParts: string[] = []
  if (city) locationParts.push(city)
  if (state) locationParts.push(state)
  if (country) locationParts.push(country)

  const locationString = locationParts.join(', ')
  if (locationString) addressParts.push(locationString)

  const fullAddress = addressParts.join(' | ')

  // `fixed` keeps the footer out of react-pdf's page splitter. The splitter
  // measures a first, CONTENT-SIZED pass of the page, where an absolute
  // `bottom: 20` box sits at (flow height + 54pt) rather than at the foot of
  // an A4 page; any flow taller than ~738pt pushed this box past the wrap
  // line and it was split — the "Tax ID" line alone landed on a near-blank
  // second page (specialty lots, 2026-09-17) while the fixed-height page had
  // room for everything. A fixed node is never split, and a page holding only
  // fixed nodes is never emitted.
  return (
    <View style={footerStyles.container} fixed>
      {labName && <Text style={footerStyles.labName}>{labName}</Text>}

      {fullAddress && <Text style={footerStyles.address}>{fullAddress}</Text>}

      {vatNumber && (
        <Text style={footerStyles.taxId}>
          {vatNumber.length === 14 ? 'CNPJ' : 'Tax ID'}: {formatVatNumber(vatNumber)}
        </Text>
      )}
    </View>
  )
}

/**
 * Format VAT number for display
 * Brazilian CNPJ format: XX.XXX.XXX/XXXX-XX
 */
function formatVatNumber(vat: string): string {
  // Remove non-numeric characters
  const digits = vat.replace(/\D/g, '')

  // Brazilian CNPJ (14 digits)
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }

  // Return as-is for other formats
  return vat
}
