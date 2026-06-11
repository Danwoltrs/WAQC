import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from '@react-pdf/renderer'
import { ThermalCuppingCardData } from './thermal-cupping-card'

/**
 * SCA Coffee Value Assessment — Descriptive Form (SCA-103, Version 2, June 2024).
 * Replicates the official paper form (8.2 Descriptive Form, p.10): two sample
 * blocks per A4 portrait page, 0-15 intensity scales, olfactory CATA descriptor
 * checkboxes, Main Tastes (2), mouthfeel descriptors and per-section Notes boxes.
 * The SCA document states it may be reproduced and distributed without modification.
 *
 * Wolthers adaptations: tracking number printed in the SAMPLE NO. box and a QR
 * code at the top-right of each block (same WAQC QR payload as the other cards).
 * One copy of the sample set is generated per cupper, with the Name pre-filled.
 */

const BORDER = '0.75pt solid #1a1a1a'
const BAR_BG = '#1f2023'
const INK = '#1a1a1a'

// Olfactory CATA descriptors (SCA-103). Used twice: Fragrance/Aroma and Flavor/Aftertaste.
const OLFACTORY_LEFT: { parent: string; children: string[] }[] = [
  { parent: 'Floral', children: [] },
  { parent: 'Fruity', children: ['Berry', 'Dried Fruit', 'Citrus Fruit'] },
  { parent: 'Sour/Fermented', children: ['Sour', 'Fermented'] },
  { parent: 'Green/Vegetative', children: [] },
  { parent: 'Other', children: ['Chemical', 'Musty/Earthy', 'Woody'] },
]
const OLFACTORY_RIGHT: { parent: string; children: string[] }[] = [
  { parent: 'Roasted', children: ['Cereal', 'Burnt', 'Tobacco'] },
  { parent: 'Nutty/Cocoa', children: ['Nutty', 'Cocoa'] },
  { parent: 'Spice', children: [] },
  { parent: 'Sweet', children: ['Vanilla/Vanillin', 'Brown Sugar'] },
]
const MAIN_TASTES_COL_1 = ['Salty', 'Sour', 'Sweet']
const MAIN_TASTES_COL_2 = ['Bitter', 'Umami']

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 30,
    backgroundColor: '#FFFFFF',
    color: INK,
  },
  // ---- Page header -------------------------------------------------------
  pageHeader: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  titleBlock: { width: 170 },
  titleKicker: { fontSize: 6.5, color: '#444444', marginBottom: 3 },
  titleMain: { fontSize: 19, fontWeight: 'bold', color: '#2f2f2f', lineHeight: 1.05 },
  fillLines: { flex: 1, paddingHorizontal: 14, justifyContent: 'center' },
  fillRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
  fillLabel: { fontSize: 7, width: 38 },
  fillLine: {
    flex: 1,
    borderBottom: '0.5pt dotted #555555',
    minHeight: 9,
    justifyContent: 'flex-end',
  },
  fillValue: { fontSize: 7.5, paddingBottom: 0.5, paddingLeft: 2 },
  brandBlock: { width: 110, alignItems: 'flex-end' },
  brandName: { fontSize: 7.5, fontWeight: 'bold', textAlign: 'right' },
  brandSub: { fontSize: 6, color: '#555555', marginTop: 1.5, textAlign: 'right' },
  // ---- Sample block ------------------------------------------------------
  block: { position: 'relative', marginBottom: 10 },
  blockBar: { flexDirection: 'row', height: 16, marginBottom: 3 },
  barDark: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BAR_BG,
    paddingHorizontal: 4,
    width: '62%',
  },
  barLabel: { fontSize: 6, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 0.4 },
  barSampleBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    justifyContent: 'center',
  },
  barSampleId: { fontSize: 6.5, fontWeight: 'bold' },
  barSampleMeta: { fontSize: 4.5, color: '#333333', marginTop: 0.5 },
  roastGradient: { flex: 1, height: 16, border: '0.5pt solid #1a1a1a' },
  qrCode: {
    position: 'absolute',
    top: 21,
    right: 1.5,
    width: 34,
    height: 34,
  },
  // ---- Section boxes -----------------------------------------------------
  section: { flexDirection: 'row', marginBottom: 4 },
  sectionLeft: {
    flex: 1,
    border: BORDER,
    padding: 4,
  },
  notesBox: {
    width: 122,
    border: BORDER,
    borderLeft: 'none',
    padding: 3,
  },
  notesLabel: { fontSize: 5.5, fontWeight: 'bold' },
  // ---- Intensity scale ---------------------------------------------------
  scaleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  scaleName: { width: 64, paddingTop: 2 },
  scaleNameText: { fontSize: 7, fontWeight: 'bold' },
  scaleNameSub: { fontSize: 4.5, color: '#333333' },
  scaleTrack: { flex: 1, paddingRight: 2 },
  scaleLabels: { flexDirection: 'row', marginBottom: 1 },
  scaleLabel: {
    flex: 1,
    fontSize: 4.5,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    textAlign: 'center',
    color: '#333333',
  },
  scaleBar: { height: 3.5, backgroundColor: BAR_BG },
  ticksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 4,
  },
  tickMajor: { width: 0.7, height: 4, backgroundColor: INK },
  tickMinor: { width: 0.5, height: 2.5, backgroundColor: '#555555' },
  numbersRow: { position: 'relative', height: 5 },
  numText: { position: 'absolute', fontSize: 4, color: '#333333' },
  // ---- CATA checkboxes ---------------------------------------------------
  cataBlock: {
    flexDirection: 'row',
    borderTop: '0.5pt solid #999999',
    paddingTop: 2.5,
    marginTop: 1,
  },
  cataCol: { flex: 1, paddingRight: 3 },
  cataRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 1.5 },
  checkItem: { flexDirection: 'row', alignItems: 'center', marginRight: 4, marginBottom: 0.5 },
  checkbox: {
    width: 4.5,
    height: 4.5,
    border: '0.5pt solid #1a1a1a',
    marginRight: 1.5,
  },
  checkLabel: { fontSize: 5 },
  checkLabelBold: { fontWeight: 'bold' },
  mainTastes: { width: 78, borderLeft: '0.5pt solid #999999', paddingLeft: 4 },
  mainTastesTitle: { fontSize: 5, fontWeight: 'bold', marginBottom: 1.5 },
  mainTastesCols: { flexDirection: 'row' },
  mainTastesCol: { flex: 1 },
  // ---- Footer ------------------------------------------------------------
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 30,
    right: 30,
    fontSize: 4.5,
    color: '#666666',
  },
})

