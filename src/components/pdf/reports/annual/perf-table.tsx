/**
 * Shipper or seller table for one bucket: APP · REJ · TOTAL · MT APP · MT REJ
 * (· CONT. for SS) · %APP with a rate bar. %REJ is not printed — it is always
 * 100 − %APP. TOTAL GERAL prints the bucket totals, so it matches the cover.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { BucketTotals, GroupPerf } from '@/lib/reports/performance-data'
import { round1 } from '@/lib/reports/annual-math'
import { CHARCOAL, FILL, HAIR, MUTED, TYPE, fmtInt, fmtMt, pct, truncate } from './theme'
import { RateBar } from './rate-bar'

export const PERF_TABLE_CAP = 16
const NAME_MAX = 26

type Basis = 'count' | 'bags'

export interface PerfLine { name: string; app: number; rej: number; mtApp: number; mtRej: number; cont: number | null }
export type PerfTotals = Omit<PerfLine, 'name'>

const W = {
  count: { app: 30, rej: 30, tot: 34, mtApp: 44, mtRej: 44, cont: 0, rate: 62, bar: 30 },
  bags: { app: 38, rej: 32, tot: 38, mtApp: 40, mtRej: 34, cont: 26, rate: 56, bar: 24 },
} as const

export function perfLines(
  rows: GroupPerf[],
  basis: Basis,
  containers: Record<string, number> | null,
  cap: number = PERF_TABLE_CAP,
): PerfLine[] {
  const line = (g: GroupPerf): PerfLine => ({
    name: g.name,
    app: basis === 'bags' ? g.approvedBags : g.approvedCount,
    rej: basis === 'bags' ? g.rejectedBags : g.rejectedCount,
    mtApp: g.approvedMt,
    mtRej: g.rejectedMt,
    cont: containers ? containers[g.name.trim()] ?? 0 : null,
  })
  const lines = rows.map(line).sort((a, b) => (b.app + b.rej) - (a.app + a.rej) || a.name.localeCompare(b.name, 'en'))
  if (lines.length <= cap) return lines
  const rest = lines.slice(cap)
  const others: PerfLine = { name: `Others (${rest.length})`, app: 0, rej: 0, mtApp: 0, mtRej: 0, cont: containers ? 0 : null }
  for (const l of rest) {
    others.app += l.app
    others.rej += l.rej
    others.mtApp += l.mtApp
    others.mtRej += l.mtRej
    if (others.cont !== null) others.cont += l.cont ?? 0
  }
  others.mtApp = round1(others.mtApp)
  others.mtRej = round1(others.mtRej)
  return [...lines.slice(0, cap), others]
}

export function bucketPerfTotals(t: BucketTotals, basis: Basis, containers: number | null): PerfTotals {
  return basis === 'bags'
    ? { app: t.bagsApproved, rej: t.bagsRejected, mtApp: t.mtApproved, mtRej: t.mtRejected, cont: containers }
    : { app: t.approved, rej: t.rejected, mtApp: t.mtApproved, mtRej: t.mtRejected, cont: null }
}

const s = StyleSheet.create({
  title: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  head: { flexDirection: 'row', backgroundColor: FILL, paddingVertical: 3, paddingHorizontal: 4 },
  th: { fontSize: TYPE.tableHead, color: MUTED, letterSpacing: 0.4, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 2.5, paddingHorizontal: 4 },
  total: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: CHARCOAL, paddingVertical: 3, paddingHorizontal: 4 },
  // Layout only (flex + alignment) — deliberately NOT merged into `name`
  // below: that carries the 8pt BODY size, and [s.th, s.name] let its
  // fontSize win over s.th's 6.5pt, printing an oversized column header.
  thName: { flex: 1, textAlign: 'left' },
  name: { flex: 1, textAlign: 'left', fontSize: TYPE.table, maxLines: 1, textOverflow: 'ellipsis' },
  num: { textAlign: 'right', fontSize: TYPE.table },
  bold: { fontWeight: 600 },
  // CONT. is right-aligned, so paddingRight only pulls its text away from
  // %APP on its right — the wrong side. marginLeft inserts real space
  // between its box and MT REJ's, which sits flush against the shared
  // boundary; applied to header and value alike so both stay aligned.
  contGap: { marginLeft: 4 },
})

export function PerfTable({
  title,
  lines,
  totals,
  basis,
}: {
  title: string
  lines: PerfLine[]
  totals: PerfTotals
  basis: Basis
}) {
  const w = W[basis]
  const n = (v: number) => (basis === 'bags' ? fmtInt(v) : String(v))
  const cells = (l: PerfTotals, bold: boolean) => {
    const style = (width: number) => (bold ? [s.num, s.bold, { width }] : [s.num, { width }])
    return (
      <>
        <Text style={style(w.app)}>{n(l.app)}</Text>
        <Text style={style(w.rej)}>{n(l.rej)}</Text>
        <Text style={style(w.tot)}>{n(l.app + l.rej)}</Text>
        <Text style={style(w.mtApp)}>{fmtMt(l.mtApp)}</Text>
        <Text style={style(w.mtRej)}>{fmtMt(l.mtRej)}</Text>
        {basis === 'bags' ? <Text style={[...style(w.cont), s.contGap]}>{l.cont === null ? '—' : fmtInt(l.cont)}</Text> : null}
        <View style={{ width: w.rate }}>
          <RateBar rate={pct(l.app, l.app + l.rej)} width={w.bar} />
        </View>
      </>
    )
  }
  return (
    <View>
      <Text style={s.title}>{title}</Text>
      <View style={s.head}>
        <Text style={[s.th, s.thName]}>{basis === 'bags' ? 'COMPANY · BAGS' : 'COMPANY · CERTIFICATES'}</Text>
        <Text style={[s.th, { width: w.app }]}>APP</Text>
        <Text style={[s.th, { width: w.rej }]}>REJ</Text>
        <Text style={[s.th, { width: w.tot }]}>TOTAL</Text>
        <Text style={[s.th, { width: w.mtApp }]}>MT APP</Text>
        <Text style={[s.th, { width: w.mtRej }]}>MT REJ</Text>
        {basis === 'bags' ? <Text style={[s.th, { width: w.cont }, s.contGap]}>CONT.</Text> : null}
        <Text style={[s.th, { width: w.rate }]}>%APP</Text>
      </View>
      {lines.map(l => (
        <View key={l.name} style={s.row} wrap={false}>
          <Text style={s.name}>{truncate(l.name, NAME_MAX)}</Text>
          {cells(l, false)}
        </View>
      ))}
      <View style={s.total} wrap={false}>
        <Text style={[s.name, s.bold]}>TOTAL GERAL</Text>
        {cells(totals, true)}
      </View>
    </View>
  )
}
