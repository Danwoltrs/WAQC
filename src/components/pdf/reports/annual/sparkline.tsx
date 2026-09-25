/** Twelve tiny columns (Jan..Dec) with month initials — the cover's MT-by-month line. */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { CHARCOAL, HAIR, MONTH_INITIALS, MUTED, TYPE } from './theme'

const s = StyleSheet.create({
  label: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 0.5, borderBottomColor: HAIR },
  initials: { flexDirection: 'row', marginTop: 2 },
  initial: { fontSize: 5.5, color: MUTED, textAlign: 'center' },
})

export function MonthSparkline({
  values,
  label,
  width = 168,
  height = 26,
}: {
  values: number[]
  label?: string
  width?: number
  height?: number
}) {
  const max = Math.max(0, ...values)
  const col = width / 12
  return (
    <View style={{ width }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.bars, { height }]}>
        {values.map((v, i) => (
          <View key={i} style={{ width: col, height, justifyContent: 'flex-end', alignItems: 'center' }}>
            {v > 0 && max > 0 ? (
              <View style={{ width: col * 0.55, height: Math.max(1, (v / max) * height), backgroundColor: CHARCOAL }} />
            ) : null}
          </View>
        ))}
      </View>
      <View style={s.initials}>
        {MONTH_INITIALS.map((m, i) => (
          <Text key={i} style={[s.initial, { width: col }]}>{m}</Text>
        ))}
      </View>
    </View>
  )
}
