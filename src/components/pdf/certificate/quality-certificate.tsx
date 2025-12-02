/**
 * Main Quality Certificate PDF Document
 * Assembles all certificate components into a single A4 page
 */

import React from 'react'
import { Document, Page, StyleSheet } from '@react-pdf/renderer'
import { CertificateHeader } from './certificate-header'
import { CertificateSampleInfo } from './certificate-sample-info'
import { CertificateSupplyChain } from './certificate-supply-chain'
import { CertificateAnalysis } from './certificate-analysis'
import { CertificateDefectChart } from './certificate-defect-chart'
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
    client,
    laboratory,
    greenBeanAnalysis,
    roastAnalysis,
    cuppingData,
    certificate,
  } = data

  return (
    <Document>
      <Page size="A4" style={pageStyles.page}>
        {/* Header with logos, certificate number, flag, dates, status */}
        <CertificateHeader
          wolthersLogoBase64={wolthersLogoBase64}
          clientLogoBase64={clientLogoBase64}
          flagBase64={flagBase64}
          certificateNumber={certificate?.certificate_number || null}
          origin={sample.origin_display}
          status={sample.status}
          issuedDate={certificate?.issued_date || null}
          validUntil={certificate?.valid_until || null}
        />

        {/* Sample Information */}
        <CertificateSampleInfo
          trackingNumber={sample.tracking_number}
          sampleType={sample.sample_type}
          bags={sample.bags}
          bagWeight={sample.bag_weight_kg}
          processingMethod={sample.processing_method}
          icoNumber={sample.ico_number}
          containerNr={sample.container_nr}
        />

        {/* Supply Chain (single line) */}
        <CertificateSupplyChain
          exporter={supplyChain.exporter}
          importer={supplyChain.importer}
          roaster={supplyChain.roaster}
          wolthersContract={supplyChain.wolthersContract}
        />

        {/* Analysis: Green Bean + Roast (two columns) */}
        <CertificateAnalysis
          greenBean={greenBeanAnalysis}
          roast={roastAnalysis}
        />

        {/* Defect Charts (primary and secondary, conditional) */}
        <CertificateDefectChart defects={greenBeanAnalysis?.defects || null} />

        {/* Cupping Scores with range bars */}
        <CertificateCupping cuppingData={cuppingData} />

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
export { CertificateSupplyChain } from './certificate-supply-chain'
export { CertificateAnalysis } from './certificate-analysis'
export { CertificateDefectChart } from './certificate-defect-chart'
export { CertificateCupping } from './certificate-cupping'
export { CertificateFooter } from './certificate-footer'
export { RangeBar, DefectBar } from './certificate-range-bar'
export { COLORS, styles } from './certificate-styles'
