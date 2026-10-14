'use client'
import { useEffect, useState } from 'react'
import type { PortalSampleRow } from '@/lib/portal/portal-samples'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

export default function PortalSamplesPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rows, setRows] = useState<PortalSampleRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    const t = setTimeout(async () => {
      setLoading(true)
      setFailed(false)
      try {
        const res = await portalFetch(`/api/portal/samples${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        if (!active) return
        setDenied(res.status === 403)
        if (res.ok) {
          const d = await res.json()
          if (!active) return
          setRows(d.samples ?? [])
        } else {
          setRows([])
          if (res.status !== 403) setFailed(true)
        }
      } catch (e) {
        // session ended: portalFetch already sent the person to sign in
        if (e instanceof PortalSessionEnded || !active) return
        setRows([])
        setFailed(true)
      }
      if (active) setLoading(false)
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [q, portalFetch, company.id])

  if (denied) return <PortalNotice>Samples are not part of your access.</PortalNotice>
  if (failed) return <PortalNotice>Could not load samples. Please refresh.</PortalNotice>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Samples</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contract, container or sample number"
          className="w-80 rounded-full border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]"
        />
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Sample</th>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Origin</th>
              <th className="px-5 py-3 font-medium">Quality</th>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Certificate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-neutral-500">No samples found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-neutral-900">{r.label}</td>
                <td className="px-5 py-3 text-neutral-600">{r.contract ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origin ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.quality ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.stage ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.status ?? '—'}</td>
                <td className="px-5 py-3">
                  {r.certificateUrl
                    ? <a href={r.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-[#556b2f] hover:underline">View</a>
                    : <span className="text-neutral-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
