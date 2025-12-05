import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Label data interface
export interface SampleLabelData {
  tracking_number: string // PSS number, Stocklot number, or SS number
  sample_type: 'PSS' | 'Stocklot' | 'SS'
  exporter: string // Name of the exporter (for PSS and SS)
  quality_name: string // Client's quality name (e.g., "Alfenas Dulce") or template name fallback
  bags_quantity?: string // Number of bags (optional for Stocklot)
  wolthers_contract?: string // Wolthers contract (PSS and SS)
  buyer_contract?: string // Importer's contract (PSS and SS)
  container_number?: string // Container number (SS only)
  oic_number?: string // OIC number (SS only)
  qr_code?: string // Data URL for QR code
}

// Create styles for 4cm x A4 labels with cut guides (4cm height, fits 7 labels per A4 page)
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 0,
  },
  labelContainer: {
    height: '113.39pt', // ~4cm (1cm = 28.35pt, so 4cm ≈ 113.39pt)
    width: '100%',
    borderBottom: '1pt dashed #CCCCCC', // Dashed line as cut guide
    flexDirection: 'row',
    padding: '10pt',
    alignItems: 'center',
  },
  qrCodeSection: {
    width: '90pt',
    height: '90pt',
    marginRight: '12pt',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCode: {
    width: '85pt',
    height: '85pt',
  },
  infoSection: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  sampleType: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#666666',
    marginBottom: '2pt',
  },
  trackingNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: '5pt',
    color: '#000000',
  },
  infoRow: {
    fontSize: 9,
    marginBottom: '2pt',
    color: '#333333',
  },
  label: {
    fontWeight: 'bold',
    color: '#000000',
  },
  value: {
    color: '#555555',
  },
  cutGuide: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '1pt',
    borderBottom: '1pt dashed #999999',
  },
  cutGuideText: {
    position: 'absolute',
    bottom: '-10pt',
    right: '5pt',
    fontSize: 6,
    color: '#AAAAAA',
  },
})

interface SampleLabelDocumentProps {
  labels: SampleLabelData[]
}

/**
 * PDF Document component for printing sample labels
 * Format: 4cm height labels for A4 paper with cut guides (fits 7 labels per page)
 * Supports PSS, Stocklot, and SS sample types with type-specific fields
 */
export const SampleLabelDocument: React.FC<SampleLabelDocumentProps> = ({ labels }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {labels.map((label, index) => (
          <View key={index} style={styles.labelContainer}>
            {/* QR Code Section */}
            {label.qr_code && (
              <View style={styles.qrCodeSection}>
                <Image src={label.qr_code} style={styles.qrCode} />
              </View>
            )}

            {/* Information Section */}
            <View style={styles.infoSection}>
              {/* Sample Type Badge */}
              <Text style={styles.sampleType}>{label.sample_type}</Text>

              {/* Tracking Number */}
              <Text style={styles.trackingNumber}>{label.tracking_number}</Text>

              {/* Type-Specific Fields */}
              {label.sample_type === 'PSS' && (
                <>
                  <Text style={styles.infoRow}>
                    <Text style={styles.label}>Exporter: </Text>
                    <Text style={styles.value}>{label.exporter}</Text>
                  </Text>
                  <Text style={styles.infoRow}>
                    <Text style={styles.label}>Quality: </Text>
                    <Text style={styles.value}>{label.quality_name}</Text>
                  </Text>
                  {label.bags_quantity && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Bags: </Text>
                      <Text style={styles.value}>{label.bags_quantity}</Text>
                    </Text>
                  )}
                  {label.wolthers_contract && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Wolthers Contract: </Text>
                      <Text style={styles.value}>{label.wolthers_contract}</Text>
                    </Text>
                  )}
                  {label.buyer_contract && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Importer Contract: </Text>
                      <Text style={styles.value}>{label.buyer_contract}</Text>
                    </Text>
                  )}
                </>
              )}

              {label.sample_type === 'Stocklot' && (
                <>
                  <Text style={styles.infoRow}>
                    <Text style={styles.label}>Quality: </Text>
                    <Text style={styles.value}>{label.quality_name}</Text>
                  </Text>
                  {label.bags_quantity && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Bags: </Text>
                      <Text style={styles.value}>{label.bags_quantity}</Text>
                    </Text>
                  )}
                </>
              )}

              {label.sample_type === 'SS' && (
                <>
                  <Text style={styles.infoRow}>
                    <Text style={styles.label}>Exporter: </Text>
                    <Text style={styles.value}>{label.exporter}</Text>
                  </Text>
                  <Text style={styles.infoRow}>
                    <Text style={styles.label}>Quality: </Text>
                    <Text style={styles.value}>{label.quality_name}</Text>
                  </Text>
                  {label.bags_quantity && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Bags: </Text>
                      <Text style={styles.value}>{label.bags_quantity}</Text>
                    </Text>
                  )}
                  {label.container_number && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Container: </Text>
                      <Text style={styles.value}>{label.container_number}</Text>
                    </Text>
                  )}
                  {label.oic_number && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>OIC: </Text>
                      <Text style={styles.value}>{label.oic_number}</Text>
                    </Text>
                  )}
                  {label.wolthers_contract && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Wolthers Contract: </Text>
                      <Text style={styles.value}>{label.wolthers_contract}</Text>
                    </Text>
                  )}
                  {label.buyer_contract && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Importer Contract: </Text>
                      <Text style={styles.value}>{label.buyer_contract}</Text>
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Cut Guide */}
            <View style={styles.cutGuide}>
              <Text style={styles.cutGuideText}>✂ Cut here</Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
