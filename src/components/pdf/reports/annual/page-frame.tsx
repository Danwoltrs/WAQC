/**
 * The frame every annual page after the cover shares: header (eyebrow,
 * numbered section title, client and year), content, and a `fixed` footer.
 * The footer is `fixed` so react-pdf's splitter never cuts it onto a page of
 * its own (the certificate lost a footer line to page 2 that way).
 */
import React from 'react'
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { CHARCOAL, HAIR, MUTED, PAGE_MARGIN, RED, TYPE, WHITE } from './theme'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: TYPE.table,
    color: CHARCOAL,
    backgroundColor: WHITE,
    paddingTop: PAGE_MARGIN - 6,
    paddingBottom: PAGE_MARGIN + 8,
    paddingHorizontal: PAGE_MARGIN,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 0.5,
    borderBottomColor: HAIR,
    paddingBottom: 6,
    marginBottom: 14,
  },
  eyebrow: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  number: { fontSize: TYPE.section, fontWeight: 600, color: MUTED, marginRight: 8 },
  title: { fontSize: TYPE.section, fontWeight: 600, color: CHARCOAL },
  draftChip: { marginLeft: 10, borderWidth: 0.75, borderColor: RED, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1.5 },
  draftText: { fontSize: TYPE.label, color: RED, fontWeight: 600, letterSpacing: 0.6 },
  headerRight: { fontSize: TYPE.small, color: MUTED },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: 5,
    fontSize: TYPE.label,
    color: MUTED,
  },
})

export interface AnnualPageProps {
  sectionNumber: string
  title: string
  clientName: string
  year: number
  /** Unapproved year-in-review text: red chip and footer note. Previews only — send refuses it. */
  draft?: boolean
  children?: React.ReactNode
}

export function AnnualPage({ sectionNumber, title, clientName, year, draft = false, children }: AnnualPageProps) {
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>{'Wolthers & Associates · Quality Control'}</Text>
          <View style={s.titleRow}>
            <Text style={s.number}>{sectionNumber}</Text>
            <Text style={s.title}>{title}</Text>
            {draft ? (
              <View style={s.draftChip}>
                <Text style={s.draftText}>{'DRAFT – NOT APPROVED'}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={s.headerRight}>{`${clientName} · ${year}`}</Text>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>{`Annual Quality Performance Review ${year} · ${clientName}${draft ? ' · Draft for internal review' : ''}`}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  )
}
