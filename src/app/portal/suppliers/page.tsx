'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { SellerDetail, SellerRow } from '@/lib/portal/supplier-review'
import type { ScopeTag } from '@/lib/portal/overview-model'
import { FLOW_STEPS } from '@/lib/portal/portal-facts'
import type { PortalPeriod } from '@/lib/portal/portal-period'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { usePortalFilters, searchWithFilters } from '@/lib/portal/use-portal-filters'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { FilterTags, PeriodSelect } from '@/components/portal/portal-filter-bar'
import { SellerDetailPanel } from '@/components/portal/suppliers/seller-detail'

interface SuppliersData { period: PortalPeriod; periods: PortalPeriod[]; sellers: SellerRow[]; detail: SellerDetail | null }
interface Key { companyId: string; periodKey: string | null; query: string }
interface Tagged<T> extends Key { value: T }

const th = 'px-1.5 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'
const rate = (n: number | null) => (n == null ? '—' : `${n}%`)

export default function PortalSuppliersPage() {
  const { fetch: portalFetch, company } = usePortal()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { filters, remove, query: filterQuery } = usePortalFilters()
  const periodKey = searchParams.get('period')
  // `seller` is the detail selection on this page, not a flow filter (see the route).
  const selected = searchParams.get('seller')
  const [loaded, setLoaded] = useState<Tagged<SuppliersData> | null>(null)
  const [failedFor, setFailedFor] = useState<Key | null>(null)
  const [deniedFor, setDeniedFor] = useState<Key | null>(null)
  const [lastPeriods, setLastPeriods] = useState<PortalPeriod[]>([])

  const query = filterQuery

  useEffect(() => {
    let active = true
    const companyId = company.id
    ;(async () => {
      try {
        const p = new URLSearchParams(query)
        if (periodKey) p.set('period', periodKey)
        const res = await portalFetch(`/api/portal/suppliers?${p.toString()}`)
        if (!active) return
        if (res.status === 403) { setDeniedFor({ companyId, periodKey, query }); return }
        setDeniedFor(null)
        if (!res.ok) { setFailedFor({ companyId, periodKey, query }); return }
        const d = (await res.json()) as SuppliersData
        if (!active) return
        setFailedFor(null)
        setLoaded({ companyId, periodKey, query, value: d })
        setLastPeriods(d.periods)
      } catch (e) {
        if (e instanceof PortalSessionEnded || !active) return
        setFailedFor({ companyId, periodKey, query })
      }
    })()
    return () => { active = false }
  }, [portalFetch, company.id, periodKey, query])

  const go = useCallback((params: URLSearchParams) => {
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname])

  const choosePeriod = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', key)
    go(params)
  }, [searchParams, go])

  const chooseSeller = useCallback((seller: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get('seller') === seller) params.delete('seller')
    else params.set('seller', seller)
    go(params)
  }, [searchParams, go])

  // Clear drops the flow filters but keeps the seller selection.
  const clear = useCallback(() => {
    go(searchWithFilters(new URLSearchParams(searchParams.toString()), selected ? { seller: selected } : {}))
  }, [searchParams, selected, go])

  // Remove keeps `seller` since the hook's filters include it and we never offer it as a tag.
  const tags: ScopeTag[] = FLOW_STEPS.flatMap(step =>
    step !== 'seller' && filters[step] ? [{ label: filters[step]!, step, removable: true }] : [])

  const same = (t: Key | null) => t != null && t.companyId === company.id && t.periodKey === periodKey && t.query === query
  const data = same(loaded) ? loaded!.value : null
  const periods = data?.periods ?? lastPeriods
  const sellers = useMemo(() => data?.sellers ?? [], [data])

  if (same(deniedFor)) return <PortalNotice>Suppliers are not part of your access.</PortalNotice>

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <h1 className="text-xl font-semibold">Suppliers</h1>
        <FilterTags tags={tags} hasFilters={tags.length > 0} onRemove={remove} onClear={clear} />
      </div>
      {periods.length > 0 && (
        <PeriodSelect periods={periods} periodKey={periodKey ?? data?.period.key ?? periods[0].key} onPeriod={choosePeriod} />
      )}
    </div>
  )

  let body
  if (same(failedFor)) {
    body = <PortalNotice>Could not load suppliers. Please refresh.</PortalNotice>
  } else if (!data) {
    body = <div className="text-sm text-black/40">Loading...</div>
  } else {
    body = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="overflow-x-auto rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-3">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>{['Seller', 'Certificates', 'Rejected', 'Approval rate', 'PSS', 'SS', 'MT on SS'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {sellers.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-[13px] text-black/40">No certificates in {data.period.label}</td></tr>
              ) : sellers.map(s => (
                <tr key={s.seller} aria-selected={s.seller === selected} onClick={() => chooseSeller(s.seller)}
                  className={`cursor-pointer hover:bg-black/[0.03] ${s.seller === selected ? 'bg-black/[0.05]' : ''}`}>
                  <td className={`${td} font-semibold`}>
                    <button type="button" aria-pressed={s.seller === selected}
                      onClick={e => { e.stopPropagation(); chooseSeller(s.seller) }}
                      className="text-left font-semibold hover:underline focus-visible:outline focus-visible:outline-1">{s.seller}</button>
                    {s.fewLots && <span className="ml-2 text-xs font-normal text-black/40">few lots</span>}
                  </td>
                  <td className={td}>{s.certificates}</td>
                  <td className={td}>{s.rejected}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-16 bg-black/5">
                        <span className="block h-2" style={{ width: `${s.approvalRate}%`, background: s.approvalRate >= 90 ? '#556b2f' : s.approvalRate >= 70 ? '#a9a454' : '#ef4444' }} />
                      </span>
                      {s.approvalRate}%
                    </div>
                  </td>
                  <td className={td}>{rate(s.pssRate)}</td>
                  <td className={td}>{rate(s.ssRate)}</td>
                  <td className={td}>{s.ssMt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {data.detail && <SellerDetailPanel detail={data.detail} periodLabel={data.period.label} />}
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="mt-[18px]">{body}</div>
    </div>
  )
}
