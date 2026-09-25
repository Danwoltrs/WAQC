/** Leaderboard rank: gold / silver / bronze circles for 1–3 (the app's leaderboard colours), a plain number after. */
import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { BRONZE, GOLD, MUTED, SILVER, TYPE, WHITE } from './theme'

const MEDALS = [GOLD, SILVER, BRONZE]

const s = StyleSheet.create({
  circle: { width: 11, height: 11, borderRadius: 5.5, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 6, fontWeight: 700, color: WHITE },
  plain: { width: 11, textAlign: 'center', fontSize: TYPE.table, color: MUTED },
})

export function RankBadge({ rank }: { rank: number }) {
  const medal = rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : null
  if (!medal) return <Text style={s.plain}>{String(rank)}</Text>
  return (
    <View style={[s.circle, { backgroundColor: medal }]}>
      <Text style={s.num}>{String(rank)}</Text>
    </View>
  )
}
