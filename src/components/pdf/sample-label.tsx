import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Label data interface
export interface SampleLabelData {
  tracking_number: string
  origin: string
  quality: string
  supplier: string
  storage_position: string
  created_at: string
  qr_code?: string // Data URL for QR code
}

// Create styles for 3cm x A4 labels (approximately 3cm height, fits 9-10 labels per A4 page)
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 0,
  },
  labelContainer: {
    height: '85pt', // ~3cm (1cm = 28.35pt, so 3cm ≈ 85pt)
    width: '100%',
    borderBottom: '1pt solid #E0E0E0',
    flexDirection: 'row',
    padding: '8pt',
    alignItems: 'center',
  },
  qrCodeSection: {
    width: '70pt',
    height: '70pt',
    marginRight: '10pt',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCode: {
    width: '65pt',
    height: '65pt',
  },
  infoSection: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: '4pt',
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
  storageSection: {
    width: '100pt',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: '8pt',
  },
  storageLabel: {
    fontSize: 8,
    color: '#666666',
    marginBottom: '2pt',
  },
  storagePosition: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
})

interface SampleLabelDocumentProps {
  labels: SampleLabelData[]
}

/**
 * PDF Document component for printing sample labels
 * Format: 3cm height labels for A4 paper, designed for tin labeling
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
              <Text style={styles.trackingNumber}>{label.tracking_number}</Text>

              <Text style={styles.infoRow}>
                <Text style={styles.label}>Origin: </Text>
                <Text style={styles.value}>{label.origin}</Text>
              </Text>

              {label.quality && (
                <Text style={styles.infoRow}>
                  <Text style={styles.label}>Quality: </Text>
                  <Text style={styles.value}>{label.quality}</Text>
                </Text>
              )}

              {label.supplier && (
                <Text style={styles.infoRow}>
                  <Text style={styles.label}>Supplier: </Text>
                  <Text style={styles.value}>{label.supplier}</Text>
                </Text>
              )}

              <Text style={styles.infoRow}>
                <Text style={styles.label}>Date: </Text>
                <Text style={styles.value}>{label.created_at}</Text>
              </Text>
            </View>

            {/* Storage Position Section */}
            {label.storage_position && (
              <View style={styles.storageSection}>
                <Text style={styles.storageLabel}>Storage</Text>
                <Text style={styles.storagePosition}>{label.storage_position}</Text>
              </View>
            )}
          </View>
        ))}
      </Page>
    </Document>
  )
}
