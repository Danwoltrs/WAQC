/**
 * Main Quality Certificate PDF Document
 * Assembles all certificate components into a single A4 page
 * Redesigned for minimalistic professional look
 */

import React from 'react'
import { Document, Page, StyleSheet } from '@react-pdf/renderer'
import { CertificateHeader } from './certificate-header'
import { CertificateSampleInfo } from './certificate-sample-info'
import { CertificateAnalysis } from './certificate-analysis'
import { CertificateCupping } from './certificate-cupping'
import { CertificateFooter } from './certificate-footer'
import type { CertificateData } from '@/lib/certificate-data'

const pageStyles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    padding: 30,
    paddingBottom: 60, // Extra padding for footer
    backgroundColor: '#FFFFFF',
  },
})

export interface QualityCertificateProps {
  data: CertificateData
  wolthersLogoBase64?: string
  clientLogoBase64?: string
  flagBase64?: string
}

export function QualityCertificate({
  data,
  wolthersLogoBase64,
  clientLogoBase64,
  flagBase64,
}: QualityCertificateProps) {
  const {
    sample,
    supplyChain,
    laboratory,
    greenBeanAnalysis,
    roastAnalysis,
    cuppingData,
    certificate,
    qualitySpec,
  } = data

  return (
    <Document>
      <Page size="A4" style={pageStyles.page}>
        {/* Header with logos, title, status, dates */}
        <CertificateHeader
          wolthersLogoBase64={wolthersLogoBase64}
          clientLogoBase64={clientLogoBase64}
          status={sample.status}
          issuedDate={certificate?.issued_date || null}
          validUntil={certificate?.valid_until || null}
        />

        {/* Sample Information (merged with supply chain) */}
        <CertificateSampleInfo
          exporter={supplyChain.exporter}
          roaster={supplyChain.roaster}
          certificateNumber={certificate?.certificate_number || null}
          sampleType={sample.sample_type}
          bags={sample.bags}
          bagWeight={sample.bag_weight_kg}
          processingMethod={sample.processing_method}
          icoNumber={sample.ico_number}
          origin={sample.origin}
          originDisplay={sample.origin_display}
          flagBase64={flagBase64}
        />

        {/* Green Bean Analysis (two-column: screen sizes + defects) */}
        <CertificateAnalysis
          greenBean={greenBeanAnalysis}
          greenAspect={greenBeanAnalysis?.green_aspect}
        />

        {/* Cupping Scores with integrated Roast Analysis */}
        <CertificateCupping
          cuppingData={cuppingData}
          roastAnalysis={roastAnalysis}
          hasQualityTemplate={qualitySpec?.has_validation || false}
        />

        {/* Footer with lab info */}
        <CertificateFooter
          labName={laboratory?.name || null}
          address={laboratory?.address || null}
          city={laboratory?.city || null}
          state={laboratory?.state || null}
          country={laboratory?.country || null}
          vatNumber={laboratory?.vat_number || null}
        />
      </Page>
    </Document>
  )
}

// Export all components for potential individual use
export { CertificateHeader } from './certificate-header'
export { CertificateSampleInfo } from './certificate-sample-info'
export { CertificateAnalysis } from './certificate-analysis'
export { CertificateCupping } from './certificate-cupping'
export { CertificateFooter } from './certificate-footer'
export { COLORS, styles } from './certificate-styles'
