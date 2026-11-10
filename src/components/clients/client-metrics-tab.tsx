'use client'

import { useEffect, useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { approvalRate, type ClientSummaryResponse } from '@/lib/clients/client-summary'
import { formatCropYear, getCurrentCropYearStart } from '@/lib/crop-year'
import {
  LabelledBars, MonthlyResultsChart, ResultLegend, ResultSplitBar, RESULT_COLORS,
} from './client-page/client-charts'

interface SupplierMetric { name: string; total: number; approved: number; approvalRate: string }
interface DefectData {
  grading_defects: Array<{ name: string; count: number }>
  cupping_defects: Array<{ name: string; count: number }>
}

/**
 * Metrics tab. Every count comes from the client summary (all samples), so it
 * agrees with the rail. Sellers and defects are labelled bars with the figures
 * written out; the origin chart only appears once there is a second origin.
 */
export function ClientMetricsTab({ clientId, summary, error }: {
  clientId: string
  summary: ClientSummaryResponse | null
  error: string | null
}) {
  const cropYears = useMemo(() => {
    const start = getCurrentCropYearStart()
    return [start, start - 1, start - 2].map(formatCropYear)
  }, [])
  const [cropYear, setCropYear] = useState(cropYears[0])
  const [suppliers, setSuppliers] = useState<SupplierMetric[] | null>(null)
  const [defects, setDefects] = useState<DefectData | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/clients/${clientId}/supplier-metrics`)
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((d) => { if (live) setSuppliers(d.suppliers ?? []) })
      .catch(() => { if (live) setSuppliers([]) })
    return () => { live = false }
  }, [clientId])

  useEffect(() => {
    let live = true
    setDefects(null)
    fetch(`/api/clients/${clientId}/defect-summary?crop_year=${encodeURIComponent(cropYear)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setDefects(d ?? { grading_defects: [], cupping_defects: [] }) })
      .catch(() => { if (live) setDefects({ grading_defects: [], cupping_defects: [] }) })
    return () => { live = false }
  }, [clientId, cropYear])

  if (error) return <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
  if (!summary) return <Skeleton className="h-[480px] rounded-[10px]" />

  const { counts, monthly, origins } = summary
  const rate = approvalRate(counts)
  const topDefects = [
    ...(defects?.grading_defects ?? []),
    ...(defects?.cupping_defects ?? []),
  ].sort((a, b) => b.count - a.count).slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap overflow-hidden rounded-[10px] border border-border bg-card">
        <Kpi n={rate == null ? '–' : `${rate}%`} label="Approval rate" tone="good" />
        <Kpi n={counts.total} label="Samples" />
        <Kpi n={counts.approvedWithComments} label="Approved with comments" />
        <Kpi n={counts.rejected} label="Rejected" tone={counts.rejected > 0 ? 'bad' : undefined} />
        <Kpi n={counts.received + counts.inProgress + counts.underReview} label="In the lab now" />
      </div>

      <Card title="Result split" aside={`${counts.approved + counts.rejected} decided samples`}>
        <ResultSplitBar counts={counts} />
        <ResultLegend counts={counts} className="mt-3" />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Sellers" aside="samples · approved">
          {suppliers == null ? <Skeleton className="h-32" /> : (
            <LabelledBars
              color={RESULT_COLORS.approved}
              empty="No seller on any sample yet."
              rows={suppliers.map((s) => ({
                label: s.name,
                value: s.total,
                display: `${s.total} · ${Math.round(Number(s.approvalRate))}%`,
              }))}
            />
          )}
        </Card>
        <Card
          title="Top defects"
          aside={
            <Select value={cropYear} onValueChange={setCropYear}>
              <SelectTrigger className="h-7 w-[88px] rounded-[6px] text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {cropYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        >
          {defects == null ? <Skeleton className="h-32" /> : (
            <LabelledBars
              color="#445763"
              empty={`No defects recorded in crop year ${cropYear}.`}
              rows={topDefects.map((d) => ({ label: d.name, value: d.count, display: d.count.toLocaleString('en-US') }))}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Samples per month" aside="last 12 months">
          <MonthlyResultsChart monthly={monthly} />
        </Card>
        <Card title="Origins">
          {origins.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No origin recorded yet.</p>
          ) : origins.length === 1 ? (
            <>
              <p className="text-[13px]">
                All {origins[0].count} samples are from <span className="font-medium">{origins[0].origin}</span>.
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">A chart appears here once a second origin comes in.</p>
            </>
          ) : (
            <LabelledBars
              color={RESULT_COLORS.withComments}
              empty=""
              rows={origins.slice(0, 10).map((o) => ({ label: o.origin, value: o.count, display: String(o.count) }))}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {typeof aside === 'string' ? <span className="text-[12px] text-muted-foreground">{aside}</span> : aside}
      </div>
      {children}
    </section>
  )
}

function Kpi({ n, label, tone }: { n: number | string; label: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-[120px] border-l border-border px-5 py-3 first:border-l-0">
      <div className={cn(
        'text-[20px] font-semibold leading-tight tabular-nums',
        tone === 'good' && 'text-[#15663f] dark:text-emerald-400',
        tone === 'bad' && 'text-red-600 dark:text-red-400',
      )}>{n}</div>
      <div className="whitespace-nowrap text-[12px] text-muted-foreground">{label}</div>
    </div>
  )
}