const CheckItem: React.FC<{ label: string; bold?: boolean; suffix?: string }> = ({
  label,
  bold,
  suffix,
}) => (
  <View style={styles.checkItem}>
    <View style={styles.checkbox} />
    <Text style={[styles.checkLabel, ...(bold ? [styles.checkLabelBold] : [])]}>
      {label}
      {suffix ? <Text style={[styles.checkLabel, { fontWeight: 'normal' }]}> {suffix}</Text> : null}
    </Text>
  </View>
)

/** A descriptor family on one row: bold parent followed by its sub-descriptors. */
const CataFamily: React.FC<{ parent: string; children_: string[] }> = ({ parent, children_ }) => (
  <View style={styles.cataRow}>
    <CheckItem label={parent} bold />
    {children_.map((c) => (
      <CheckItem key={c} label={c} />
    ))}
  </View>
)

/** 0-15 intensity scale with LOW / MEDIUM / HIGH guides, as on the paper form. */
const IntensityScale: React.FC<{ name: string }> = ({ name }) => (
  <View style={styles.scaleRow}>
    <View style={styles.scaleName}>
      <Text style={styles.scaleNameText}>{name}</Text>
      <Text style={styles.scaleNameSub}>Intensity</Text>
    </View>
    <View style={styles.scaleTrack}>
      <View style={styles.scaleLabels}>
        <Text style={styles.scaleLabel}>LOW</Text>
        <Text style={styles.scaleLabel}>MEDIUM</Text>
        <Text style={styles.scaleLabel}>HIGH</Text>
      </View>
      <View style={styles.scaleBar} />
      <View style={styles.ticksRow}>
        {Array.from({ length: 16 }).map((_, i) => (
          <View key={i} style={i % 5 === 0 ? styles.tickMajor : styles.tickMinor} />
        ))}
      </View>
      <View style={styles.numbersRow}>
        <Text style={[styles.numText, { left: 0 }]}>0</Text>
        <Text style={[styles.numText, { left: '33.3%', marginLeft: -1.5 }]}>5</Text>
        <Text style={[styles.numText, { left: '66.6%', marginLeft: -2.5 }]}>10</Text>
        <Text style={[styles.numText, { right: 0 }]}>15</Text>
      </View>
    </View>
  </View>
)

