/**
 * Cover: the two logos together at the top, the title, and the year at a
 * glance — quantity first (MT, bags, containers), then the certificate line.
 */
import React from 'react'
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import type { AnnualGlance } from '@/lib/reports/annual-glance'
import { CHARCOAL, HAIR, MUTED, TYPE, WHITE, fmtInt, fmtMt, formatIssued } from './theme'
import { MonthSparkline } from './sparkline'

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', color: CHARCOAL, backgroundColor: WHITE, paddingTop: 40, paddingHorizontal: 48, paddingBottom: 60 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logos: { flexDirection: 'row', alignItems: 'center' },
  logoRule: { width: 0.5, height: 26, backgroundColor: HAIR, marginHorizontal: 14 },
  logoText: { fontSize: 12, fontWeight: 600 },
  flags: { flexDirection: 'row', gap: 6 },
  flag: { width: 24, height: 16, objectFit: 'contain' },
  titleBlock: { marginTop: 88 },
  eyebrow: { fontSize: TYPE.small, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: TYPE.coverTitle, fontWeight: 600 },
  year: { fontSize: TYPE.coverTitle, fontWeight: 400, marginTop: 2 },
  rule: { width: 40, height: 1, backgroundColor: CHARCOAL, marginTop: 18, marginBottom: 18 },
  glanceLabel: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  glanceRow: { flexDirection: 'row', alignItems: 'flex-end' },
  figure: { marginRight: 44 },
  figureValue: { fontSize: TYPE.coverGlance, fontWeight: 600 },
  figureCaption: { fontSize: TYPE.small, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },
  line: { fontSize: TYPE.body, marginTop: 14 },
  methodology: { fontSize: TYPE.small, color: MUTED, lineHeight: 1.45, marginTop: 24, maxWidth: 560 },
  bottom: {
    position: 'absolute', left: 48, right: 48, bottom: 32,
    borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 8,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  bottomText: { fontSize: TYPE.label, color: MUTED },
})

export interface CoverPageProps {
  clientName: string
  year: number
  issuedAt: string
  glance: AnnualGlance
  labs: string[]
  wolthersLogo?: string
  clientLogo?: string
  flags: string[]
  /** Printed on the cover only when no later page carries it (a year without certificates). */
  methodology?: string | null
}

export function CoverPage({ clientName, year, issuedAt, glance, labs, wolthersLogo, clientLogo, flags, methodology }: CoverPageProps) {
  const ss = glance.basis === 'ss'
  const figures = [
    { value: fmtMt(glance.mt), caption: ss ? 'MT cleared' : 'MT approved at pre-shipment' },
    { value: fmtInt(glance.bags), caption: ss ? 'Bags (60 kg)' : 'Bags approved at pre-shipment' },
    ...(ss && glance.containers !== null ? [{ value: fmtInt(glance.containers), caption: 'Containers' }] : []),
  ]
  const c = glance.certificates
  const a = glance.approvalRate
  const rates = [c.pss > 0 ? `PSS ${a.pss}%` : null, c.ss > 0 ? `SS ${a.ss}%` : null].filter(Boolean).join(' · ')
  const rejections = glance.rejections.total
  const line = c.total === 0
    ? 'No certificates were issued for this client in the year.'
    : `${fmtInt(c.total)} certificates (PSS ${fmtInt(c.pss)} · SS ${fmtInt(c.ss)}) · Approval ${a.overall}%${rates ? ` (${rates})` : ''} · ${fmtInt(rejections)} ${rejections === 1 ? 'rejection' : 'rejections'}`

  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <View style={s.top}>
        <View style={s.logos}>
          {wolthersLogo ? (
            <Image src={wolthersLogo} style={{ height: 26, width: 130, objectFit: 'contain' }} />
          ) : (
            <Text style={s.logoText}>{'Wolthers & Associates'}</Text>
          )}
          <View style={s.logoRule} />
          {clientLogo ? (
            <Image src={clientLogo} style={{ height: 26, width: 150, objectFit: 'contain' }} />
          ) : (
            <Text style={s.logoText}>{clientName}</Text>
          )}
        </View>
        <View style={s.flags}>
          {flags.slice(0, 4).map((f, i) => <Image key={i} src={f} style={s.flag} />)}
        </View>
      </View>

      <View style={s.titleBlock}>
        <Text style={s.eyebrow}>{clientName}</Text>
        <Text style={s.title}>Annual Quality Performance Review</Text>
        <Text style={s.year}>{String(year)}</Text>
      </View>
      <View style={s.rule} />

      <Text style={s.glanceLabel}>The year at a glance</Text>
      <View style={s.glanceRow}>
        {figures.map(f => (
          <View key={f.caption} style={s.figure}>
            <Text style={s.figureValue}>{f.value}</Text>
            <Text style={s.figureCaption}>{f.caption}</Text>
          </View>
        ))}
        <MonthSparkline values={glance.monthlyMt} label={ss ? 'MT cleared by month' : 'MT approved by month'} />
      </View>
      <Text style={s.line}>{line}</Text>
      {methodology ? <Text style={s.methodology}>{methodology}</Text> : null}

      <View style={s.bottom} fixed>
        <Text style={s.bottomText}>{`Prepared by Wolthers & Associates · Quality Control${labs.length ? ` · ${labs.join(', ')}` : ''}`}</Text>
        <Text style={s.bottomText}>{`Issued ${formatIssued(issuedAt)}`}</Text>
      </View>
    </Page>
  )
}
