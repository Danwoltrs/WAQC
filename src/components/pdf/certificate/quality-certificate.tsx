/**
 * Main Quality Certificate PDF Document
 * Assembles all certificate components into a single A4 page
 * Redesigned layout following annotated certificate example
 */

import React from 'react'
import { Document, Page, StyleSheet } from '@react-pdf/renderer'
import { CertificateHeader } from './certificate-header'
import { CertificateSupplyChainRow } from './certificate-supply-chain-row'
import { CertificateSampleDetails } from './certificate-sample-details'
import { CertificateQualityDescription } from './certificate-quality-description'
import { CertificatePhysicalProperties } from './certificate-physical-properties'
import { CertificateScreenDefects } from './certificate-screen-defects'
import { CertificateCuppingChart } from './certificate-cupping-chart'
import { CertificateCupStatus } from './certificate-cup-status'
import { CertificateComments } from './certificate-comments'
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

  // Prepare screen sizes for screen defects component
  const screenSizes = greenBeanAnalysis?.screen_sizes
    ? Object.entries(greenBeanAnalysis.screen_sizes).map(([size, percentage]) => ({
        size,
        percentage: typeof percentage === 'number' ? percentage : null,
      }))
    : null

  // Prepare defects for screen defects component
  const defects = greenBeanAnalysis?.defects
    ? [
        ...(greenBeanAnalysis.defects.primary || []).map(d => ({
          name: d.name,
          count: d.rawCount,
          category: 'primary' as const,
        })),
        ...(greenBeanAnalysis.defects.secondary || []).map(d => ({
          name: d.name,
          count: d.rawCount,
          category: 'secondary' as const,
        })),
      ]
    : null

  // Prepare cupping attributes for cupping chart
  const cuppingAttributes = cuppingData?.attributes?.map(attr => ({
    attribute: attr.name,
    score: attr.score,
    validationRule: attr.allowedMin != null || attr.allowedMax != null
      ? {
          type: attr.allowedMax != null ? 'range' as const : 'minimum' as const,
          min_value: attr.allowedMin ?? 0,
          max_value: attr.allowedMax ?? undefined,
        }
      : null,
    scaleMin: 0,
    scaleMax: 10,
  })) || []

  return (
    <Document>
      <Page size="A4" style={pageStyles.page}>
        {/* 1. Header with logos, title, status, dates, certificate #, origin */}
        <CertificateHeader
          wolthersLogoBase64={wolthersLogoBase64}
          clientLogoBase64={clientLogoBase64}
          certificateNumber={certificate?.certificate_number || null}
          status={sample.status}
          issuedDate={certificate?.issued_date || null}
          validUntil={certificate?.valid_until || null}
          origin={sample.origin_display}
          flagBase64={flagBase64}
        />

        {/* 2. Supply Chain Row - Gray background with conditional entities */}
        <CertificateSupplyChainRow
          trackingNumber={sample.tracking_number}
          wolthersContract={supplyChain.wolthersContract}
          supplier={supplyChain.supplier}
          exporter={supplyChain.exporter}
          shipper={supplyChain.shipper}
          importer={supplyChain.importer}
          roaster={supplyChain.roaster}
          qcClient={supplyChain.qcClient}
          hasClientLogo={!!clientLogoBase64}
        />

        {/* 3. Sample Details Row - Quantity, type, container# */}
        <CertificateSampleDetails
          bagsQuantityMt={sample.bags_quantity_mt}
          bagType={sample.bag_type}
          bags={sample.bags}
          bagWeightKg={sample.bag_weight_kg}
          equivalent60kgBags={sample.equivalent_60kg_bags}
          sampleType={sample.sample_type}
          containerNumber={sample.container_nr}
          icoNumber={sample.ico_number}
          microOrigin={sample.micro_origin}
        />

        {/* 4. Quality Description + Certifications */}
        <CertificateQualityDescription
          qualityDescription={qualitySpec?.description || null}
          certifications={sample.certifications}
        />

        {/* 5. Physical Properties - Green Bean + Roast */}
        <CertificatePhysicalProperties
          moisture={greenBeanAnalysis?.moisture_percentage ?? null}
          density={greenBeanAnalysis?.density ?? null}
          greenAspect={greenBeanAnalysis?.green_aspect}
          quakers={roastAnalysis?.quaker_count ?? null}
          roastAspect={roastAnalysis?.roast_aspect}
        />

        {/* 6. Screen Distribution + Defects */}
        <CertificateScreenDefects
          screenSizes={screenSizes}
          defects={defects}
          primaryDefectsCount={greenBeanAnalysis?.defects?.total_primary ?? null}
          secondaryDefectsCount={greenBeanAnalysis?.defects?.total_secondary ?? null}
        />

        {/* 7. Cupping Box Plot Chart with Faults/Taints */}
        <CertificateCuppingChart
          attributes={cuppingAttributes}
          totalScore={cuppingData?.overallScore}
          scaleMin={0}
          scaleMax={10}
          showLegend={true}
          faults={cuppingData?.faults}
          taints={cuppingData?.taints}
        />

        {/* 8. Cup Status Row - Clean/Uniform Cup + Taints/Faults */}
        <CertificateCupStatus
          cleanCup={cuppingData?.cleanCup ?? null}
          uniformCup={cuppingData?.uniformCup ?? null}
          taints={cuppingData?.taints}
          faults={cuppingData?.faults}
        />

        {/* 9. Notes section */}
        <CertificateComments
          cuppingNotes={cuppingData?.comments || null}
        />

        {/* 10. Footer with lab info */}
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
export { CertificateSupplyChainRow } from './certificate-supply-chain-row'
export { CertificateSampleDetails } from './certificate-sample-details'
export { CertificateQualityDescription } from './certificate-quality-description'
export { CertificatePhysicalProperties } from './certificate-physical-properties'
export { CertificateScreenDefects } from './certificate-screen-defects'
export { CertificateCuppingChart } from './certificate-cupping-chart'
export { CertificateCupStatus } from './certificate-cup-status'
export { CertificateComments } from './certificate-comments'
export { CertificateFooter } from './certificate-footer'
export { COLORS, styles } from './certificate-styles'
