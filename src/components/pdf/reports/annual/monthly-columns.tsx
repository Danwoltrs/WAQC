/**
 * Monthly stacked columns (approved charcoal, rejected red, rounded tops, the
 * approval % above) and the month-totals table beneath, both on the heat
 * map's column grid so every month lines up down the page.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { MONTH_LABELS, type MonthlyBasis, type MonthTotal } from '@/lib/reports/annual-monthly'
import { bandColors, CHARCOAL, FILL, fmtInt, fmtPct, HAIR, MONTH_GRID, MONTH_GRID_WIDTH, MUTED, pct, rateBand, RED, TYPE } from './theme'

const BAR_W = 18

const s = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', width: MONTH_GRID_WIDTH, borderBottomWidth: 0.5, borderBottomColor: HAIR },
  col: { width: MONTH_GRID.month, alignItems: 'center', justifyContent: 'flex-end' },
  pctLabel: { fontSize: TYPE.label, marginBottom: 1.5 },
  tick: { width: BAR_W, height: 0.75, backgroundColor: HAIR },
  table: { width: MONTH_GRID_WIDTH, marginTop: 4 },
  head: { flexDirection: 'row', backgroundColor: FILL, paddingVertical: 2 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 1.5 },
  label: { width: MONTH_GRID.name, fontSize: TYPE.tableHead, color: MUTED, letterSpacing: 0.4, paddingLeft: 4 },
  cell: { width: MONTH_GRID.month, fontSize: 7.5, textAlign: 'center' },
  th: { width: MONTH_GRID.month, fontSize: TYPE.tableHead, color: MUTED, textAlign: 'center', letterSpacing: 0.4 },
  year: { width: MONTH_GRID.year, fontSize: 7.5, textAlign: 'right', paddingRight: 4, fontWeight: 600 },
  yearHead: { width: MONTH_GRID.year, fontSize: TYPE.tableHead, color: MUTED, textAlign: 'right', paddingRight: 4, letterSpacing: 0.4 },
  empty: { color: HAIR },
})

export function MonthlyColumns({ totals, height = 56 }: { totals: MonthTotal[]; height?: number }) {
  const max = Math.max(1, ...totals.map(t => t.total))
  return (
    <View style={[s.chart, { height: height + 10 }]}>
      <View style={{ width: MONTH_GRID.name }} />
      {totals.map(t => {
        const hApp = (t.approved / max) * height
        const hRej = (t.rejected / max) * height
        const top = { borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 }
        return (
          <View key={t.month} style={[s.col, { height: height + 10 }]}>
            {t.total > 0 ? (
              <Text style={[s.pctLabel, { color: bandColors(rateBand(t.rate)).text }]}>{fmtPct(t.rate)}</Text>
            ) : null}
            {hRej > 0 ? <View style={[{ width: BAR_W, height: hRej, backgroundColor: RED }, top]} /> : null}
            {hApp > 0 ? (
              <View style={hRej > 0 ? { width: BAR_W, height: hApp, backgroundColor: CHARCOAL } : [{ width: BAR_W, height: hApp, backgroundColor: CHARCOAL }, top]} />
            ) : null}
            {t.total === 0 ? <View style={s.tick} /> : null}
          </View>
        )
      })}
      <View style={{ width: MONTH_GRID.year }} />
    </View>
  )
}

export function MonthTotalsTable({
  totals,
  basis,
  yearContainers,
}: {
  totals: MonthTotal[]
  basis: MonthlyBasis
  yearContainers: number | null
}) {
  const n = (v: number) => (basis === 'bags' ? fmtInt(v) : String(v))
  const yApp = totals.reduce((sum, t) => sum + t.approved, 0)
  const yRej = totals.reduce((sum, t) => sum + t.rejected, 0)
  const yTot = yApp + yRej
  const rows: Array<{ label: string; cell: (t: MonthTotal) => string; year: string; rate?: boolean }> = [
    { label: 'APP', cell: t => n(t.approved), year: n(yApp) },
    { label: 'REJ', cell: t => n(t.rejected), year: n(yRej) },
    { label: 'TOTAL', cell: t => n(t.total), year: n(yTot) },
    { label: '%APP', cell: t => fmtPct(t.rate), year: fmtPct(pct(yApp, yTot)), rate: true },
  ]
  if (basis === 'bags') {
    rows.push({ label: 'CONTAINERS', cell: t => fmtInt(t.containers ?? 0), year: fmtInt(yearContainers ?? 0) })
  }
  return (
    <View style={s.table} wrap={false}>
      <View style={s.head}>
        <Text style={s.label}>{basis === 'bags' ? 'MONTH · BAGS' : 'MONTH · CERTIFICATES'}</Text>
        {MONTH_LABELS.map(m => <Text key={m} style={s.th}>{m.toUpperCase()}</Text>)}
        <Text style={s.yearHead}>YEAR</Text>
      </View>
      {rows.map(r => (
        <View key={r.label} style={s.row}>
          <Text style={s.label}>{r.label}</Text>
          {totals.map(t =>
            t.total === 0 ? (
              <Text key={t.month} style={[s.cell, s.empty]}>·</Text>
            ) : (
              <Text key={t.month} style={r.rate ? [s.cell, { color: bandColors(rateBand(t.rate)).text, fontWeight: 600 }] : s.cell}>
                {r.cell(t)}
              </Text>
            ),
          )}
          <Text style={s.year}>{r.year}</Text>
        </View>
      ))}
    </View>
  )
}
