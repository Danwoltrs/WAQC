'use client'
import { useEffect, useState } from 'react'
import type { StatusRollup } from '@/lib/portal/portal-overview'

interface RecentRow {
  id: string
  tracking_number: string
  origin: string | null
  status: string
  updated_at: string | null
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
  const [rollup, setRollup] = useState<StatusRollup | null>(null)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/portal/overview')
      if (res.ok) {
        const d = await res.json()
        setRollup(d.rollup)
        setRecent(d.recent)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="text-sm text-neutral-500">Loading...</div>

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="PSS approved" value={rollup?.pssApproved ?? 0} />
        <StatCard label="PSS pending" value={rollup?.pssPending ?? 0} />
        <StatCard label="PSS rejected" value={rollup?.pssRejected ?? 0} />
        <StatCard label="Certified" value={rollup?.certified ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
          <h2 className="mb-4 text-sm font-medium text-neutral-900">Recent approvals &amp; rejections</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">No decisions yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-neutral-900">{r.tracking_number}</span>
                  <span className={r.status === 'approved' ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100">
          <h2 className="mb-2 text-sm font-medium text-neutral-900">Shipments &amp; in-transit</h2>
          <p className="text-sm text-neutral-500">Shipment tracking is coming soon.</p>
        </div>
      </div>
    </div>
  )
}
