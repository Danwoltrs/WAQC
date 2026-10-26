'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { PortalCertRow } from '@/lib/portal/portal-certificates'
import type { ScopeTag } from '@/lib/portal/overview-model'
import { FLOW_STEPS } from '@/lib/portal/portal-facts'
import type { PortalPeriod } from '@/lib/portal/portal-period'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { usePortalFilters } from '@/lib/portal/use-portal-filters'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { FilterTags, PeriodSelect } from '@/components/portal/portal-filter-bar'

interface CertData { period: PortalPeriod; periods: PortalPeriod[]; certificates: PortalCertRow[] }
interface Tagged<T> { companyId: string; periodKey: string | null; query: string; value: T }

const th = 'px-1.5 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'

function issued(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

export default function PortalCertificatesPage() {
  const { fetch: portalFetch, company } = usePortal()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { filters, remove, clear, query: filterQuery } = usePortalFilters()
  const periodKey = searchParams.get('period')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [loaded, setLoaded] = useState<Tagged<CertData> | null>(null)
  const [failedFor, setFailedFor] = useState<Omit<Tagged<null>, 'value'> | null>(null)
  const [denied, setDenied] = useState(false)
  const [lastPeriods, setLastPeriods] = useState<PortalPeriod[]>([])

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const p = new URLSearchParams(filterQuery)
    if (q) p.set('q', q)
    return p.toString()
  }, [filterQuery, q])

  useEffect(() => {
    let active = true
    const companyId = company.id
    ;(async () => {
      try {
        const p = new URLSearchParams(query)
        if (periodKey) p.set('period', periodKey)
        const qs = p.toString()
        const res = await portalFetch(`/api/portal/certificates${qs ? `?${qs}` : ''}`)
        if (!active) return
        if (res.status === 403) { setDenied(true); return }
        setDenied(false)
        if (!res.ok) { setFailedFor({ companyId, periodKey, query }); return }
        const d = (await res.json()) as CertData
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

  const choosePeriod = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', key)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  const same = (t: { companyId: string; periodKey: string | null; query: string } | null) =>
    t != null && t.companyId === company.id && t.periodKey === periodKey && t.query === query
  const data = same(loaded) ? loaded!.value : null
  const failed = same(failedFor)

  const tags: ScopeTag[] = FLOW_STEPS.flatMap(step => filters[step] ? [{ label: filters[step]!, step, removable: true }] : [])
  const hasFilters = tags.length > 0
  const periods = data?.periods ?? lastPeriods

  if (denied) return <PortalNotice>Certificates are not part of your access.</PortalNotice>

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <h1 className="text-xl font-semibold">Certificates</h1>
        <FilterTags tags={tags} hasFilters={hasFilters} onRemove={remove} onClear={clear} />
      </div>
      <div className="flex gap-2">
        <input type="search" aria-label="Search certificates" placeholder="Contract, certificate or container"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-64 rounded-[6px] border-[0.5px] border-black/10 bg-white px-3 py-1.5 text-xs" />
        {periods.length > 0 && (
          <PeriodSelect periods={periods} periodKey={periodKey ?? data?.period.key ?? periods[0].key} onPeriod={choosePeriod} />
        )}
      </div>
    </div>
  )

  let body
  if (failed) {
    body = <PortalNotice>Could not load certificates. Please refresh.</PortalNotice>
  } else if (!data) {
    body = <div className="text-sm text-black/40">Loading...</div>
  } else {
    const rows = data.certificates
    const empty = hasFilters || q ? 'No certificates match' : `No certificates in ${data.period.label}`
    body = (
      <section className="overflow-x-auto rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-3">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Certificate', 'Contract', 'Origin', 'Quality', 'Seller', 'Type', 'Crop', 'Status', 'Issued', 'Download'].map(h => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="py-10 text-center text-[13px] text-black/40">{empty}</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className={`${td} font-semibold`}>
                  {r.certificateNumber ?? <span className="font-normal text-black/40">{r.contract ?? '—'}</span>}
                </td>
                <td className={td}>{r.contract ?? '—'}</td>
                <td className={td}>{r.origin}</td>
                <td className={td}>{r.quality}</td>
                <td className={td}>{r.seller}</td>
                <td className={td}>{r.type}</td>
                <td className={td}>{r.crop ?? '—'}</td>
                <td className={td}>
                  <span className={r.status === 'approved'
                    ? 'inline-block rounded-[4px] bg-[#dcfce7] px-2 py-0.5 text-xs font-medium text-[#22c55e]'
                    : 'inline-block rounded-[4px] bg-[#fee2e2] px-2 py-0.5 text-xs font-medium text-[#ef4444]'}>
                    {r.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </td>
                <td className={td}>{issued(r.issuedDate)}</td>
                <td className={td}>
                  <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-[#556b2f] hover:underline">Download</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }

  return (
    <div>
      {header}
      <div className="mt-[18px]">{body}</div>
    </div>
  )
}
