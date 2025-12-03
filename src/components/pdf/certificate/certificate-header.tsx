/**
 * Certificate header component
 * Displays logos, title, status, and dates
 * Redesigned for minimalistic professional look
 */

import React from 'react'
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { COLORS, getStatusColor, getStatusText } from './certificate-styles'

const headerStyles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logoContainer: {
    width: 100,
    height: 40,
  },
  logo: {
    width: 100,
    height: 40,
    objectFit: 'contain',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.dark,
    letterSpacing: 1,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  rightContent: {
    width: 100,
    alignItems: 'flex-end',
  },
  clientLogo: {
    width: 80,
    height: 35,
    objectFit: 'contain',
    marginBottom: 4,
  },
  dateColumn: {
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 2,
  },
  divider: {
    height: 0.5,
    backgroundColor: COLORS.border,
    marginTop: 10,
  },
})

interface CertificateHeaderProps {
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  status: string | null
  issuedDate: string | null
  validUntil: string | null
}

export function CertificateHeader({
  wolthersLogoBase64,
  clientLogoBase64,
  status,
  issuedDate,
  validUntil,
}: CertificateHeaderProps) {
  const statusColor = getStatusColor(status)
  const statusText = getStatusText(status)

  // Format dates
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.topRow}>
        {/* Wolthers logo (left) */}
        <View style={headerStyles.logoContainer}>
          {wolthersLogoBase64 ? (
            <Image src={wolthersLogoBase64} style={headerStyles.logo} />
          ) : (
            <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.dark }}>
              WOLTHERS
            </Text>
          )}
        </View>

        {/* Center content - title and status */}
        <View style={headerStyles.centerContent}>
          <Text style={headerStyles.title}>QUALITY CERTIFICATE</Text>
          <Text style={[headerStyles.statusText, { color: statusColor }]}>
            {statusText}
          </Text>
        </View>

        {/* Right content: Client logo + dates */}
        <View style={headerStyles.rightContent}>
          {clientLogoBase64 && (
            <Image src={clientLogoBase64} style={headerStyles.clientLogo} />
          )}

          <View style={headerStyles.dateColumn}>
            <Text style={headerStyles.dateText}>
              Issue: {formatDate(issuedDate)}
            </Text>
            <Text style={headerStyles.dateText}>
              Valid: {formatDate(validUntil)}
            </Text>
          </View>
        </View>
      </View>

      <View style={headerStyles.divider} />
    </View>
  )
}
