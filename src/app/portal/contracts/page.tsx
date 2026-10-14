'use client'
import { useEffect, useState } from 'react'
import type { PortalContractRow } from '@/lib/portal/portal-contracts'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

export default function PortalContractsPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rows, setRows] = useState<PortalContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setFailed(false)
      try {
        const res = await portalFetch('/api/portal/contracts')
        if (!active) return
        setDenied(res.status === 403)
        if (res.ok) {
          const d = await res.json()
          if (!active) return
          setRows(d.contracts ?? [])
        } else {
          setRows([])
          if (res.status !== 403) setFailed(true)
        }
      } catch (e) {
        if (e instanceof PortalSessionEnded || !active) return
        setRows([])
        setFailed(true)
      }
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [portalFetch, company.id])

  if (denied) return <PortalNotice>Contracts are not part of your access.</PortalNotice>
  if (failed) return <PortalNotice>Could not load contracts. Please refresh.</PortalNotice>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Contracts</h1>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Origins</th>
              <th className="px-5 py-3 font-medium">Samples</th>
              <th className="px-5 py-3 font-medium">Approved</th>
              <th className="px-5 py-3 font-medium">Rejected</th>
              <th className="px-5 py-3 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No contracts found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.contractNumber} className="transition-colors hover:bg-neutral-50">
                <td className="px-5 py-3 font-medium text-neutral-900">{r.contractNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origins.join(', ') || '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.sampleCount}</td>
                <td className="px-5 py-3 font-medium text-[#22c55e]">{r.approved}</td>
                <td className="px-5 py-3 font-medium text-[#ef4444]">{r.rejected}</td>
                <td className="px-5 py-3 text-neutral-600">{r.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
