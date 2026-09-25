/** Inline approval bar + percentage, coloured by band (charcoal / grey / red). */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { bandColors, FILL, fmtPct, rateBand, TYPE } from './theme'

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  track: { height: 4, backgroundColor: FILL, borderRadius: 2, marginRight: 4 },
  fill: { height: 4, borderRadius: 2 },
  pct: { width: 24, textAlign: 'right', fontWeight: 600, fontSize: TYPE.table },
})

export function RateBar({ rate, width = 30 }: { rate: number; width?: number }) {
  const c = bandColors(rateBand(rate))
  const filled = (Math.max(0, Math.min(100, rate)) / 100) * width
  return (
    <View style={s.wrap}>
      <View style={[s.track, { width }]}>
        {filled > 0 ? <View style={[s.fill, { width: filled, backgroundColor: c.bar }]} /> : null}
      </View>
      <Text style={[s.pct, { color: c.text }]}>{fmtPct(rate)}</Text>
    </View>
  )
}
