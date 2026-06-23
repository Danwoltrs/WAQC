'use client'
import { useEffect, useState } from 'react'
import type { PortalContractRow } from '@/lib/portal/portal-contracts'

export default function PortalContractsPage() {
  const [rows, setRows] = useState<PortalContractRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/portal/contracts')
      if (res.ok) setRows((await res.json()).contracts)
      setLoading(false)
    })()
  }, [])

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
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-neutral-500">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-neutral-500">
                  No contracts found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.contractNumber} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-neutral-900">{r.contractNumber}</td>
                  <td className="px-5 py-3 text-neutral-600">{r.origins.join(', ') || '—'}</td>
                  <td className="px-5 py-3 text-neutral-600">{r.sampleCount}</td>
                  <td className="px-5 py-3 font-medium" style={{ color: '#22c55e' }}>
                    {r.approved}
                  </td>
                  <td className="px-5 py-3 font-medium" style={{ color: '#ef4444' }}>
                    {r.rejected}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{r.pending}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
