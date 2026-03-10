/**
 * Certificate quality description section
 * Shows quality description text block and certifications list
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'

const descStyles = StyleSheet.create({
  container: {
    marginBottom: 42,
    paddingVertical: 4,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 9,
    color: COLORS.dark,
    lineHeight: 1.4,
  },
  certificationsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  certLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    marginRight: 4,
  },
  certBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.cream,
    borderRadius: 3,
  },
  certText: {
    fontSize: 8,
    fontWeight: 600,
    color: COLORS.primary,
  },
})

// Certification code to display name mapping
const CERTIFICATION_LABELS: Record<string, string> = {
  'ra': 'Rainforest Alliance',
  'rainforest': 'Rainforest Alliance',
  'rainforest_alliance': 'Rainforest Alliance',
  'ft': 'Fairtrade',
  'fairtrade': 'Fairtrade',
  'fair_trade': 'Fairtrade',
  'organic': 'Organic',
  'org': 'Organic',
  'eudr': 'EUDR',
  'eu_deforestation': 'EUDR',
  'flo': 'FLO',
  'utz': 'UTZ',
  '4c': '4C',
  'c.a.f.e.': 'C.A.F.E.',
  'cafe': 'C.A.F.E.',
}

function formatCertification(cert: string): string {
  const normalized = cert.toLowerCase().replace(/[_\-\s]/g, '_')
  return CERTIFICATION_LABELS[normalized] || cert
}

export interface CertificateQualityDescriptionProps {
  qualityDescription: string | null
  certifications?: string[] | null
  cropYear?: string | null
  compact?: boolean
}

export function CertificateQualityDescription({
  qualityDescription,
  certifications,
  cropYear,
  compact,
}: CertificateQualityDescriptionProps) {
  const hasCertifications = certifications && certifications.length > 0

  // Build the full quality line with crop year appended
  const fullQualityDescription = qualityDescription && cropYear
    ? `${qualityDescription}, Crop ${cropYear}`
    : qualityDescription && !cropYear
    ? qualityDescription
    : cropYear
    ? `Crop ${cropYear}`
    : null

  // If neither description nor certifications, don't render
  if (!fullQualityDescription && !hasCertifications) {
    return null
  }

  return (
    <View style={[descStyles.container, compact && { marginBottom: 42 - 25 }]}>
      {fullQualityDescription && (
        <>
          <Text style={descStyles.sectionLabel}>Quality:</Text>
          <Text style={descStyles.descriptionText}>{fullQualityDescription}</Text>
        </>
      )}

      {hasCertifications && (
        <View style={descStyles.certificationsRow}>
          <Text style={descStyles.certLabel}>Certifications:</Text>
          {certifications.map((cert, index) => (
            <View key={index} style={descStyles.certBadge}>
              <Text style={descStyles.certText}>
                {formatCertification(cert)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
