/**
 * Company × month grid. PSS cells read approved/total certificates, SS cells
 * approved bags. The norm (≥90%) is plain charcoal; 70–89% gets a grey fill;
 * under 70% a light red fill with red text; a month without certificates a dot.
 */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { MONTH_LABELS, type MonthCell, type MonthlyGrid } from '@/lib/reports/annual-monthly'
import { bandColors, FILL, fmtInt, HAIR, MONTH_GRID, MONTH_GRID_WIDTH, MUTED, rateBand, TYPE, truncate } from './theme'

const NAME_MAX = 30

const s = StyleSheet.create({
  wrap: { width: MONTH_GRID_WIDTH, marginTop: 10 },
  title: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  head: { flexDirection: 'row', backgroundColor: FILL, paddingVertical: 2 },
  th: { width: MONTH_GRID.month, fontSize: TYPE.tableHead, color: MUTED, textAlign: 'center', letterSpacing: 0.4 },
  thName: { width: MONTH_GRID.name, fontSize: TYPE.tableHead, color: MUTED, letterSpacing: 0.4, paddingLeft: 4 },
  thYear: { width: MONTH_GRID.year, fontSize: TYPE.tableHead, color: MUTED, textAlign: 'right', paddingRight: 4, letterSpacing: 0.4 },
  // Ruling M1: height 10 left too little room for a 7.5pt Inter line — react-pdf
  // silently dropped every month cell's text in the laid-out PDF (tests that walk
  // the element tree never caught it). 11 was verified in a scratch render.
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: HAIR, height: 11 },
  // Ruling M6: belt-and-braces on top of truncate() — a legal name with no
  // fantasy name must never wrap onto a second line and grow the row.
  name: { width: MONTH_GRID.name, fontSize: 7.5, paddingLeft: 4, maxLines: 1, textOverflow: 'ellipsis' },
  cellBox: { width: MONTH_GRID.month, paddingHorizontal: 2 },
  cellFill: { borderRadius: 2, paddingVertical: 0.5 },
  cellText: { fontSize: 7.5, textAlign: 'center' },
  empty: { width: MONTH_GRID.month, fontSize: 7.5, textAlign: 'center', color: HAIR },
  year: { width: MONTH_GRID.year, fontSize: 7.5, textAlign: 'right', paddingRight: 4, fontWeight: 600 },
})

function Cell({ cell, text }: { cell: MonthCell | null; text: string }) {
  if (!cell) return <Text style={s.empty}>·</Text>
  const c = bandColors(rateBand(cell.rate))
  return (
    <View style={s.cellBox}>
      <View style={c.cellFill ? [s.cellFill, { backgroundColor: c.cellFill }] : s.cellFill}>
        <Text style={[s.cellText, { color: c.text }]}>{text}</Text>
      </View>
    </View>
  )
}

export function HeatGrid({ title, grid }: { title: string; grid: MonthlyGrid }) {
  const rows = grid.others ? [...grid.rows, grid.others] : grid.rows
  if (rows.length === 0) return null
  const value = (c: MonthCell) => (grid.basis === 'bags' ? fmtInt(c.approved) : `${c.approved}/${c.total}`)
  return (
    <View style={s.wrap} wrap={false}>
      <Text style={s.title}>{title}</Text>
      <View style={s.head}>
        <Text style={s.thName}>{grid.basis === 'bags' ? 'APPROVED BAGS' : 'APPROVED / TOTAL'}</Text>
        {MONTH_LABELS.map(m => <Text key={m} style={s.th}>{m.toUpperCase()}</Text>)}
        <Text style={s.thYear}>YEAR</Text>
      </View>
      {rows.map(r => (
        <View key={r.name} style={s.row}>
          <Text style={s.name}>{truncate(r.name, NAME_MAX)}</Text>
          {r.cells.map((c, i) => <Cell key={i} cell={c} text={c ? value(c) : ''} />)}
          <Text style={[s.year, { color: bandColors(rateBand(r.year.rate)).text }]}>
            {`${value(r.year)} · ${r.year.rate}%`}
          </Text>
        </View>
      ))}
    </View>
  )
}
