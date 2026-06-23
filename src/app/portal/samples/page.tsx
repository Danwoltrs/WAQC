'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PortalSampleRow } from '@/lib/portal/portal-samples'

export default function PortalSamplesPage() {
  const [rows, setRows] = useState<PortalSampleRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/portal/samples${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      if (res.ok) setRows((await res.json()).samples)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Samples</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tracking number"
          className="w-64 rounded-full border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]"
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Tracking #</th>
              <th className="px-5 py-3 font-medium">Origin</th>
              <th className="px-5 py-3 font-medium">Quality</th>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Certificate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No samples found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-neutral-900">{r.trackingNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.origin ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.quality ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.stage ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.status ?? '—'}</td>
                <td className="px-5 py-3">
                  {r.certificateUrl
                    ? <Link href={r.certificateUrl} className="text-[#556b2f] hover:underline">View</Link>
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
