import type { OverviewKpis, OverviewMetric } from '@/lib/portal/overview-model'

const RED = 'text-[#ef4444]'
const pctText = (p: number | null) => (p == null ? '—' : `${p}%`)

export function KpiRow({ kpis, metric }: { kpis: OverviewKpis; metric: OverviewMetric }) {
  const items: { value: string; label: string; bad: boolean }[] = [
    metric === 'mt'
      ? { value: kpis.mt.toFixed(1), label: 'MT on SS', bad: false }
      : { value: String(kpis.certificates), label: 'Certificates', bad: false },
    { value: String(kpis.approved), label: `Approved (${pctText(kpis.approvedPct)})`, bad: false },
    { value: String(kpis.rejected), label: 'Rejected', bad: kpis.rejected > 0 },
    { value: pctText(kpis.pssPct), label: 'PSS approved', bad: kpis.pssPct != null && kpis.pssPct < 80 },
    { value: pctText(kpis.ssPct), label: 'SS approved', bad: kpis.ssPct != null && kpis.ssPct < 80 },
  ]
  return (
    <div className="my-[18px] grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {items.map(k => (
        <div key={k.label} className="flex items-baseline gap-2 rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-3.5 py-2.5">
          <b className={`text-xl font-semibold tracking-[-0.01em] ${k.bad ? RED : ''}`}>{k.value}</b>
          <small className="text-xs text-black/40">{k.label}</small>
        </div>
      ))}
    </div>
  )
}
