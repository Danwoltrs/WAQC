/**
 * Certificate header component
 * Displays logos, certificate number, flag, and dates
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
    marginBottom: 8,
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
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.dark,
    letterSpacing: 1,
    marginBottom: 4,
  },
  certificateNumber: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.muted,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 9,
    color: COLORS.muted,
  },
  dateSeparator: {
    fontSize: 9,
    color: COLORS.border,
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
  flagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flag: {
    width: 24,
    height: 16,
    objectFit: 'contain',
  },
  originText: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.dark,
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  divider: {
    height: 0.5,
    backgroundColor: COLORS.border,
    marginTop: 8,
  },
})

interface CertificateHeaderProps {
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
  certificateNumber: string | null
  origin: string
  status: string | null
  issuedDate: string | null
  validUntil: string | null
}

export function CertificateHeader({
  wolthersLogoBase64,
  clientLogoBase64,
  flagBase64,
  certificateNumber,
  origin,
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

        {/* Center content */}
        <View style={headerStyles.centerContent}>
          <Text style={headerStyles.title}>QUALITY CERTIFICATE</Text>

          {certificateNumber && (
            <Text style={headerStyles.certificateNumber}>
              Certificate: {certificateNumber}
            </Text>
          )}

          <View style={headerStyles.dateRow}>
            <Text style={headerStyles.dateText}>
              Issue: {formatDate(issuedDate)}
            </Text>
            <Text style={headerStyles.dateSeparator}>|</Text>
            <Text style={headerStyles.dateText}>
              Valid: {formatDate(validUntil)}
            </Text>
          </View>

          {/* Status badge */}
          <View
            style={[
              headerStyles.statusBadge,
              { backgroundColor: statusColor + '15' },
            ]}
          >
            <Text style={[headerStyles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Right content: Client logo + flag */}
        <View style={headerStyles.rightContent}>
          {clientLogoBase64 && (
            <Image src={clientLogoBase64} style={headerStyles.clientLogo} />
          )}

          <View style={headerStyles.flagContainer}>
            {flagBase64 && (
              <Image src={flagBase64} style={headerStyles.flag} />
            )}
            <Text style={headerStyles.originText}>{origin}</Text>
          </View>
        </View>
      </View>

      <View style={headerStyles.divider} />
    </View>
  )
}
