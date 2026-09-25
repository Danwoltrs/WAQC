/** A bucket's months: chart, month totals (printed once), shipper grid, seller grid; chain grids continue on their own page. */
import React from 'react'
import { Text, StyleSheet } from '@react-pdf/renderer'
import type { MonthlySection } from '@/lib/reports/annual-data'
import type { MonthlyGrid } from '@/lib/reports/annual-monthly'
import { AnnualPage } from './page-frame'
import { MonthlyColumns, MonthTotalsTable } from './monthly-columns'
import { HeatGrid } from './heat-grid'
import { MUTED, TYPE } from './theme'

export const MONTHLY_TITLES = {
  pss: 'Pre-shipment (PSS) · month by month',
  ss: 'Shipment (SS) · month by month',
} as const

const s = StyleSheet.create({
  label: { fontSize: TYPE.label, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  legend: { fontSize: TYPE.label, color: MUTED, marginTop: 8 },
})

const LEGEND =
  'Shading by approval rate: 90% and above plain · 70–89% grey · under 70% red · a dot marks a month without certificates.'

export function MonthlyPage({
  sectionNumber,
  bucket,
  clientName,
  year,
  section,
  yearContainers,
}: {
  sectionNumber: string
  bucket: 'pss' | 'ss'
  clientName: string
  year: number
  section: MonthlySection
  yearContainers: number | null
}) {
  const basis = bucket === 'pss' ? 'count' : 'bags'
  return (
    <AnnualPage sectionNumber={sectionNumber} title={MONTHLY_TITLES[bucket]} clientName={clientName} year={year}>
      <Text style={s.label}>{basis === 'bags' ? 'Bags approved and rejected by month' : 'Certificates approved and rejected by month'}</Text>
      <MonthlyColumns totals={section.totals} />
      <MonthTotalsTable totals={section.totals} basis={basis} yearContainers={yearContainers} />
      <HeatGrid title="By shipper" grid={section.byShipper} />
      <HeatGrid title="By seller" grid={section.bySeller} />
      <Text style={s.legend}>{LEGEND}</Text>
    </AnnualPage>
  )
}

export function MonthlyChainPage({
  sectionNumber,
  bucket,
  clientName,
  year,
  grids,
}: {
  sectionNumber: string
  bucket: 'pss' | 'ss'
  clientName: string
  year: number
  grids: Array<{ title: string; grid: MonthlyGrid }>
}) {
  return (
    <AnnualPage sectionNumber={sectionNumber} title={`${MONTHLY_TITLES[bucket]} (continued)`} clientName={clientName} year={year}>
      {grids.map(g => <HeatGrid key={g.title} title={g.title} grid={g.grid} />)}
      <Text style={s.legend}>{LEGEND}</Text>
    </AnnualPage>
  )
}