/** Olfactory descriptor checkbox block, optionally with the Main Tastes (2) column. */
const OlfactoryCata: React.FC<{ withMainTastes?: boolean }> = ({ withMainTastes }) => (
  <View style={styles.cataBlock}>
    <View style={[styles.cataCol, { flex: 1.15 }]}>
      {OLFACTORY_LEFT.map((f) => (
        <CataFamily key={f.parent} parent={f.parent} children_={f.children} />
      ))}
    </View>
    <View style={styles.cataCol}>
      {OLFACTORY_RIGHT.map((f) => (
        <CataFamily key={f.parent} parent={f.parent} children_={f.children} />
      ))}
    </View>
    {withMainTastes && (
      <View style={styles.mainTastes}>
        <Text style={styles.mainTastesTitle}>Main Tastes (2)</Text>
        <View style={styles.mainTastesCols}>
          <View style={styles.mainTastesCol}>
            {MAIN_TASTES_COL_1.map((t) => (
              <CheckItem key={t} label={t} bold />
            ))}
          </View>
          <View style={styles.mainTastesCol}>
            {MAIN_TASTES_COL_2.map((t) => (
              <CheckItem key={t} label={t} bold />
            ))}
          </View>
        </View>
      </View>
    )}
  </View>
)

/** Section row: assessment content on the left, Notes box on the right. */
const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.section} wrap={false}>
    <View style={styles.sectionLeft}>{children}</View>
    <View style={styles.notesBox}>
      <Text style={styles.notesLabel}>Notes</Text>
    </View>
  </View>
)

function sampleIdentifier(card: ThermalCuppingCardData): string {
  if (card.sample_type === 'ss') {
    return [card.ico_number || card.sample_number || card.tracking_number, card.container_nr]
      .filter(Boolean)
      .join('  |  ')
  }
  return card.exporter_sample_number || card.sample_number || card.tracking_number || 'Unknown'
}

interface SampleBlockProps {
  card: ThermalCuppingCardData
  gradientId: string
  show_quality: boolean
  show_buyer: boolean
  show_exporter: boolean
}

const SampleBlock: React.FC<SampleBlockProps> = ({
  card,
  gradientId,
  show_quality,
  show_buyer,
  show_exporter,
}) => {
  const meta = [
    show_quality && card.quality_name,
    show_buyer && card.buyer_name,
    show_exporter && card.exporter_name,
    card.wolthers_contract_nr,
  ]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <View style={styles.block} wrap={false}>
      {/* SAMPLE NO. bar + roast level gradient */}
      <View style={styles.blockBar}>
        <View style={styles.barDark}>
          <Text style={styles.barLabel}>SAMPLE NO.</Text>
          <View style={styles.barSampleBox}>
            <Text style={styles.barSampleId}>{sampleIdentifier(card)}</Text>
            {meta ? <Text style={styles.barSampleMeta}>{meta}</Text> : null}
          </View>
          <Text style={styles.barLabel}>ROAST LEVEL</Text>
        </View>
        <Svg style={styles.roastGradient} viewBox="0 0 100 10" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#f6f1e7" />
              <Stop offset="0.5" stopColor="#8a6a45" />
              <Stop offset="1" stopColor="#15110a" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="10" fill={`url(#${gradientId})`} />
        </Svg>
      </View>

      {card.qr_code ? <Image src={card.qr_code} style={styles.qrCode} /> : null}

      {/* Fragrance / Aroma + olfactory descriptors */}
      <Section>
        <IntensityScale name="Fragrance" />
        <IntensityScale name="Aroma" />
        <OlfactoryCata />
      </Section>

      {/* Flavor / Aftertaste + olfactory descriptors + main tastes */}
      <Section>
        <IntensityScale name="Flavor" />
        <IntensityScale name="Aftertaste" />
        <OlfactoryCata withMainTastes />
      </Section>

      {/* Acidity */}
      <Section>
        <IntensityScale name="Acidity" />
      </Section>

      {/* Sweetness */}
      <Section>
        <IntensityScale name="Sweetness" />
      </Section>

      {/* Mouthfeel + mouthfeel descriptors */}
      <Section>
        <IntensityScale name="Mouthfeel" />
        <View style={styles.cataBlock}>
          <View style={styles.cataCol}>
            <CheckItem label="Rough" suffix="(Gritty, Chalky, Sandy)" bold />
            <CheckItem label="Oily" bold />
          </View>
          <View style={styles.cataCol}>
            <CheckItem label="Smooth" suffix="(Velvety, Silky, Syrupy)" bold />
            <CheckItem label="Mouth-Drying" bold />
          </View>
          <View style={[styles.cataCol, { flex: 0.6 }]}>
            <CheckItem label="Metallic" bold />
          </View>
        </View>
      </Section>
    </View>
  )
}

