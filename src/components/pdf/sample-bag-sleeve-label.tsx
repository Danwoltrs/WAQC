import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Sample bag sleeve label data interface
export interface SampleBagSleeveLabelData {
  sample_type: 'PSS' | 'SS' | 'Type Sample'
  date: string // Formatted date
  tracking_number: string // Sample tracking number
  exporter?: string // Exporter name (hidden for Type Sample if hide_exporter_on_label is true)
  hide_exporter: boolean // Whether to hide exporter name
  bags_display: string // e.g., "10 x 60kg" or "8 x 70kg"
  client_quality_name?: string // Client's custom quality name
  quality_description: string // Full quality description
  ico_number?: string // ICO number (SS only)
  container_number?: string // Container number (SS only)
  contracts: Array<{ type: string; value: string }> // Contract references with types
  buyer_reference?: string // Buyer reference
  logo_url: string // Wolthers logo URL
  qr_code?: string // Optional QR code data URL for certificate download
  laboratory?: {
    name: string
    address: string
    city: string
    state: string
    zip_code: string
    country: string
    phone: string
    fax: string
    tax_id: string
  }
}

// Create styles for A4 page with 6 labels (2x3 grid)
const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    padding: '10pt',
  },
  labelContainer: {
    width: '50%',
    height: '33.33%',
    padding: '12pt',
    borderRight: '1pt dashed #DDDDDD',
    borderBottom: '1pt dashed #DDDDDD',
    flexDirection: 'column',
    position: 'relative',
  },
  labelContainerRight: {
    borderRight: 'none',
  },
  labelContainerBottom: {
    borderBottom: 'none',
  },
  logoSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: '8pt',
  },
  logo: {
    width: '120pt',
    height: 'auto',
    objectFit: 'contain',
  },
  qrCode: {
    width: '50pt',
    height: '50pt',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4pt',
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  contractText: {
    fontSize: 7,
    color: '#333333',
    marginBottom: '1pt',
    textAlign: 'right',
  },
  contractLabel: {
    fontWeight: 'bold',
    color: '#000000',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  sampleType: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
  },
  date: {
    fontSize: 7,
    color: '#666666',
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: '6pt',
  },
  infoRow: {
    fontSize: 8,
    marginBottom: '3pt',
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
    marginBottom: '2pt',
  },
  qualityDescription: {
    fontSize: 7,
    color: '#666666',
    marginBottom: '4pt',
  },
  qrSection: {
    position: 'absolute',
    bottom: '65pt',
    right: '12pt',
  },
  labInfo: {
    marginTop: 'auto',
    paddingTop: '6pt',
    borderTop: '0.5pt solid #EEEEEE',
  },
  labName: {
    fontSize: 5,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: '1pt',
  },
  labDetail: {
    fontSize: 4.5,
    color: '#666666',
    marginBottom: '0.5pt',
  },
})

interface SampleBagSleeveLabelDocumentProps {
  labels: SampleBagSleeveLabelData[]
}

/**
 * PDF Document component for printing sample bag sleeve labels
 * Format: A4 page with 6 labels (2x3 grid)
 * Includes: Logo (centered), Sample type, Date, Tracking number, Exporter (conditional),
 * Bags, Quality (client name + full description), ICO/Container (SS only),
 * Contract references, Lab info at bottom
 */
