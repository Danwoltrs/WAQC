import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'
import { ThermalCuppingCardData, AttributeForCard } from './thermal-cupping-card'

/**
 * Intelligently abbreviates attribute names to fit in narrow columns
 * Priority: 1) User-defined abbreviation, 2) Known abbreviations, 3) Smart truncation
 */
function abbreviateAttribute(attr: string | AttributeForCard, maxLength: number = 6): string {
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
  // Max 4 characters to fit in narrow columns without wrapping
  const knownAbbreviations: Record<string, string> = {
    'Fragancia': 'Frag',
    'Fragrance': 'Frag',
    'Aroma': 'Arom',
    'Sabor': 'Sabr',
    'Flavor': 'Flav',
    'Retrogusto': 'Retr',
    'Aftertaste': 'Aftr',
    'Acidez': 'Acid',
    'Acidity': 'Acid',
    'Cuerpo': 'Cuer',
    'Body': 'Body',
    'Balance': 'Bal',
    'Dulzura': 'Dulz',
    'Dulçura': 'Dulç',
    'Sweetness': 'Swet',
    'Uniformidad': 'Unif',
    'Uniformity': 'Unif',
    'Taza Limpia': 'Limp',
    'Clean Cup': 'Clen',
    'Finish': 'Fin',
    'Umami': 'Umam',
    'Overall': 'Ovrl',
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

// Create styles for A4 multi-card layout (8 cards per page, 2x4 grid)
// Design: Thick borders show exactly where to cut with guillotine
const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    padding: '0pt',
    position: 'relative',
  },
  cardContainer: {
    width: '50%',
    position: 'relative',
  },
  card: {
    border: '2pt solid #000000', // THICK BLACK BORDER shows cutting lines
    fontSize: 6,
  },
  header: {
    flexDirection: 'row',
    borderBottom: '1pt solid #000000',
    padding: '2pt',
  },
  qrSection: {
    width: '50pt',
    marginRight: '3pt',
  },
  logo: {
    width: '50pt',
    height: '15pt',
    marginBottom: '2pt',
  },
  qrCode: {
    width: '50pt',
    height: '50pt',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  companyName: {
    fontSize: 6,
    fontWeight: 'bold',
    marginBottom: '1pt',
  },
  sampleNumber: {
    fontSize: 7,
    fontWeight: 'bold',
    marginBottom: '1pt',
  },
  infoRow: {
    fontSize: 6.5,
    marginBottom: '0.5pt',
    color: '#333333',
  },
  infoLabel: {
    fontWeight: 'bold',
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
    width: '60pt',
    padding: '2pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 9,
    fontWeight: 'bold',
  },
  attributeColumn: {
    width: '30pt',
    padding: '2pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 7,
    fontWeight: 'bold',
    textAlign: 'center',
    overflow: 'hidden',
    height: '12pt',
  },
  attributeText: {
    maxLines: 1,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #CCCCCC',
    minHeight: '18pt',
  },
  cupperCell: {
    width: '60pt',
    padding: '2pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 9,
  },
  attributeCell: {
    width: '30pt',
    padding: '2pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 10,
    textAlign: 'center',
  },
  defectsSection: {
    padding: '3pt',
  },
  defectLabel: {
    fontSize: 6,
    fontWeight: 'bold',
    marginBottom: '1pt',
  },
  defectSpace: {
    minHeight: '12pt',
    borderBottom: '0.5pt solid #CCCCCC',
    marginBottom: '2pt',
  },
})

interface ThermalCuppingCardA4DocumentProps {
  cards: ThermalCuppingCardData[]
  show_quality: boolean
  show_buyer: boolean
  show_supplier: boolean
  show_exporter: boolean
}

/**
 * PDF Document component for A4 printer cupping cards
 * Generates 8 cards per page (2x4 grid) with cutting guides
 */
export const ThermalCuppingCardA4Document: React.FC<
  ThermalCuppingCardA4DocumentProps
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

  // Split cards into pages (8 per page)
  const cardsPerPage = 8
  const pages: ThermalCuppingCardData[][] = []
  for (let i = 0; i < validatedCards.length; i += cardsPerPage) {
    const pageCards = validatedCards.slice(i, i + cardsPerPage)
    // Only add pages that have cards
    if (pageCards.length > 0) {
      pages.push(pageCards)
    }
  }

  return (
    <Document>
      {pages.filter(pageCards => pageCards.length > 0).map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {/* Cards - 2x4 grid with one thick outer border for guillotine cutting */}
          {pageCards.map((card, cardIndex) => (
            <View key={cardIndex} style={styles.cardContainer}>
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
                        <Text style={styles.infoLabel}>Quality:</Text> {card.quality_name}
                      </Text>
                    )}
                    {show_buyer && card.buyer_name && (
                      <Text style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Buyer:</Text> {card.buyer_name}
                      </Text>
                    )}
                    {show_exporter && card.exporter_name && (
                      <Text style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Exporter:</Text> {card.exporter_name}
                      </Text>
                    )}
                    {card.exporter_sample_number && (
                      <Text style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Exp. Sample #:</Text> {card.exporter_sample_number}
                      </Text>
                    )}
                    <Text style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Template:</Text> {card.template_name || 'Standard'} ({card.template_scale_info || '1-8, 0.25'})
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
                    {card.attributes.map((attr, attrIndex) => {
                      const fullName = typeof attr === 'object' ? (attr.abbreviation || attr.name) : attr
                      // Truncate to 5 characters max to prevent hyphenation
                      const attrName = fullName.length > 5 ? fullName.substring(0, 5) : fullName
                      return (
                        <View key={attrIndex} style={styles.attributeColumn}>
                          <Text style={styles.attributeText}>{attrName}</Text>
                        </View>
                      )
                    })}
                  </View>

                  {/* Cupper Rows */}
                  {Array.from({ length: card.num_cuppers }).map(
                    (_, rowIndex) => (
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
                    )
                  )}
                </View>

                {/* Defects Section */}
                <View style={styles.defectsSection}>
                  <Text style={styles.defectLabel}>TAINTS:</Text>
                  <View style={styles.defectSpace} />

                  <Text style={styles.defectLabel}>FAULTS:</Text>
                  <View style={styles.defectSpace} />
                </View>
              </View>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  )
}
