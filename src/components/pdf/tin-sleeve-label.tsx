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
  size?: '4cm' | '2.5cm' // Label size (defaults to 4cm)
}

// Create dynamic styles based on label size
const createStyles = (size: '4cm' | '2.5cm' = '4cm') => {
  // Increase scale factor for 2.5cm to use more of available height
  // Adding 2mm bleed (2mm = 5.67pt) means we can use up to 2.9cm = 82.22pt
  // Using 0.85 scale factor instead of 0.625 to make content larger
  const scaleFactor = size === '2.5cm' ? 0.85 : 1

  return StyleSheet.create({
    page: {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      padding: 0,
    },
    labelContainer: {
      // With 2mm bleed on top and bottom, use 2.9cm total (82.22pt)
      height: size === '4cm' ? '113.39pt' : '82.22pt', // 4cm or 2.9cm with bleed (1cm = 28.35pt)
      width: '100%',
      borderBottom: '1pt dashed #CCCCCC',
      flexDirection: 'row',
      padding: `${8 * scaleFactor}pt`,
      alignItems: 'center',
      justifyContent: 'center', // Center the content horizontally
    },
    contentWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    leftSection: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: `${12 * scaleFactor}pt`,
      paddingRight: `${12 * scaleFactor}pt`,
      borderRight: '1pt solid #DDDDDD',
    },
    logo: {
      width: `${120 * scaleFactor}pt`,
      height: 'auto',
      objectFit: 'contain',
      marginRight: `${8 * scaleFactor}pt`,
    },
    qrCode: {
      width: `${60 * scaleFactor}pt`,
      height: `${60 * scaleFactor}pt`,
      marginLeft: `${8 * scaleFactor}pt`,
    },
    infoSection: {
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerRow: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      marginBottom: `${4 * scaleFactor}pt`,
    },
    trackingNumber: {
      fontSize: 12 * scaleFactor,
      fontWeight: 'bold',
      color: '#000000',
      marginBottom: `${1 * scaleFactor}pt`,
    },
    date: {
      fontSize: 8 * scaleFactor,
      color: '#666666',
    },
    dateLabel: {
      fontWeight: 'bold',
      color: '#000000',
    },
    infoRow: {
      fontSize: 8 * scaleFactor,
      marginBottom: `${2 * scaleFactor}pt`,
      color: '#333333',
    },
    label: {
      fontWeight: 'bold',
      color: '#000000',
    },
    value: {
      color: '#555555',
    },
    qualityRow: {
      fontSize: 8 * scaleFactor,
      marginBottom: `${3 * scaleFactor}pt`,
      color: '#333333',
    },
    qualityName: {
      fontWeight: 'bold',
      color: '#000000',
    },
    qualityDescription: {
      color: '#555555',
    },
    quantityValue: {
      color: '#555555',
    },
  })
}

interface TinSleeveLabelDocumentProps {
  labels: TinSleeveLabelData[]
}

/**
 * PDF Document component for printing tin sleeve labels
 * Format: 4cm or 2.5cm height labels for tin containers (centered)
 * Includes: Date, Sample tracking, Exporter, Quality (client name + full description),
 * Quantity (with packaging type and MT), Contracts, QR code, Wolthers logo
 */
export const TinSleeveLabelDocument: React.FC<TinSleeveLabelDocumentProps> = ({ labels }) => {
  // Get size from first label (all labels in batch should have same size)
  const size = labels[0]?.size || '4cm'
  const styles = createStyles(size)

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {labels.map((label, index) => (
          <View key={index} style={styles.labelContainer}>
            <View style={styles.contentWrapper}>
              {/* Left Section: Logo - Separator - QR Code */}
              <View style={styles.leftSection}>
                <Image src={label.logo_url} style={styles.logo} />
                {label.qr_code && (
                  <Image src={label.qr_code} style={styles.qrCode} />
                )}
              </View>

              {/* Information Section */}
              <View style={styles.infoSection}>
              {/* Header Row: Tracking Number + Date */}
              <View style={styles.headerRow}>
                <Text style={styles.trackingNumber}>{label.tracking_number}</Text>
                <Text style={styles.date}>
                  <Text style={styles.dateLabel}>Date: </Text>
                  {label.date}
                </Text>
              </View>

              {/* Exporter */}
              <Text style={styles.infoRow}>
                <Text style={styles.label}>Exporter: </Text>
                <Text style={styles.value}>{label.exporter}</Text>
              </Text>

              {/* Quality: Client Name - Description (inline) - Hide if N/A */}
              {(label.client_quality_name || (label.quality_description && label.quality_description !== 'N/A')) && (
                <Text style={styles.qualityRow}>
                  {label.client_quality_name && (
                    <Text style={styles.qualityName}>{label.client_quality_name} - </Text>
                  )}
                  <Text style={styles.qualityDescription}>{label.quality_description}</Text>
                </Text>
              )}

              {/* Quantity (Bags + MT) - Packaging included in bags_display */}
              <Text style={styles.infoRow}>
                <Text style={styles.label}>Quantity: </Text>
                <Text style={styles.quantityValue}>{label.bags_display}</Text>
              </Text>
              </View>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  )
}
