'use client'
import type { OverviewMetric, ScopeTag } from '@/lib/portal/overview-model'
import type { FlowStep } from '@/lib/portal/portal-facts'
import type { PortalPeriod } from '@/lib/portal/portal-period'
import { FilterTags, PeriodSelect } from '@/components/portal/portal-filter-bar'

/** Title row: heading, scope tags, period select and metric toggle. */
export function OverviewHeader({ tags, hasFilters, periods, periodKey, metric, onRemove, onClear, onPeriod, onMetric }: {
  tags: ScopeTag[]
  hasFilters: boolean
  periods: PortalPeriod[]
  periodKey: string
  metric: OverviewMetric
  onRemove: (step: FlowStep) => void
  onClear: () => void
  onPeriod: (key: string) => void
  onMetric: (metric: OverviewMetric) => void
}) {
  const seg = (m: OverviewMetric, label: string) => (
    <button type="button" aria-pressed={metric === m} onClick={() => onMetric(m)}
      className={`px-3 py-1.5 text-xs ${metric === m ? 'bg-black/[0.04] font-medium text-black' : 'text-black/60'}`}>
      {label}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <h1 className="text-xl font-semibold">Overview</h1>
        <FilterTags tags={tags} hasFilters={hasFilters} onRemove={onRemove} onClear={onClear} />
      </div>
      <div className="flex gap-2">
        <PeriodSelect periods={periods} periodKey={periodKey} onPeriod={onPeriod} />
        <div className="flex overflow-hidden rounded-[6px] border-[0.5px] border-black/10">
          {seg('certificates', 'Certificates')}
          {seg('mt', 'Quantity (MT)')}
        </div>
      </div>
    </div>
  )
}
