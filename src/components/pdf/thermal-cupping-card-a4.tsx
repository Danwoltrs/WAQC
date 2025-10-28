import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Svg,
  Line,
} from '@react-pdf/renderer'
import { ThermalCuppingCardData } from './thermal-cupping-card'

// Create styles for A4 multi-card layout (12 cards per page, 4x3 grid)
const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    padding: '8pt',
    position: 'relative',
  },
  cardContainer: {
    width: '24%',
    marginRight: '1%',
    marginBottom: '1%',
    position: 'relative',
  },
  card: {
    border: '1pt solid #000000',
    fontSize: 5,
  },
  header: {
    flexDirection: 'row',
    borderBottom: '1pt solid #000000',
    padding: '2pt',
  },
  qrSection: {
    width: '35pt',
    marginRight: '2pt',
  },
  logo: {
    width: '35pt',
    height: '10pt',
    marginBottom: '1pt',
  },
  qrCode: {
    width: '35pt',
    height: '35pt',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'column',
  },
  companyName: {
    fontSize: 5,
    fontWeight: 'bold',
    marginBottom: '0.5pt',
  },
  sampleNumber: {
    fontSize: 6,
    fontWeight: 'bold',
    marginBottom: '0.5pt',
  },
  infoRow: {
    fontSize: 4.5,
    marginBottom: '0.25pt',
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
    width: '28pt',
    padding: '1pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 4.5,
    fontWeight: 'bold',
  },
  attributeColumn: {
    width: '14pt',
    padding: '1pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 4.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #CCCCCC',
    minHeight: '10pt',
  },
  cupperCell: {
    width: '28pt',
    padding: '1pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 4.5,
  },
  attributeCell: {
    width: '14pt',
    padding: '1pt',
    borderRight: '0.5pt solid #CCCCCC',
    fontSize: 4.5,
    textAlign: 'center',
  },
  defectsSection: {
    padding: '2pt',
  },
  defectLabel: {
    fontSize: 4.5,
    fontWeight: 'bold',
    marginBottom: '0.5pt',
  },
  defectSpace: {
    minHeight: '8pt',
    borderBottom: '0.5pt solid #CCCCCC',
    marginBottom: '1pt',
  },
  cuttingGuide: {
    position: 'absolute',
    stroke: '#CCCCCC',
    strokeWidth: 0.5,
    strokeDasharray: '2 2',
  },
})

interface ThermalCuppingCardA4DocumentProps {
  cards: ThermalCuppingCardData[]
  show_quality: boolean
  show_buyer: boolean
  show_exporter: boolean
}

/**
 * PDF Document component for A4 printer cupping cards
 * Generates 12 cards per page (4x3 grid) with cutting guides
 */
export const ThermalCuppingCardA4Document: React.FC<
  ThermalCuppingCardA4DocumentProps
> = ({ cards, show_quality, show_buyer, show_exporter }) => {
  // Split cards into pages (12 per page)
  const cardsPerPage = 12
  const pages: ThermalCuppingCardData[][] = []
  for (let i = 0; i < cards.length; i += cardsPerPage) {
    pages.push(cards.slice(i, i + cardsPerPage))
  }

  return (
    <Document>
      {pages.map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {/* Cutting Guides - 4x3 grid */}
          <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
            {/* Vertical lines (3 lines to create 4 columns) */}
            <Line
              x1="25%"
              y1="0"
              x2="25%"
              y2="100%"
              style={styles.cuttingGuide}
            />
            <Line
              x1="50%"
              y1="0"
              x2="50%"
              y2="100%"
              style={styles.cuttingGuide}
            />
            <Line
              x1="75%"
              y1="0"
              x2="75%"
              y2="100%"
              style={styles.cuttingGuide}
            />
            {/* Horizontal lines (2 lines to create 3 rows) */}
            <Line
              x1="0"
              y1="33.33%"
              x2="100%"
              y2="33.33%"
              style={styles.cuttingGuide}
            />
            <Line
              x1="0"
              y1="66.66%"
              x2="100%"
              y2="66.66%"
              style={styles.cuttingGuide}
            />
          </Svg>

          {/* Cards */}
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
                      WOLTHERS COFFEE QUALITY CONTROL
                    </Text>
                    <Text style={styles.sampleNumber}>
                      Sample: {card.sample_number}
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
                      <Text style={styles.infoRow}>
                        Buyer: {card.buyer_name}
                      </Text>
                    )}
                    {show_exporter && card.exporter_name && (
                      <Text style={styles.infoRow}>
                        Exporter: {card.exporter_name}
                      </Text>
                    )}
                    <Text style={styles.infoRow}>
                      Template: {card.template_name} ({card.template_scale_info}
                      )
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
                  {Array.from({ length: card.num_cuppers }).map(
                    (_, rowIndex) => (
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
