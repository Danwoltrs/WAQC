/**
 * Certificate quality description section
 * Shows quality description text block and certifications list
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { COLORS } from './certificate-styles'
import { formatProcessingMethod } from './certificate-sample-details'
import type { CvaVerdictDisplay } from '@/lib/cupping/cva-cupping-data'

/**
 * A CVA score prints its decimals only when it has them: 89.5 stays "89.5",
 * 84 prints as "84" rather than "84.00" — matching the journey and the cert
 * editor so the surfaces cannot appear to disagree.
 */
function formatCvaScore(value: number): string {
  return Number(value.toFixed(2)).toString()
}

const descStyles = StyleSheet.create({
  container: {
    marginBottom: 28,
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  qualityColumn: {
    flex: 1,
    paddingRight: 12,
  },
  cvaBlock: {
    alignItems: 'flex-end',
    minWidth: 74,
  },
  cvaLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cvaValue: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.dark,
    lineHeight: 1.1,
  },
  cvaMark: {
    fontSize: 7,
    color: COLORS.muted,
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
  processingMethod?: string | null
  compact?: boolean
  /** Specialty only: the 0-100 CVA score. Null on the commodity path. */
  cvaScore?: number | null
  /** Specialty only: the persisted pass mark + tri-state verdict. */
  cvaVerdict?: CvaVerdictDisplay | null
}

/**
 * Build the single quality sentence.
 *
 * Certifications are concatenated INTO the sentence rather than listed as
 * their own badge row, and they sit after the quality and before the crop —
 * "… Fine Roast, Greenish, EUDR, Crop 26/27" — because that is how the trade
 * writes a quality: the certification qualifies the coffee, so it belongs in
 * the description, not in a separate block underneath it.
 */
export function buildQualityLine(
  qualityDescription: string | null,
  certifications: string[] | null | undefined,
  cropYear: string | null | undefined,
): string | null {
  const parts: string[] = []
  if (qualityDescription) parts.push(qualityDescription)
  for (const cert of certifications ?? []) {
    const label = formatCertification(cert)
    // A quality description sometimes already names its certification; saying
    // "EUDR" twice in one sentence reads like a mistake.
    if (label && !parts.some((p) => p.toLowerCase().includes(label.toLowerCase()))) {
      parts.push(label)
    }
  }
  if (cropYear) parts.push(`Crop ${cropYear}`)
  return parts.length > 0 ? parts.join(', ') : null
}

export function CertificateQualityDescription({
  qualityDescription,
  certifications,
  cropYear,
  processingMethod,
  compact,
  cvaScore,
  cvaVerdict,
}: CertificateQualityDescriptionProps) {
  const formattedProcess = formatProcessingMethod(processingMethod)
  const fullQualityDescription = buildQualityLine(qualityDescription, certifications, cropYear)

  // The specialty headline sits here, top-right of the quality — the first
  // thing read after what the coffee is. cvaVerdict is non-null only for a CVA
  // lot, so a commodity certificate never shows this block.
  const showCvaScore = Boolean(cvaVerdict) && cvaScore !== null && cvaScore !== undefined

  // If nothing to show, don't render
  if (!fullQualityDescription && !formattedProcess && !showCvaScore) {
    return null
  }

  return (
    <View style={[descStyles.container, compact ? { marginBottom: 42 - 25 } : {}]}>
      <View style={descStyles.topRow}>
        <View style={descStyles.qualityColumn}>
          {fullQualityDescription && (
            <>
              <Text style={descStyles.sectionLabel}>Quality:</Text>
              <Text style={descStyles.descriptionText}>{fullQualityDescription}</Text>
            </>
          )}
        </View>

        {showCvaScore && (
          <View style={descStyles.cvaBlock}>
            <Text style={descStyles.cvaLabel}>CVA Score</Text>
            <Text
              style={[
                descStyles.cvaValue,
                cvaVerdict!.passed === true ? { color: '#22c55e' } : {},
                cvaVerdict!.passed === false ? { color: '#ef4444' } : {},
              ]}
            >
              {formatCvaScore(cvaScore!)}
            </Text>
            {/* Tri-state, spelled out: `passed === null` means the cup could not
                be judged, which must never read as a fail. */}
            {cvaVerdict!.passed === null ? (
              <Text style={descStyles.cvaMark}>Could not be judged</Text>
            ) : cvaVerdict!.minScore !== null ? (
              <Text style={descStyles.cvaMark}>min {formatCvaScore(cvaVerdict!.minScore)}</Text>
            ) : null}
          </View>
        )}
      </View>

      {formattedProcess && (
        <View style={descStyles.certificationsRow}>
          <Text style={descStyles.certLabel}>Process:</Text>
          <Text style={descStyles.descriptionText}>{formattedProcess}</Text>
        </View>
      )}
    </View>
  )
}
