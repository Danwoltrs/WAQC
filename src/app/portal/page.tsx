'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PortalSessionEnded, withCompany } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { PortalFlow } from '@/components/portal/portal-flow'
import { STEP_LABEL } from '@/components/portal/portal-ranking'
import { bandColor, DEFAULT_SANKEY_PALETTE } from '@/lib/charts/sankey-layout'
import { buildOverviewModel, matchFlowFilters, type LatestCert, type OverviewMetric, type PathRow } from '@/lib/portal/overview-model'
import type { PortalPeriod } from '@/lib/portal/portal-period'
import { usePortalFilters } from '@/lib/portal/use-portal-filters'
import { OverviewHeader } from '@/components/portal/overview/overview-header'
import { KpiRow } from '@/components/portal/overview/kpi-row'
import { QualitiesCard } from '@/components/portal/overview/qualities-card'
import { LatestCertificatesCard } from '@/components/portal/overview/latest-certificates-card'

interface OverviewData { period: PortalPeriod; periods: PortalPeriod[]; paths: PathRow[]; latest: LatestCert[] }

const LEGEND: [string, number][] = [['90% and up approved', 95], ['70–89%', 80], ['below 70%', 50]]

export default function PortalOverviewPage() {
  const { fetch: portalFetch, company } = usePortal()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { filters, toggle, remove, clear } = usePortalFilters()
  const [periodKey, setPeriodKey] = useState<string | null>(searchParams.get('period'))
  const [metric, setMetric] = useState<OverviewMetric>('certificates')
  const [data, setData] = useState<OverviewData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setFailed(false)
      try {
        const res = await portalFetch(`/api/portal/overview${periodKey ? `?period=${encodeURIComponent(periodKey)}` : ''}`)
        if (!active) return
        if (!res.ok) { setFailed(true); return }
        const d = (await res.json()) as OverviewData
        if (active) setData(d)
      } catch (e) {
        if (e instanceof PortalSessionEnded || !active) return
        setFailed(true)
      }
    })()
    return () => { active = false }
  }, [portalFetch, company.id, periodKey])

  const choosePeriod = useCallback((key: string) => {
    setPeriodKey(key)
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  const model = useMemo(() => buildOverviewModel(data?.paths ?? [], filters, metric), [data, filters, metric])
  const latest = useMemo(() => matchFlowFilters(data?.latest ?? [], filters).slice(0, 6), [data, filters])

  if (failed) return <PortalNotice>Could not load the overview. Please refresh.</PortalNotice>
  if (!data) return <div className="text-sm text-black/40">Loading...</div>

  const { flow } = model
  const unitText = metric === 'mt' ? 'MT on SS' : 'certificates'
  const title = flow.kind === 'ranking' ? `${STEP_LABEL[flow.step]} performance` : 'Where your coffee comes from'
  const sub = flow.kind === 'ranking'
    ? 'Approval rate on this selection, ranked by confidence (few lots rank lower)'
    : flow.kind === 'sankey'
      ? `${flow.steps.map(s => STEP_LABEL[s].toLowerCase()).join(' → ')}, sized by ${unitText}; colour = approval rate on that path. Click a bar to narrow the page to it.`
      : null

  return (
    <div>
      <OverviewHeader tags={model.tags} hasFilters={Object.keys(filters).length > 0} periods={data.periods}
        periodKey={periodKey ?? data.period.key} metric={metric}
        onRemove={remove} onClear={clear} onPeriod={choosePeriod} onMetric={setMetric} />
      <KpiRow kpis={model.kpis} metric={metric} />
      <section className="rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-5">
        <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-black/40">{sub}</p>}
          </div>
          <div className="flex items-center gap-3.5 text-xs text-black/60">
            {LEGEND.map(([text, rate]) => (
              <span key={text}>
                <i className="mr-[5px] inline-block h-2.5 w-2.5 rounded-[2px] align-[-1px]"
                  style={{ background: bandColor(rate, DEFAULT_SANKEY_PALETTE) }} />
                {text}
              </span>
            ))}
          </div>
        </div>
        {data.paths.length === 0
          ? <div className="py-10 text-center text-[13px] text-black/40">No certificates in {data.period.label}</div>
          : <PortalFlow flow={flow} unit={metric} onSelect={toggle} />}
      </section>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1.15fr_0.85fr]">
        <QualitiesCard rows={model.qualities} />
        <LatestCertificatesCard rows={latest} allHref={withCompany('/portal/certificates', company.id)} />
      </div>
    </div>
  )
}
