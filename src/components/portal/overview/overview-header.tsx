'use client'
import type { OverviewMetric, ScopeTag } from '@/lib/portal/overview-model'
import type { FlowStep } from '@/lib/portal/portal-facts'
import type { PortalPeriod } from '@/lib/portal/portal-period'

const CHIP = 'rounded-[4px] border-[0.5px] px-2 py-[3px] text-xs'

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
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => t.removable && t.step ? (
            <button key={`${t.step}:${t.label}`} type="button" title="Remove filter" onClick={() => onRemove(t.step!)}
              className={`${CHIP} cursor-pointer border-[#151618] bg-[#151618] text-white hover:opacity-85`}>
              {t.label} &times;
            </button>
          ) : (
            <span key={t.label} className={`${CHIP} border-black/10 bg-[#F9F9FA] text-black/60`}>{t.label}</span>
          ))}
          {hasFilters && (
            <button type="button" onClick={onClear} className="ml-0.5 self-center text-xs text-[#556b2f]">Clear</button>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <select aria-label="Period" value={periodKey} onChange={e => onPeriod(e.target.value)}
          className="rounded-[6px] border-[0.5px] border-black/10 bg-white px-3 py-1.5 text-xs">
          {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-[6px] border-[0.5px] border-black/10">
          {seg('certificates', 'Certificates')}
          {seg('mt', 'Quantity (MT)')}
        </div>
      </div>
    </div>
  )
}
