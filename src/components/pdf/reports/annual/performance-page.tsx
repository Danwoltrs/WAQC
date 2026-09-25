/** One bucket's year: KPI strip, then shipper and seller tables side by side. */
import React from 'react'
import { View } from '@react-pdf/renderer'
import type { AnnualAggregates } from '@/lib/reports/annual-data'
import { AnnualPage } from './page-frame'
import { KpiStrip, type KpiItem } from './kpi-strip'
import { PerfTable, bucketPerfTotals, perfLines } from './perf-table'
import { fmtInt, fmtMt, fmtPct, pct } from './theme'

export const PERFORMANCE_TITLES = {
  pss: 'Pre-shipment (PSS) · by sample',
  ss: 'Shipment (SS) · by bags',
} as const

export function PerformancePage({
  sectionNumber,
  bucket,
  clientName,
  year,
  agg,
}: {
  sectionNumber: string
  bucket: 'pss' | 'ss'
  clientName: string
  year: number
  agg: AnnualAggregates
}) {
  const b = bucket === 'pss' ? agg.pss : agg.ss
  const basis = bucket === 'pss' ? 'count' : 'bags'
  const t = b.totals
  const containers = bucket === 'ss' ? agg.ssContainers : null
  const kpis: KpiItem[] = bucket === 'pss'
    ? [
        { label: 'Certificates', value: fmtInt(t.evaluated) },
        { label: 'Approved', value: fmtInt(t.approved) },
        { label: 'Rejected', value: fmtInt(t.rejected) },
        { label: 'Approval rate', value: fmtPct(pct(t.approved, t.evaluated)) },
        { label: 'MT approved', value: fmtMt(t.mtApproved) },
        { label: 'MT rejected', value: fmtMt(t.mtRejected) },
      ]
    : [
        { label: 'Bags approved', value: fmtInt(t.bagsApproved) },
        { label: 'MT approved', value: fmtMt(t.mtApproved) },
        { label: 'Containers', value: fmtInt(containers?.total ?? 0) },
        { label: 'Certificates', value: fmtInt(t.evaluated) },
        { label: 'Approval rate (bags)', value: fmtPct(pct(t.bagsApproved, t.bagsApproved + t.bagsRejected)) },
        { label: 'Bags rejected', value: fmtInt(t.bagsRejected) },
      ]
  const totals = bucketPerfTotals(t, basis, containers ? containers.total : null)
  const sellers = bucket === 'pss' ? agg.bySellerPss : agg.bySellerSs

  return (
    <AnnualPage sectionNumber={sectionNumber} title={PERFORMANCE_TITLES[bucket]} clientName={clientName} year={year}>
      <KpiStrip items={kpis} />
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
        <View style={{ flex: 1 }}>
          <PerfTable title="By shipper" lines={perfLines(b.byExporter, basis, containers?.byShipper ?? null)} totals={totals} basis={basis} />
        </View>
        <View style={{ flex: 1 }}>
          <PerfTable title="By seller" lines={perfLines(sellers, basis, containers?.bySeller ?? null)} totals={totals} basis={basis} />
        </View>
      </View>
    </AnnualPage>
  )
}
