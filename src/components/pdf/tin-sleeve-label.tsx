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
    page: {
      flexDirection: 'column',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      padding: 0,
    },
    labelContainer: {
      width: 165 * MM,
      height: labelHeight,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottom: '0.3pt dashed #BBBBBB',
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
    headline: {
      fontSize: headSize,
      fontWeight: 'bold',
      color: '#000000',
      marginBottom: 0.8 * MM,
      maxLines: 1,
    },
    line: {
      fontSize: bodySize,
      color: '#000000',
      marginBottom: 0.8 * MM,
      maxLines: 2,
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
            <View key={index} style={styles.labelContainer}>
              <Image src={label.logo_url} style={styles.logo} />
              {label.qr_code && <Image src={label.qr_code} style={styles.qrCode} />}

              <View style={styles.body}>
                <Text style={styles.headline}>
                  {label.headline}
                </Text>

                {partyParts.length > 0 && (
                  <Text style={styles.line}>
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
                  <Text style={styles.line}>
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
          )
        })}
      </Page>
    </Document>
  )
}
