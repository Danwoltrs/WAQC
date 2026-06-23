'use client'
import { useEffect, useState } from 'react'
import type { PortalCertRow } from '@/lib/portal/portal-certificates'

export default function PortalCertificatesPage() {
  const [rows, setRows] = useState<PortalCertRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/portal/certificates')
      .then((res) => (res.ok ? res.json() : { certificates: [] }))
      .then((body) => setRows(body.certificates ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Certificates</h1>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Certificate #</th>
              <th className="px-5 py-3 font-medium">Tracking #</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Issued</th>
              <th className="px-5 py-3 font-medium">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-neutral-500">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-neutral-500">
                  No certificates found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium text-neutral-900">{r.certificateNumber}</td>
                  <td className="px-5 py-3 text-neutral-600">{r.trackingNumber ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: r.status === 'approved' ? '#dcfce7' : '#fee2e2',
                        color: r.status === 'approved' ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {r.status === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {r.issuedDate
                      ? new Date(r.issuedDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {r.downloadUrl ? (
                      <a
                        href={r.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#556b2f] hover:underline"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
