import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Tin sleeve label data interface
export interface TinSleeveLabelData {
  date: string // Formatted date
  tracking_number: string // Sample tracking number
  sample_type: 'PSS' | 'Stocklot' | 'SS' | 'Type Sample'
  exporter: string // Exporter name
  client_quality_name?: string // Client's custom quality name (e.g., "Alfenas Dulce")
  quality_description: string // Full quality description (e.g., "Strictly Soft Cup - Natural")
  contracts: string[] // Array of contract references (Wolthers, Buyer, Exporter, Roaster)
  packaging: string // Packaging type (e.g., "Jute Bags", "PP Bags", "Bulk")
  bags_display: string // Display string for bags (e.g., "Bulk (equiv. 12 bags)" or "10 x 60kg")
  qr_code?: string // Data URL for QR code
  logo_url: string // Wolthers logo URL
}

// Create styles for 4cm height tin sleeve labels
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 0,
  },
  labelContainer: {
    height: '113.39pt', // 4cm (1cm = 28.35pt)
    width: '100%',
    borderBottom: '1pt dashed #CCCCCC',
    flexDirection: 'row',
    padding: '8pt',
    alignItems: 'center',
  },
  leftSection: {
    width: '100pt',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '10pt',
  },
  logo: {
    width: '80pt',
    height: '25pt',
    marginBottom: '4pt',
  },
  qrCode: {
    width: '70pt',
    height: '70pt',
  },
  infoSection: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: '3pt',
  },
  date: {
    fontSize: 7,
    color: '#666666',
  },
  trackingNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  infoRow: {
    fontSize: 8,
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
  qualityName: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: '1pt',
  },
  qualityDescription: {
    fontSize: 7,
    color: '#666666',
    marginBottom: '2pt',
  },
  contractsRow: {
    fontSize: 7,
    color: '#555555',
    marginTop: '1pt',
  },
})

interface TinSleeveLabelDocumentProps {
  labels: TinSleeveLabelData[]
}

/**
 * PDF Document component for printing tin sleeve labels
 * Format: 4cm height labels for tin containers
 * Includes: Date, Sample tracking, Exporter, Quality (client name + full description),
 * Contracts, Packaging type, Bag count with bulk indicator, QR code, Wolthers logo
 */
export const TinSleeveLabelDocument: React.FC<TinSleeveLabelDocumentProps> = ({ labels }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {labels.map((label, index) => (
          <View key={index} style={styles.labelContainer}>
            {/* Left Section: Logo + QR Code */}
            <View style={styles.leftSection}>
              <Image src={label.logo_url} style={styles.logo} />
              {label.qr_code && (
                <Image src={label.qr_code} style={styles.qrCode} />
              )}
            </View>

            {/* Information Section */}
            <View style={styles.infoSection}>
              {/* Header Row: Date + Tracking Number */}
              <View style={styles.headerRow}>
                <Text style={styles.date}>{label.date}</Text>
                <Text style={styles.trackingNumber}>{label.tracking_number}</Text>
              </View>

              {/* Exporter */}
              <Text style={styles.infoRow}>
                <Text style={styles.label}>Exporter: </Text>
                <Text style={styles.value}>{label.exporter}</Text>
              </Text>

              {/* Quality: Client Name + Full Description */}
              {label.client_quality_name && (
                <Text style={styles.qualityName}>{label.client_quality_name}</Text>
              )}
              <Text style={styles.qualityDescription}>{label.quality_description}</Text>

              {/* Packaging */}
              <Text style={styles.infoRow}>
                <Text style={styles.label}>Packaging: </Text>
                <Text style={styles.value}>{label.packaging}</Text>
              </Text>

              {/* Bags */}
              <Text style={styles.infoRow}>
                <Text style={styles.label}>Bags: </Text>
                <Text style={styles.value}>{label.bags_display}</Text>
              </Text>

              {/* Contracts */}
              {label.contracts.length > 0 && (
                <Text style={styles.contractsRow}>
                  <Text style={styles.label}>Contracts: </Text>
                  {label.contracts.join(' | ')}
                </Text>
              )}
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