export interface CvaDescriptiveFormDocumentProps {
  cards: ThermalCuppingCardData[]
  /** One copy of the full sample set is printed per cupper, Name pre-filled. */
  cupper_names?: string[]
  /** Blank copies to print when no cuppers are assigned. */
  num_copies?: number
  show_quality: boolean
  show_buyer: boolean
  show_exporter: boolean
}

/**
 * PDF document for SCA CVA Descriptive Forms — A4 portrait, two sample blocks
 * per page (matching the official SCA-103 paper form), one set per cupper.
 */
export const CvaDescriptiveFormDocument: React.FC<CvaDescriptiveFormDocumentProps> = ({
  cards,
  cupper_names,
  num_copies,
  show_quality,
  show_buyer,
  show_exporter,
}) => {
  const copies: (string | null)[] =
    cupper_names && cupper_names.length > 0
      ? cupper_names
      : Array.from({ length: Math.max(1, num_copies || 1) }, () => null)

  const printDate = cards[0]?.print_date || ''

  // Two sample blocks per page, as on the paper form
  const pairs: ThermalCuppingCardData[][] = []
  for (let i = 0; i < cards.length; i += 2) {
    pairs.push(cards.slice(i, i + 2))
  }

  return (
    <Document>
      {copies.flatMap((cupperName, copyIndex) =>
        pairs.map((pair, pageIndex) => (
          <Page key={`${copyIndex}-${pageIndex}`} size="A4" style={styles.page}>
            <View style={styles.pageHeader}>
              <View style={styles.titleBlock}>
                <Text style={styles.titleKicker}>SCA Coffee Value Assessment</Text>
                <Text style={styles.titleMain}>Descriptive</Text>
                <Text style={styles.titleMain}>Form</Text>
              </View>
              <View style={styles.fillLines}>
                <View style={styles.fillRow}>
                  <Text style={styles.fillLabel}>Name</Text>
                  <View style={styles.fillLine}>
                    {cupperName ? <Text style={styles.fillValue}>{cupperName}</Text> : null}
                  </View>
                </View>
                <View style={styles.fillRow}>
                  <Text style={styles.fillLabel}>Date</Text>
                  <View style={styles.fillLine}>
                    {printDate ? <Text style={styles.fillValue}>{printDate}</Text> : null}
                  </View>
                </View>
                <View style={[styles.fillRow, { marginBottom: 0 }]}>
                  <Text style={styles.fillLabel}>Purpose</Text>
                  <View style={styles.fillLine} />
                </View>
              </View>
              <View style={styles.brandBlock}>
                <Text style={styles.brandName}>WOLTHERS & ASSOCIATES</Text>
                {pair[0]?.lab_name ? <Text style={styles.brandSub}>{pair[0].lab_name}</Text> : null}
              </View>
            </View>

            {pair.map((card, blockIndex) => (
              <SampleBlock
                key={card.sample_id || blockIndex}
                card={card}
                gradientId={`roast-${copyIndex}-${pageIndex}-${blockIndex}`}
                show_quality={show_quality}
                show_buyer={show_buyer}
                show_exporter={show_exporter}
              />
            ))}

            <Text style={styles.footer} fixed>
              Form layout per SCA Coffee Value Assessment — Descriptive Form, SCA Version 2 (June
              2024), © 2024 Specialty Coffee Association. Reproduced without modification per the
              SCA reproduction notice. sca.coffee/value-assessment
            </Text>
          </Page>
        ))
      )}
    </Document>
  )
}
