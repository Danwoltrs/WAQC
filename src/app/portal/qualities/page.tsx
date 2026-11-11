'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { QualityListRow } from '@/lib/portal/portal-qualities'
import type { PortalPeriod } from '@/lib/portal/portal-period'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { PeriodSelect } from '@/components/portal/portal-filter-bar'
import { OriginSummary, type OriginCard } from '@/components/portal/qualities/origin-summary'
import { QualitiesTable } from '@/components/portal/qualities/qualities-table'

interface QualitiesData { period: PortalPeriod; periods: PortalPeriod[]; origins: OriginCard[]; qualities: QualityListRow[] }
interface Key { companyId: string; periodKey: string | null }
interface Tagged<T> extends Key { value: T }

export default function PortalQualitiesPage() {
  const { fetch: portalFetch, company } = usePortal()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const periodKey = searchParams.get('period')
  const [loaded, setLoaded] = useState<Tagged<QualitiesData> | null>(null)
  const [failedFor, setFailedFor] = useState<Key | null>(null)
  const [deniedFor, setDeniedFor] = useState<Key | null>(null)
  const [lastPeriods, setLastPeriods] = useState<PortalPeriod[]>([])

  useEffect(() => {
    let active = true
    const companyId = company.id
    ;(async () => {
      try {
        const p = new URLSearchParams()
        if (periodKey) p.set('period', periodKey)
        const qs = p.toString()
        const res = await portalFetch(`/api/portal/qualities${qs ? `?${qs}` : ''}`)
        if (!active) return
        if (res.status === 403) { setDeniedFor({ companyId, periodKey }); return }
        setDeniedFor(null)
        if (!res.ok) { setFailedFor({ companyId, periodKey }); return }
        const d = (await res.json()) as QualitiesData
        if (!active) return
        setFailedFor(null)
        setLoaded({ companyId, periodKey, value: d })
        setLastPeriods(d.periods)
      } catch (e) {
        if (e instanceof PortalSessionEnded || !active) return
        setFailedFor({ companyId, periodKey })
      }
    })()
    return () => { active = false }
  }, [portalFetch, company.id, periodKey])

  const choosePeriod = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  const same = (t: Key | null) => t != null && t.companyId === company.id && t.periodKey === periodKey
  const data = same(loaded) ? loaded!.value : null
  const periods = data?.periods ?? lastPeriods

  if (same(deniedFor)) return <PortalNotice>Qualities are not part of your access.</PortalNotice>

  let body
  if (same(failedFor)) {
    body = <PortalNotice>Could not load qualities. Please refresh.</PortalNotice>
  } else if (!data) {
    body = <div className="text-sm text-black/40">Loading...</div>
  } else if (data.qualities.length === 0) {
    body = <div className="py-10 text-center text-[13px] text-black/40">No qualities are set up for this company yet.</div>
  } else {
    body = (
      <div className="space-y-4">
        <OriginSummary origins={data.origins} />
        <QualitiesTable qualities={data.qualities} companyId={company.id} carried={periodKey ? `period=${encodeURIComponent(periodKey)}` : ''} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Qualities</h1>
        {periods.length > 0 && (
          <PeriodSelect periods={periods} periodKey={periodKey ?? data?.period.key ?? periods[0].key} onPeriod={choosePeriod} />
        )}
      </div>
      <div className="mt-[18px]">{body}</div>
    </div>
  )
}
