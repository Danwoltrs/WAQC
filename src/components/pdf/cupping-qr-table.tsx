import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Cupping QR code data interface
export interface CuppingQRData {
  sample_number: string
  tracking_number: string
  origin: string
  quality?: string
  qr_code: string // Data URL for QR code
  session_id: string
  sample_id: string
}

// Create styles for cupping table QR codes
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: '20pt',
  },
  header: {
    marginBottom: '20pt',
    paddingBottom: '10pt',
    borderBottom: '2pt solid #000000',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: '5pt',
  },
  headerInfo: {
    fontSize: 10,
    color: '#666666',
  },
  tableContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  qrCard: {
    width: '48%',
    marginBottom: '15pt',
    marginRight: '2%',
    padding: '10pt',
    border: '1pt solid #CCCCCC',
    borderRadius: '4pt',
    flexDirection: 'row',
    alignItems: 'center',
  },
  qrCodeSection: {
    width: '100pt',
    height: '100pt',
    marginRight: '10pt',
  },
  qrCode: {
    width: '100%',
    height: '100%',
  },
  infoSection: {
    flex: 1,
    flexDirection: 'column',
  },
  sampleNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: '4pt',
    color: '#000000',
  },
  trackingNumber: {
    fontSize: 11,
    marginBottom: '4pt',
    color: '#333333',
  },
  origin: {
    fontSize: 10,
    color: '#666666',
    marginBottom: '2pt',
  },
  quality: {
    fontSize: 9,
    color: '#888888',
  },
  footer: {
    position: 'absolute',
    bottom: '20pt',
    left: '20pt',
    right: '20pt',
    textAlign: 'center',
    fontSize: 8,
    color: '#999999',
    borderTop: '1pt solid #EEEEEE',
    paddingTop: '10pt',
  },
})

interface CuppingQRTableDocumentProps {
  session_name: string
  session_date: string
  qr_codes: CuppingQRData[]
}

/**
 * PDF Document component for printing cupping QR codes
 * Generates a table of QR codes for handwritten cupping cards
 */
export const CuppingQRTableDocument: React.FC<CuppingQRTableDocumentProps> = ({
  session_name,
  session_date,
  qr_codes,
}) => {
  // Split QR codes into pages (max 6 per page for readability)
  const itemsPerPage = 6
  const pages: CuppingQRData[][] = []
  for (let i = 0; i < qr_codes.length; i += itemsPerPage) {
    pages.push(qr_codes.slice(i, i + itemsPerPage))
  }

  return (
    <Document>
      {pages.map((pageItems, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {/* Header (only on first page) */}
          {pageIndex === 0 && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Cupping Session QR Codes</Text>
              <Text style={styles.headerInfo}>Session: {session_name}</Text>
              <Text style={styles.headerInfo}>Date: {session_date}</Text>
              <Text style={styles.headerInfo}>
                Total Samples: {qr_codes.length}
              </Text>
            </View>
          )}

          {/* QR Code Table */}
          <View style={styles.tableContainer}>
            {pageItems.map((item, index) => (
              <View key={index} style={styles.qrCard}>
                {/* QR Code */}
                <View style={styles.qrCodeSection}>
                  <Image src={item.qr_code} style={styles.qrCode} />
                </View>

                {/* Sample Information */}
                <View style={styles.infoSection}>
                  <Text style={styles.sampleNumber}>
                    Sample {item.sample_number}
                  </Text>
                  <Text style={styles.trackingNumber}>
                    {item.tracking_number}
                  </Text>
                  <Text style={styles.origin}>{item.origin}</Text>
                  {item.quality && (
                    <Text style={styles.quality}>{item.quality}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text>
              Wolthers Coffee Quality Control System - Page {pageIndex + 1} of{' '}
              {pages.length}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  )
}