export const SampleBagSleeveLabelDocument: React.FC<SampleBagSleeveLabelDocumentProps> = ({ labels }) => {
  // Pad labels to multiples of 6 for complete pages
  const paddedLabels = [...labels]
  while (paddedLabels.length % 6 !== 0) {
    paddedLabels.push(null as any)
  }

  return (
    <Document>
      {/* Split labels into pages of 6 */}
      {Array.from({ length: Math.ceil(paddedLabels.length / 6) }, (_, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {paddedLabels.slice(pageIndex * 6, (pageIndex + 1) * 6).map((label, index) => {
            if (!label) {
              // Empty placeholder for incomplete pages
              const emptyStyles = [
                styles.labelContainer,
                ...(index % 2 === 1 ? [styles.labelContainerRight] : []),
                ...(index >= 4 ? [styles.labelContainerBottom] : []),
              ]
              return (
                <View
                  key={index}
                  style={emptyStyles}
                />
              )
            }

            const isRightColumn = index % 2 === 1
            const isBottomRow = index >= 4
            const containerStyles = [
              styles.labelContainer,
              ...(isRightColumn ? [styles.labelContainerRight] : []),
              ...(isBottomRow ? [styles.labelContainerBottom] : []),
            ]

            return (
              <View
                key={index}
                style={containerStyles}
              >
                {/* Logo (Centered) */}
                <View style={styles.logoSection}>
                  <Image src={label.logo_url} style={styles.logo} />
                </View>

                {/* Header Row: Sample Type on Left, Date and Contracts on Right */}
                <View style={styles.headerRow}>
                  <View style={styles.leftColumn}>
                    <Text style={styles.sampleType}>{label.sample_type}</Text>
                  </View>
                  <View style={styles.rightColumn}>
                    <Text style={styles.date}>{label.date}</Text>
                    {label.contracts.map((contract, idx) => (
                      <Text key={idx} style={styles.contractText}>
                        <Text style={styles.contractLabel}>{contract.type}: </Text>
                        {contract.value}
                      </Text>
                    ))}
                    {label.buyer_reference && (
                      <Text style={styles.contractText}>
                        <Text style={styles.contractLabel}>Buyer: </Text>
                        {label.buyer_reference}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Main Content */}
                <View style={styles.mainContent}>

                  {/* Tracking Number */}
                  <Text style={styles.trackingNumber}>{label.tracking_number}</Text>

                  {/* Exporter (conditional) */}
                  {!label.hide_exporter && label.exporter && (
                    <Text style={styles.infoRow}>
                      <Text style={styles.label}>Exporter: </Text>
                      <Text style={styles.value}>{label.exporter}</Text>
                    </Text>
                  )}

                  {/* Quantity */}
                  <Text style={styles.infoRow}>
                    <Text style={styles.label}>Quantity: </Text>
                    <Text style={styles.value}>{label.bags_display}</Text>
                  </Text>

                  {/* Quality: Client Name + Full Description (hide if N/A) */}
                  {(label.client_quality_name || (label.quality_description && label.quality_description !== 'N/A')) && (
                    <>
                      {label.client_quality_name && (
                        <Text style={styles.qualityName}>{label.client_quality_name}</Text>
                      )}
                      {label.quality_description && label.quality_description !== 'N/A' && (
                        <Text style={styles.qualityDescription}>{label.quality_description}</Text>
                      )}
                    </>
                  )}

                  {/* SS-specific fields */}
                  {label.sample_type === 'SS' && (
                    <>
                      {label.ico_number && (
                        <Text style={styles.infoRow}>
                          <Text style={styles.label}>ICO: </Text>
                          <Text style={styles.value}>{label.ico_number}</Text>
                        </Text>
                      )}
                      {label.container_number && (
                        <Text style={styles.infoRow}>
                          <Text style={styles.label}>Container: </Text>
                          <Text style={styles.value}>{label.container_number}</Text>
                        </Text>
                      )}
                    </>
                  )}
                </View>

                {/* QR Code (Bottom Right, above separator line) */}
                {label.qr_code && (
                  <View style={styles.qrSection}>
                    <Image src={label.qr_code} style={styles.qrCode} />
                  </View>
                )}

                {/* Lab Info (Bottom) */}
                <View style={styles.labInfo}>
                  <Text style={styles.labName}>{label.laboratory?.name.toUpperCase() || 'WOLTHERS COFFEE QUALITY CONTROL'}</Text>
                  {label.laboratory && (
                    <>
                      {label.laboratory.address && (
                        <Text style={styles.labDetail}>
                          {label.laboratory.address}
                          {label.laboratory.zip_code && `, ${label.laboratory.zip_code}`}
                          {label.laboratory.city && ` ${label.laboratory.city}`}
                          {label.laboratory.state && `/${label.laboratory.state}`}
                        </Text>
                      )}
                      {(label.laboratory.phone || label.laboratory.fax) && (
                        <Text style={styles.labDetail}>
                          {label.laboratory.phone && `Phone: ${label.laboratory.phone}`}
                          {label.laboratory.phone && label.laboratory.fax && ' | '}
                          {label.laboratory.fax && `Fax: ${label.laboratory.fax}`}
                          </Text>
                      )}
                      {label.laboratory.tax_id && (
                        <Text style={styles.labDetail}>CNPJ: {label.laboratory.tax_id}</Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            )
          })}
        </Page>
      ))}
    </Document>
  )
}
