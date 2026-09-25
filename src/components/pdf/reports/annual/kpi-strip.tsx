/** A row of 16 pt figures with uppercase captions, separated by hairlines rather than boxes. */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { CHARCOAL, HAIR, MUTED, TYPE } from './theme'

export interface KpiItem { label: string; value: string }

const s = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: HAIR,
    borderBottomWidth: 0.5, borderBottomColor: HAIR,
    paddingVertical: 8,
  },
  item: { flex: 1, paddingHorizontal: 10 },
  divider: { borderLeftWidth: 0.5, borderLeftColor: HAIR },
  value: { fontSize: TYPE.kpi, fontWeight: 600, color: CHARCOAL },
  label: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 3 },
})

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <View style={s.strip} wrap={false}>
      {items.map((it, i) => (
        <View key={it.label} style={i === 0 ? s.item : [s.item, s.divider]}>
          <Text style={s.value}>{it.value}</Text>
          <Text style={s.label}>{it.label}</Text>
        </View>
      ))}
    </View>
  )
}
