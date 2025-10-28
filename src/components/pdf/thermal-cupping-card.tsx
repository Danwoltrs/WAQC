import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

// Thermal cupping card data interface
export interface ThermalCuppingCardData {
  sample_id: string
  sample_number: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type' // Sample type
  ico_number?: string // ICO number (for SS samples)
  container_nr?: string // Container number (for SS samples)
  quality_name?: string // Optional based on user selection
  buyer_name?: string // Optional based on user selection
  exporter_name?: string // Optional based on user selection
  lab_name?: string // Laboratory name
  template_name: string
  template_scale_info: string // e.g., "1-8, 0.25"
  attributes: string[] // Array of attribute abbreviations: ["Frag", "Arom", "Body", ...]
  num_cuppers: number // Number of cupper rows to show
  qr_code: string // Data URL for QR code
  logo_url?: string // Optional Wolthers logo
}

// Create styles for thermal cupping card (optimized for thermal printer)
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: '6pt',
    fontSize: 8,
  },
  card: {
    border: '1pt solid #000000',
    marginBottom: '8pt',
  },
  header: {
    flexDirection: 'row',
    borderBottom: '1pt solid #000000',
    padding: '4pt',
  },
  qrSection: {
    width: '60pt',
    marginRight: '6pt',
  },
  logo: {
    width: '60pt',
    height: '20pt',
    marginBottom: '2pt',
  },
  qrCode: {
    width: '60pt',
    height: '60pt',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  companyName: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: '2pt',
  },
  sampleNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: '2pt',
  },
  infoRow: {
    fontSize: 7,
    marginBottom: '1pt',
    color: '#333333',
  },
  tableSection: {
    borderBottom: '1pt solid #000000',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1pt solid #000000',
    backgroundColor: '#F0F0F0',
  },
  cupperColumn: {
    width: '70pt',
    padding: '3pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 7,
    fontWeight: 'bold',
  },
  attributeColumn: {
    width: '32pt',
    padding: '3pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #CCCCCC',
    minHeight: '20pt',
  },
  cupperCell: {
    width: '70pt',
    padding: '3pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 7,
  },
  attributeCell: {
    width: '32pt',
    padding: '3pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 7,
    textAlign: 'center',
  },
  defectsSection: {
    padding: '4pt',
  },
  defectLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    marginBottom: '2pt',
  },
  defectSpace: {
    minHeight: '20pt',
    borderBottom: '0.5pt solid #CCCCCC',
    marginBottom: '4pt',
  },
})

interface ThermalCuppingCardDocumentProps {
  cards: ThermalCuppingCardData[]
  show_quality: boolean
  show_buyer: boolean
  show_exporter: boolean
}

/**
 * PDF Document component for thermal printer cupping cards
 * Generates handwritten cupping cards with QR codes and attribute tables
 */
export const ThermalCuppingCardDocument: React.FC<
  ThermalCuppingCardDocumentProps
> = ({ cards, show_quality, show_buyer, show_exporter }) => {
  // Ensure all cards have valid attributes array
  const validatedCards = cards.map(card => ({
    ...card,
    attributes: Array.isArray(card.attributes) && card.attributes.length > 0
      ? card.attributes
      : ['Frag', 'Arom', 'Body', 'Acid', 'Swet', 'Bal', 'Fin']
  }))

  return (
    <Document>
      {/* One card per page for thermal printing */}
      {validatedCards.map((card, cardIndex) => (
        <Page key={cardIndex} size="A6" orientation="landscape" style={styles.page}>
          <View style={styles.card}>
            {/* Header: QR Code + Sample Info */}
            <View style={styles.header}>
              <View style={styles.qrSection}>
                {card.logo_url && (
                  <Image src={card.logo_url} style={styles.logo} />
                )}
                <Image src={card.qr_code} style={styles.qrCode} />
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.companyName}>
                  {card.lab_name?.toUpperCase() || 'WOLTHERS COFFEE QUALITY CONTROL'}
                </Text>
                <Text style={styles.sampleNumber}>
                  Sample: {card.sample_number || card.tracking_number || 'Unknown'}
                </Text>
                {/* SS samples must show ICO and Container Nr */}
                {card.sample_type === 'ss' && (
                  <>
                    {card.ico_number && (
                      <Text style={styles.infoRow}>
                        ICO: {card.ico_number}
                      </Text>
                    )}
                    {card.container_nr && (
                      <Text style={styles.infoRow}>
                        Container: {card.container_nr}
                      </Text>
                    )}
                  </>
                )}
                {show_quality && card.quality_name && (
                  <Text style={styles.infoRow}>
                    Quality: {card.quality_name}
                  </Text>
                )}
                {show_buyer && card.buyer_name && (
                  <Text style={styles.infoRow}>Buyer: {card.buyer_name}</Text>
                )}
                {show_exporter && card.exporter_name && (
                  <Text style={styles.infoRow}>
                    Exporter: {card.exporter_name}
                  </Text>
                )}
                <Text style={styles.infoRow}>
                  Template: {card.template_name || 'Standard'} ({card.template_scale_info || '1-8, 0.25'})
                </Text>
              </View>
            </View>

            {/* Attribute Table */}
            <View style={styles.tableSection}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <View style={styles.cupperColumn}>
                  <Text>Cupper</Text>
                </View>
                {card.attributes.map((attr, attrIndex) => (
                  <View key={attrIndex} style={styles.attributeColumn}>
                    <Text>{attr}</Text>
                  </View>
                ))}
              </View>

              {/* Cupper Rows */}
              {Array.from({ length: card.num_cuppers }).map((_, rowIndex) => (
                <View key={rowIndex} style={styles.tableRow}>
                  <View style={styles.cupperCell}>
                    <Text>{''}</Text>
                  </View>
                  {card.attributes.map((_, attrIndex) => (
                    <View key={attrIndex} style={styles.attributeCell}>
                      <Text>{''}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {/* Defects Section */}
            <View style={styles.defectsSection}>
              <Text style={styles.defectLabel}>TAINTS:</Text>
              <View style={styles.defectSpace} />

              <Text style={styles.defectLabel}>FAULTS:</Text>
              <View style={styles.defectSpace} />
            </View>
          </View>
        </Page>
      ))}
    </Document>
  )
}
