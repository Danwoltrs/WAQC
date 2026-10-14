'use client'
import { useEffect, useState } from 'react'
import type { StatusRollup } from '@/lib/portal/portal-overview'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

interface RecentRow {
  id: string
  label: string
  status: string
  updatedAt: string | null
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
      <div className="text-3xl font-semibold text-neutral-900">{value}</div>
      <div className="mt-1 text-sm text-neutral-500">{label}</div>
    </div>
  )
}

export default function PortalOverviewPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rollup, setRollup] = useState<StatusRollup | null>(null)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setFailed(false)
      try {
        const res = await portalFetch('/api/portal/overview')
        if (!active) return
        if (!res.ok) {
          setFailed(true)
        } else {
          const d = await res.json()
          if (!active) return
          setRollup(d.rollup)
          setRecent(d.recent)
        }
      } catch (e) {
        if (e instanceof PortalSessionEnded || !active) return
        setFailed(true)
      }
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [portalFetch, company.id])

  if (loading) return <div className="text-sm text-neutral-500">Loading...</div>
  if (failed) return <PortalNotice>Could not load the overview. Please refresh.</PortalNotice>

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="PSS approved" value={rollup?.pssApproved ?? 0} />
        <StatCard label="PSS pending" value={rollup?.pssPending ?? 0} />
        <StatCard label="PSS rejected" value={rollup?.pssRejected ?? 0} />
        <StatCard label="Certified" value={rollup?.certified ?? 0} />
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
        <h2 className="mb-4 text-sm font-medium text-neutral-900">Recent approvals &amp; rejections</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-neutral-900">{r.label}</span>
                <span className={r.status === 'approved' ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                  {r.status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
