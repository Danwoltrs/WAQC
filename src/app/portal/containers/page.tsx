'use client'
import { useEffect, useMemo, useState } from 'react'
import type { PortalContainerRow } from '@/lib/portal/portal-containers'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

interface Tagged<T> { companyId: string; query: string; value: T }

const th = 'px-1.5 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10 align-top'
const HEADERS = ['Container', 'Seal', 'Certificate(s)', 'Contract', 'Quality', 'Seller', 'Vessel / voyage', 'BL', 'ETD', 'ETA', 'Status']

function day(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function DateCell({ iso, actual }: { iso: string | null; actual: boolean }) {
  if (!iso) return <>—</>
  return actual ? <>{day(iso)}</> : <span className="text-black/40">{day(iso)} (planned)</span>
}

export default function PortalContainersPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [loaded, setLoaded] = useState<Tagged<PortalContainerRow[]> | null>(null)
  const [failedFor, setFailedFor] = useState<Omit<Tagged<null>, 'value'> | null>(null)
  const [deniedFor, setDeniedFor] = useState<Omit<Tagged<null>, 'value'> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => (q ? new URLSearchParams({ q }).toString() : ''), [q])

  useEffect(() => {
    let active = true
    const companyId = company.id
    ;(async () => {
      try {
        const res = await portalFetch(`/api/portal/containers${query ? `?${query}` : ''}`)
        if (!active) return
        if (res.status === 403) { setDeniedFor({ companyId, query }); return }
        setDeniedFor(null)
        if (!res.ok) { setFailedFor({ companyId, query }); return }
        const d = (await res.json()) as { containers: PortalContainerRow[] }
        if (!active) return
        setFailedFor(null)
        setLoaded({ companyId, query, value: d.containers })
      } catch (e) {
        if (e instanceof PortalSessionEnded || !active) return
        setFailedFor({ companyId, query })
      }
    })()
    return () => { active = false }
  }, [portalFetch, company.id, query])

  const same = (t: { companyId: string; query: string } | null) => t != null && t.companyId === company.id && t.query === query
  const rows = same(loaded) ? loaded!.value : null
  const failed = same(failedFor)
  const denied = same(deniedFor)

  if (denied) return <PortalNotice>Containers are not part of your access.</PortalNotice>

  let body
  if (failed) {
    body = <PortalNotice>Could not load containers. Please refresh.</PortalNotice>
  } else if (!rows) {
    body = <div className="text-sm text-black/40">Loading...</div>
  } else {
    body = (
      <section className="overflow-x-auto rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-3">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr>{HEADERS.map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={HEADERS.length} className="py-10 text-center text-[13px] text-black/40">
                {q ? 'No containers match' : 'No containers linked to your contracts yet.'}
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={`${r.containerNr}:${i}`}>
                <td className={`${td} font-semibold`}>{r.containerNr}</td>
                <td className={td}>{r.seal ?? '—'}</td>
                <td className={td}>{r.certificates.length ? r.certificates.join(', ') : '—'}</td>
                <td className={td}>{r.contractRefs.length ? r.contractRefs.join(', ') : '—'}</td>
                <td className={td}>{r.quality ?? '—'}</td>
                <td className={td}>{r.seller ?? '—'}</td>
                <td className={td}>{r.vessel ? `${r.vessel}${r.voyage ? ` / ${r.voyage}` : ''}` : '—'}</td>
                <td className={td}>{r.bl ?? '—'}</td>
                <td className={td}><DateCell iso={r.etd} actual={r.etdActual} /></td>
                <td className={td}><DateCell iso={r.eta} actual={r.etaActual} /></td>
                <td className={td}>{r.milestone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Containers</h1>
        <input type="search" aria-label="Search containers" placeholder="Container, contract, certificate, vessel or BL"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-72 rounded-[6px] border-[0.5px] border-black/10 bg-white px-3 py-1.5 text-xs" />
      </div>
      <div className="mt-[18px]">{body}</div>
    </div>
  )
}
