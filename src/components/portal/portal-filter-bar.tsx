'use client'
import type { ScopeTag } from '@/lib/portal/overview-model'
import type { FlowStep } from '@/lib/portal/portal-facts'
import type { PortalPeriod } from '@/lib/portal/portal-period'

const CHIP = 'rounded-[4px] border-[0.5px] px-2 py-[3px] text-xs'

/** Scope tags (removable ones are flow filters) and the Clear link. Shared by every portal page header. */
export function FilterTags({ tags, hasFilters, onRemove, onClear }: {
  tags: ScopeTag[]
  hasFilters: boolean
  onRemove: (step: FlowStep) => void
  onClear: () => void
}) {
  return (
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
  )
}

export function PeriodSelect({ periods, periodKey, onPeriod }: {
  periods: PortalPeriod[]
  periodKey: string
  onPeriod: (key: string) => void
}) {
  return (
    <select aria-label="Period" value={periodKey} onChange={e => onPeriod(e.target.value)}
      className="rounded-[6px] border-[0.5px] border-black/10 bg-white px-3 py-1.5 text-xs">
      {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  )
}
