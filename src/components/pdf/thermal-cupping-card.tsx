import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

/**
 * Intelligently abbreviates attribute names to fit in narrow columns
 * Priority: 1) User-defined abbreviation, 2) Known abbreviations, 3) Smart truncation
 */
function abbreviateAttribute(attr: string | AttributeForCard, maxLength: number = 5): string {
  // Handle AttributeForCard object format
  if (typeof attr === 'object' && attr !== null) {
    // Priority 1: Use user-defined abbreviation if provided
    if (attr.abbreviation && attr.abbreviation.trim().length > 0) {
      return attr.abbreviation.trim().substring(0, maxLength)
    }
    // Otherwise use the name
    attr = attr.name
  }

  if (!attr || typeof attr !== 'string') return ''

  const trimmed = attr.trim()

  // If already short enough, return as-is
  if (trimmed.length <= maxLength) {
    return trimmed
  }

  // Priority 2: Common coffee attribute abbreviations (fallback if no user abbreviation)
  const knownAbbreviations: Record<string, string> = {
    'Fragancia': 'Frag',
    'Fragrance': 'Frag',
    'Aroma': 'Arom',
    'Sabor': 'Sabor',
    'Flavor': 'Flavr',
    'Retrogusto': 'Retro',
    'Aftertaste': 'After',
    'Acidez': 'Acidz',
    'Acidity': 'Acid',
    'Cuerpo': 'Cuerp',
    'Body': 'Body',
    'Balance': 'Bal',
    'Dulzura': 'Dulz',
    'Dulçura': 'Dolçu',
    'Sweetness': 'Sweet',
    'Uniformidad': 'Unifm',
    'Uniformity': 'Unifm',
    'Taza Limpia': 'Limpa',
    'Clean Cup': 'Clean',
    'Finish': 'Finsh',
    'Umami': 'Umami',
  }

  // Check for exact match (case-insensitive)
  const lowerAttr = trimmed.toLowerCase()
  for (const [full, abbr] of Object.entries(knownAbbreviations)) {
    if (full.toLowerCase() === lowerAttr) {
      return abbr
    }
  }

  // Priority 3: Smart truncation - take first maxLength characters
  // This preserves special characters and readability
  return trimmed.substring(0, maxLength)
}

// Attribute with optional user-defined abbreviation
export interface AttributeForCard {
  name: string
  abbreviation?: string // User-defined abbreviation from quality template
}

// Thermal cupping card data interface
export interface ThermalCuppingCardData {
  sample_id: string
  sample_number: string
  tracking_number: string
  sample_type?: 'pss' | 'ss' | 'type' // Sample type
  ico_number?: string // ICO number (for SS samples)
  container_nr?: string // Container number (for SS samples)
  exporter_sample_number?: string // Exporter's sample identification number
  quality_name?: string // Optional based on user selection
  buyer_name?: string // Optional based on user selection
  exporter_name?: string // Optional based on user selection
  lab_name?: string // Laboratory name
  template_name: string
  template_scale_info: string // e.g., "1-8, 0.25"
  attributes: (string | AttributeForCard)[] // Array of attributes with optional abbreviations
  num_cuppers: number // Number of cupper rows to show
  cuppers?: string[] // Optional pre-assigned cupper names
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
  show_supplier: boolean
  show_exporter: boolean
}

/**
 * PDF Document component for thermal printer cupping cards
 * Generates handwritten cupping cards with QR codes and attribute tables
 */
export const ThermalCuppingCardDocument: React.FC<
  ThermalCuppingCardDocumentProps
> = ({ cards, show_quality, show_buyer, show_supplier, show_exporter }) => {
  // Ensure all cards have valid attributes array
  const validatedCards = cards.map(card => {
    // Process and validate attributes (can be strings or AttributeForCard objects)
    let validAttributes = (Array.isArray(card.attributes) && card.attributes.length > 0
      ? card.attributes
      : ['Frag', 'Arom', 'Body', 'Acid', 'Swet', 'Bal', 'Fin']
    )
      .filter(attr => {
        if (attr == null) return false
        if (typeof attr === 'string') return attr.trim().length > 0
        if (typeof attr === 'object') return attr.name && attr.name.trim().length > 0
        return false
      })
      .map(attr => {
        // Convert to consistent format
        if (typeof attr === 'string') {
          return { name: attr.trim(), abbreviation: undefined }
        }
        return {
          name: attr.name.trim(),
          abbreviation: attr.abbreviation || undefined
        }
      })

    // Fallback if all attributes were invalid
    if (validAttributes.length === 0) {
      validAttributes = [
        { name: 'Frag', abbreviation: undefined },
        { name: 'Arom', abbreviation: undefined },
        { name: 'Body', abbreviation: undefined },
        { name: 'Acid', abbreviation: undefined },
        { name: 'Swet', abbreviation: undefined },
        { name: 'Bal', abbreviation: undefined },
        { name: 'Fin', abbreviation: undefined }
      ]
    }

    return {
      ...card,
      attributes: validAttributes,
      // Ensure all text fields are safe strings with proper defaults
      sample_id: String(card.sample_id || ''),
      sample_number: String(card.sample_number || card.tracking_number || 'Unknown'),
      tracking_number: String(card.tracking_number || 'Unknown'),
      lab_name: card.lab_name ? String(card.lab_name) : undefined,
      ico_number: card.ico_number ? String(card.ico_number) : undefined,
      container_nr: card.container_nr ? String(card.container_nr) : undefined,
      exporter_sample_number: card.exporter_sample_number ? String(card.exporter_sample_number) : undefined,
      quality_name: card.quality_name ? String(card.quality_name) : undefined,
      buyer_name: card.buyer_name ? String(card.buyer_name) : undefined,
      exporter_name: card.exporter_name ? String(card.exporter_name) : undefined,
      template_name: String(card.template_name || 'Standard'),
      template_scale_info: String(card.template_scale_info || '1-8, 0.25'),
      num_cuppers: Number(card.num_cuppers) || 5,
      qr_code: String(card.qr_code || ''),
    }
  })

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
                {/* Sample Type and Identifier - Bold type followed by number/ICO */}
                <Text style={styles.sampleNumber}>
                  <Text style={{ fontWeight: 'bold' }}>
                    {card.sample_type ? card.sample_type.toUpperCase() : 'TYPE'}:
                  </Text>{' '}
                  {card.sample_type === 'ss'
                    ? (card.ico_number || card.container_nr || card.sample_number || card.tracking_number || 'Unknown')
                    : (card.sample_number || card.tracking_number || 'Unknown')
                  }
                </Text>
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
                {card.exporter_sample_number && (
                  <Text style={styles.infoRow}>
                    Exp. Sample #: {card.exporter_sample_number}
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
                    <Text>{abbreviateAttribute(attr, 5)}</Text>
                  </View>
                ))}
              </View>

              {/* Cupper Rows */}
              {Array.from({ length: card.num_cuppers }).map((_, rowIndex) => (
                <View key={rowIndex} style={styles.tableRow}>
                  <View style={styles.cupperCell}>
                    <Text>{card.cuppers && card.cuppers[rowIndex] ? card.cuppers[rowIndex] : ''}</Text>
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
