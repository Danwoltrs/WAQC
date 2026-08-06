import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { SleeveLabelFields } from '@/lib/sleeve-label-data'

/** 1mm in PDF points. */
const MM = 2.8346

export interface TinSleeveLabelData extends SleeveLabelFields {
  qr_code?: string
  logo_url: string
  size?: '4cm' | '2.5cm'
}

const createStyles = (size: '4cm' | '2.5cm' = '4cm') => {
  const compact = size === '2.5cm'
  const labelHeight = (compact ? 25 : 40) * MM
  const qrSize = (compact ? 18 : 27) * MM
  const logoWidth = (compact ? 22 : 30) * MM
  const headSize = compact ? 9 : 11
  const bodySize = compact ? 5.5 : 6.5

  return StyleSheet.create({
    // No alignItems here: the row is full width and centres its own child. A
    // width: '100%' child inside a cross-axis-centering parent can shrink-wrap
    // in react-pdf's flex implementation, pulling the dashed rule back in from
    // the page edges.
    page: {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      padding: 0,
    },
    // The dashed rule lives on a full-page-width row so a guillotine has an
    // edge-to-edge line to register against. The 165mm label sits centred
    // inside it.
    labelRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'center',
      borderBottom: '0.3pt dashed #BBBBBB',
    },
    labelRowFirst: {
      borderTop: '0.3pt dashed #BBBBBB',
    },
    labelContainer: {
      width: 165 * MM,
      height: labelHeight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 3 * MM,
      paddingBottom: 3 * MM,
      paddingLeft: 3 * MM,
      paddingRight: 4 * MM,
    },
    logo: {
      width: logoWidth,
      height: 'auto',
      objectFit: 'contain',
    },
    qrCode: {
      width: qrSize,
      height: qrSize,
      marginLeft: 4 * MM,
    },
    body: {
      flex: 1,
      minWidth: 0,
      marginLeft: 4 * MM,
      flexDirection: 'column',
      justifyContent: 'center',
    },
    // Every clamped line pairs maxLines with textOverflow: @react-pdf/layout
    // only sets textkit's truncateMode from textOverflow, so maxLines on its
    // own hard-cuts the text with no marker that anything was dropped.
    headline: {
      fontSize: headSize,
      fontWeight: 'bold',
      color: '#000000',
      marginBottom: 0.8 * MM,
      maxLines: 1,
      textOverflow: 'ellipsis',
    },
    // Seller / Client: one line only. The label height is fixed, so a long
    // exporter name must truncate rather than push the foot rule off the tin.
    lineOne: {
      fontSize: bodySize,
      color: '#000000',
      marginBottom: 0.8 * MM,
      maxLines: 1,
      textOverflow: 'ellipsis',
    },
    // Cert. / Roaster: allowed a second line, because a sample with
    // sub-contracts comma-joins several certificate numbers here.
    lineTwo: {
      fontSize: bodySize,
      color: '#000000',
      marginBottom: 0.8 * MM,
      maxLines: 2,
      textOverflow: 'ellipsis',
    },
    key: {
      fontWeight: 'bold',
      color: '#000000',
    },
    muted: {
      color: '#3A3A3A',
    },
    sep: {
      color: '#BDBDBD',
    },
    foot: {
      marginTop: 1.4 * MM,
      paddingTop: 1.2 * MM,
      borderTop: '0.3pt solid #BDBDBD',
      fontSize: bodySize,
      color: '#3A3A3A',
      maxLines: 1,
      textOverflow: 'ellipsis',
    },
    qual: {
      fontWeight: 'bold',
      color: '#000000',
    },
  })
}

const SEP = '  |  '

interface TinSleeveLabelDocumentProps {
  labels: TinSleeveLabelData[]
}

/**
 * Tin sleeve labels: 165mm x 40mm (or 25mm), 5 per A4 landscape page.
 *
 * Layout follows docs/prompts/sleeve_qr/waqc-sleeve-lines.html — flowing lines
 * rather than cells, so a long exporter name pushes its line along instead of
 * breaking a grid. Fields with no value are omitted entirely.
 *
 * At 2.5cm the Seller/Client pair merges onto the Cert. line to buy vertical
 * room; every other field behaves the same.
 */
export const TinSleeveLabelDocument: React.FC<TinSleeveLabelDocumentProps> = ({ labels }) => {
  const size = labels[0]?.size || '4cm'
  const styles = createStyles(size)
  const compact = size === '2.5cm'

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {labels.map((label, index) => {
          // At 2.5cm everything after the headline shares one line.
          const partyParts = compact
            ? []
            : ([
                label.seller ? { key: 'Seller: ', value: label.seller } : null,
                label.client ? { key: 'Client: ', value: label.client } : null,
              ].filter(Boolean) as Array<{ key: string; value: string }>)

          const certParts = ([
            label.cert ? { key: 'Cert.: ', value: label.cert } : null,
            label.roaster ? { key: 'Roaster: ', value: label.roaster } : null,
            ...(compact
              ? [
                  label.seller ? { key: 'Seller: ', value: label.seller } : null,
                  label.client ? { key: 'Client: ', value: label.client } : null,
                ]
              : []),
          ].filter(Boolean) as Array<{ key: string; value: string }>)

          const footParts = [label.quality, label.quantity, label.date].filter(Boolean) as string[]

          return (
            <View
              key={index}
              style={index === 0 ? [styles.labelRow, styles.labelRowFirst] : styles.labelRow}
            >
              <View style={styles.labelContainer}>
                <Image src={label.logo_url} style={styles.logo} />
                {label.qr_code && <Image src={label.qr_code} style={styles.qrCode} />}

                <View style={styles.body}>
                  <Text style={styles.headline}>
                    {label.headline}
                  </Text>

                  {partyParts.length > 0 && (
                    <Text style={styles.lineOne}>
                      {partyParts.map((p, i) => (
                        <Text key={p.key}>
                          {i > 0 ? <Text style={styles.sep}>{SEP}</Text> : null}
                          <Text style={styles.key}>{p.key}</Text>
                          <Text>{p.value}</Text>
                        </Text>
                      ))}
                    </Text>
                  )}

                  {certParts.length > 0 && (
                    <Text style={styles.lineTwo}>
                      {certParts.map((p, i) => (
                        <Text key={p.key}>
                          {i > 0 ? <Text style={styles.sep}>{SEP}</Text> : null}
                          <Text style={styles.key}>{p.key}</Text>
                          <Text>{p.value}</Text>
                        </Text>
                      ))}
                    </Text>
                  )}

                  {footParts.length > 0 && (
                    <Text style={styles.foot}>
                      {footParts.map((part, i) => (
                        <Text key={part}>
                          {i > 0 ? <Text style={styles.sep}>{SEP}</Text> : null}
                          <Text style={i === 0 && label.quality ? styles.qual : styles.muted}>
                            {part}
                          </Text>
                        </Text>
                      ))}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )
        })}
      </Page>
    </Document>
  )
}
