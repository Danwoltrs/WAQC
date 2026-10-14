'use client'
import { useEffect, useState } from 'react'
import type { PortalCertRow } from '@/lib/portal/portal-certificates'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'

export default function PortalCertificatesPage() {
  const { fetch: portalFetch, company } = usePortal()
  const [rows, setRows] = useState<PortalCertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setFailed(false)
      try {
        const res = await portalFetch('/api/portal/certificates')
        if (!active) return
        setDenied(res.status === 403)
        if (res.ok) {
          const d = await res.json()
          if (!active) return
          setRows(d.certificates ?? [])
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

  if (denied) return <PortalNotice>Certificates are not part of your access.</PortalNotice>
  if (failed) return <PortalNotice>Could not load certificates. Please refresh.</PortalNotice>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Certificates</h1>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Certificate #</th>
              <th className="px-5 py-3 font-medium">Sample</th>
              <th className="px-5 py-3 font-medium">Contract</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Issued</th>
              <th className="px-5 py-3 font-medium">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-500">No certificates found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium text-neutral-900">{r.certificateNumber}</td>
                <td className="px-5 py-3 text-neutral-600">{r.sample ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{r.contract ?? '—'}</td>
                <td className="px-5 py-3">
                  <span className={r.status === 'approved'
                    ? 'inline-block rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-medium text-[#22c55e]'
                    : 'inline-block rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-xs font-medium text-[#ef4444]'}>
                    {r.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </td>
                <td className="px-5 py-3 text-neutral-600">
                  {r.issuedDate ? new Date(r.issuedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td className="px-5 py-3">
                  <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-[#556b2f] hover:underline">Download</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
