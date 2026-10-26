'use client'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { SellerDetail } from '@/lib/portal/supplier-review'

const th = 'px-1.5 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'

function issued(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

const measuredText = (m: { value: string; limit: string | null }) => (m.limit ? `${m.value}, ${m.limit}` : m.value)

export function SellerDetailPanel({ detail, periodLabel }: { detail: SellerDetail; periodLabel: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(1, ...detail.topReasons.map(r => r.count))
  const keyOf = (r: SellerDetail['topReasons'][number]) => `${r.reason}|${r.name ?? ''}`

  return (
    <section className="rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] p-6">
      <h2 className="text-sm font-semibold">{detail.seller}</h2>
      <div className="mt-3 flex flex-wrap gap-8">
        {[
          ['Certificates', String(detail.row.certificates)],
          ['Rejected', String(detail.row.rejected)],
          ['Approval rate', `${detail.row.approvalRate}%`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-xl font-semibold">{value}</div>
            <div className="text-xs text-black/40">{label}</div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold">Main rejection reasons</h3>
      {detail.topReasons.length === 0 ? (
        <p className="mt-3 text-[13px] text-black/40">No rejections for {detail.seller} in {periodLabel}</p>
      ) : (
        <div className="mt-2">
          {detail.topReasons.map(r => {
            const k = keyOf(r)
            const isOpen = open === k
            return (
              <div key={k} className="border-b-[0.5px] border-black/10">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)}
                  className="flex w-full items-center gap-3 py-2 text-left text-[13px]">
                  <span className="w-1/2 truncate">{r.label}</span>
                  <span className="h-2 flex-1 bg-black/5">
                    <span className="block h-2 bg-[#ef4444]" style={{ width: `${(r.count / max) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right font-semibold">{r.count}</span>
                </button>
                {isOpen && (
                  <table className="mb-3 w-full border-collapse text-[13px]">
                    <thead><tr>{['Certificate / Contract', 'Issued', 'Measured vs limit'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {r.certificates.map(c => (
                        <tr key={c.id}>
                          <td className={`${td} font-semibold`}>{c.certificateNumber ?? c.contractRef ?? '—'}</td>
                          <td className={td}>{issued(c.issuedAt)}</td>
                          <td className={td}>
                            {c.measured.length === 0 ? '—' : c.measured.map((m, i) => (
                              <div key={i}><span className="text-black/40">{m.label}: </span>{measuredText(m)}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
          <p className="mt-3 text-xs text-black/40">Rejected for more than one reason: {detail.multiReason}</p>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold">Approval rate by month</h3>
      <div className="mt-2 h-[120px]">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={detail.monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} hide />
            <Tooltip formatter={(v) => [`${v}%`, 'Approval rate']} />
            <Line type="monotone" dataKey="approvalRate" stroke="#151618" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
