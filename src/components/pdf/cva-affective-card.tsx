import React from 'react'
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import { cardSampleIdentifier } from './card-identifier'
import type { ThermalCuppingCardData } from './thermal-cupping-card'

/**
 * SCA Coffee Value Assessment — Affective Form (SCA-104 §7.2, Version 2,
 * June 2024) as a cupping CARD: the 1–9 impression-of-quality scales for
 * Fragrance, Aroma, Flavor, Aftertaste, Acidity, Sweetness, Mouthfeel and
 * Overall with a FINAL box each, the non-uniform / defective cup boxes and
 * the Moldy / Phenolic / Potato defects, at the size of the commodity card
 * so a mixed batch prints and cuts as one stack. The form is single-cupper
 * by construction, so it is one card per sample per cupper, name pre-filled.
 *
 * Wolthers adaptations of the SCA form (which may be reproduced "without
 * modification"): sample metadata in the header, the cupper's name, a QR
 * code attributing the card to sample + cupper, and the card size. The SCA
 * copyright line is kept. This is the same call the Descriptive component
 * (`cva-descriptive-card.tsx`) documented for its own adaptations.
 */

export const AFFECTIVE_ATTRIBUTES = [
  'Fragrance',
  'Aroma',
  'Flavor',
  'Aftertaste',
  'Acidity',
  'Sweetness',
  'Mouthfeel',
  'Overall',
] as const

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const FIVE_BOXES = [1, 2, 3, 4, 5] as const
const DEFECTS = ['Moldy', 'Phenolic', 'Potato'] as const
const LEGEND =
  '1 Extremely low  ·  2 Very low  ·  3 Moderately low  ·  4 Slightly low  ·  5 Neither high nor low  ·  6 Slightly high  ·  7 Moderately high  ·  8 Very high  ·  9 Extremely high'

export type AffectiveCardVariant = 'a4' | 'a6'

const INNER_BORDER = '0.5pt solid #000000'
const INNER_BORDER_LIGHT = '0.5pt solid #CCCCCC'
const RING = '0.6pt solid #000000'

/**
 * One style set per card size. The A4 8-up card is ~290×194pt inside its cut
 * border; the A6 thermal card ~404×282pt. Everything scales by `s` so the
 * two faces are the same drawing; the Notes area takes the leftover height.
 */
