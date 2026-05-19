/**
 * KPI card for PDF reports — hero stat with optional sub-label and a
 * delta indicator vs prior period.
 *
 * Used in the report's executive-summary strip. Same visual language as
 * the dashboard KPI cards (rounded corner, olive accent for positive),
 * but rendered with @react-pdf primitives.
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9F9FA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  label: {
    fontSize: 8,
    color: '#666',
    fontWeight: 600,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 18,
    fontWeight: 700,
    color: '#151618',
  },
  sublabel: {
    fontSize: 8,
    color: '#888',
    marginTop: 4,
  },
  deltaPositive: { color: '#556b2f' },
  deltaNegative: { color: '#ef4444' },
  deltaNeutral: { color: '#888' },
})

interface KpiCardProps {
  label: string
  value: string | number
  sublabel?: string
  /** Delta vs prior period — formatted by caller (e.g. "+3.2%" or "-12"). */
  delta?: string
  /** "positive" tints delta olive, "negative" tints red, else neutral gray. */
  deltaDir?: 'positive' | 'negative' | 'neutral'
  /** Optional accent color for the value text (e.g. red for rejection rate). */
  valueColor?: string
}

export function KpiCard({
  label,
  value,
  sublabel,
  delta,
  deltaDir = 'neutral',
  valueColor,
}: KpiCardProps) {
  const deltaStyle =
    deltaDir === 'positive' ? styles.deltaPositive
      : deltaDir === 'negative' ? styles.deltaNegative
      : styles.deltaNeutral

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={valueColor ? [styles.value, { color: valueColor }] : styles.value}>
          {typeof value === 'number' ? value.toLocaleString('en-US') : value}
        </Text>
        {delta ? (
          <Text style={[{ fontSize: 9, fontWeight: 600 }, deltaStyle]}>
            {delta}
          </Text>
        ) : null}
      </View>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  )
}