function makeStyles(variant: AffectiveCardVariant) {
  const s = variant === 'a6' ? 1.3 : 1
  const ring = 9 * s
  return StyleSheet.create({
    card: { flexDirection: 'column', height: '100%', fontSize: 6 * s, color: '#000000' },
    header: { flexDirection: 'row', borderBottom: INNER_BORDER, padding: 2 * s },
    qr: { width: 40 * s, height: 40 * s, marginRight: 3 * s },
    headerMain: { flex: 1, flexDirection: 'column' },
    headerSide: { width: 82 * s, alignItems: 'flex-end' },
    company: { fontSize: 6 * s, fontWeight: 'bold', marginBottom: 1 },
    sampleNumber: { fontSize: 7 * s, fontWeight: 'bold', marginBottom: 1 },
    infoRow: { fontSize: 5.5 * s, color: '#333333', marginBottom: 0.5 },
    infoLabel: { fontWeight: 'bold' },
    quality: { fontSize: 7 * s, fontWeight: 'bold', marginTop: 'auto' },
    contractNr: { fontSize: 6.5 * s, fontWeight: 'bold', textAlign: 'right' },
    printDate: { fontSize: 6 * s, fontWeight: 'bold', textAlign: 'right', marginTop: 1 },
    formTag: { fontSize: 4.5 * s, color: '#555555', textAlign: 'right', marginTop: 'auto', letterSpacing: 0.3 },
    cupper: { fontSize: 6.5 * s, fontWeight: 'bold', textAlign: 'right', marginTop: 1 },
    legend: {
      fontSize: 4 * s,
      color: '#333333',
      paddingHorizontal: 2 * s,
      paddingVertical: 1 * s,
      borderBottom: INNER_BORDER_LIGHT,
    },
    scales: { paddingHorizontal: 2 * s, paddingTop: 1 * s },
    scaleRow: { flexDirection: 'row', alignItems: 'center', height: 13 * s },
    scaleName: { width: 42 * s, fontSize: 6.5 * s, fontWeight: 'bold' },
    circles: { flexDirection: 'row', alignItems: 'center' },
    circle: {
      width: ring,
      height: ring,
      borderRadius: ring / 2,
      border: RING,
      marginRight: 4 * s,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleText: { fontSize: 5 * s },
    finalBox: {
      width: 26 * s,
      height: ring,
      border: RING,
      borderRadius: ring / 2,
      marginLeft: 4 * s,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finalText: { fontSize: 4 * s, letterSpacing: 0.4, color: '#555555' },
    footer: { borderTop: INNER_BORDER, paddingHorizontal: 2 * s, paddingTop: 1.5 * s, flex: 1 },
    cupsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 1.5 * s },
    cupsLabel: { fontSize: 4.5 * s, fontWeight: 'bold', marginRight: 2 * s },
    box: { width: 5.5 * s, height: 5.5 * s, border: '0.5pt solid #000000', marginRight: 1.5 * s },
    defectItem: { flexDirection: 'row', alignItems: 'center', marginRight: 4 * s },
    defectLabel: { fontSize: 4.5 * s },
    spacer: { width: 8 * s },
    notes: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
    notesLabel: { fontSize: 4.5 * s, fontWeight: 'bold', marginRight: 2 * s },
    notesLine: { flex: 1, borderBottom: INNER_BORDER_LIGHT, minHeight: 7 * s },
    copyright: { fontSize: 3.5 * s, color: '#777777', paddingHorizontal: 2 * s, paddingBottom: 1 * s },
  })
}

const STYLES: Record<AffectiveCardVariant, ReturnType<typeof makeStyles>> = {
  a4: makeStyles('a4'),
  a6: makeStyles('a6'),
}

export interface CvaAffectiveCardFaceProps {
  card: ThermalCuppingCardData
  variant: AffectiveCardVariant
  show_quality: boolean
  show_buyer: boolean
  show_exporter: boolean
}

export const CvaAffectiveCardFace: React.FC<CvaAffectiveCardFaceProps> = ({
  card,
  variant,
  show_quality,
  show_buyer,
  show_exporter,
}) => {
  const st = STYLES[variant]
  const contracts = [card.wolthers_contract_nr, ...(card.sibling_contract_nrs || [])].filter(Boolean) as string[]

  return (
    <View style={st.card}>
      <View style={st.header}>
        {card.qr_code ? <Image src={card.qr_code} style={st.qr} /> : null}
        <View style={st.headerMain}>
          <Text style={st.company}>WOLTHERS & ASSOCIATES</Text>
          <Text style={st.sampleNumber}>
            {card.sample_type ? card.sample_type.toUpperCase() : 'TYPE'}: {cardSampleIdentifier(card)}
          </Text>
          {show_buyer && card.buyer_name ? (
            <Text style={st.infoRow}>
              <Text style={st.infoLabel}>Importer:</Text> {card.buyer_name}
            </Text>
          ) : null}
          {show_exporter && card.exporter_name ? (
            <Text style={st.infoRow}>
              <Text style={st.infoLabel}>Exporter:</Text> {card.exporter_name}
            </Text>
          ) : null}
          {card.sample_type === 'ss' && card.exporter_sample_number ? (
            <Text style={st.infoRow}>
              <Text style={st.infoLabel}>Exp. Sample #:</Text> {card.exporter_sample_number}
            </Text>
          ) : null}
          {show_quality && card.quality_name ? <Text style={st.quality}>{card.quality_name}</Text> : null}
        </View>
        <View style={st.headerSide}>
          {contracts.length <= 3 ? (
            contracts.map((nr, i) => (
              <Text key={i} style={st.contractNr}>
                {nr}
              </Text>
            ))
          ) : (
            <Text style={st.contractNr}>
              {contracts.length} contracts: {contracts[0]} - {contracts[contracts.length - 1]}
            </Text>
          )}
          {card.print_date ? <Text style={st.printDate}>{card.print_date}</Text> : null}
          <Text style={st.formTag}>SCA CVA · AFFECTIVE</Text>
          <Text style={st.cupper}>Cupper: {card.cupper_name || '________________'}</Text>
        </View>
      </View>

      <Text style={st.legend}>{LEGEND}</Text>

      <View style={st.scales}>
        {AFFECTIVE_ATTRIBUTES.map((name) => (
          <View key={name} style={st.scaleRow}>
            <Text style={st.scaleName}>{name}</Text>
            <View style={st.circles}>
              {SCALE.map((n) => (
                <View key={n} style={st.circle}>
                  <Text style={st.circleText}>{n}</Text>
                </View>
              ))}
              <View style={st.finalBox}>
                <Text style={st.finalText}>FINAL</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={st.footer}>
        <View style={st.cupsRow}>
          <Text style={st.cupsLabel}>NON-UNIFORM CUPS</Text>
          {FIVE_BOXES.map((n) => (
            <View key={`nu-${n}`} style={st.box} />
          ))}
          <View style={st.spacer} />
          <Text style={st.cupsLabel}>DEFECTIVE CUPS</Text>
          {FIVE_BOXES.map((n) => (
            <View key={`df-${n}`} style={st.box} />
          ))}
          <View style={st.spacer} />
          <Text style={st.cupsLabel}>DEFECT:</Text>
          {DEFECTS.map((d) => (
            <View key={d} style={st.defectItem}>
              <View style={st.box} />
              <Text style={st.defectLabel}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={st.notes}>
          <Text style={st.notesLabel}>Notes</Text>
          <View style={st.notesLine} />
        </View>
      </View>

      <Text style={st.copyright}>
        SCA Affective Form, Version 2 (June 2024), © 2024 Specialty Coffee Association. Wolthers card
        adaptation. sca.coffee/value-assessment
      </Text>
    </View>
  )
}
