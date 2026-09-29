'use client'

/**
 * The contracts behind a clicked KPI card, reason bar or combination bar:
 * every reason each certificate failed (worst first) and a link to it.
 */
import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reasonLabel } from '@/lib/reports/rejection-reasons'
import { reportDay } from '@/lib/reports/periods'
import type { DrillRow } from '@/lib/reports/rejection-analytics'

const PAGE = 100

interface Props {
  title: string
  rows: DrillRow[]
  onClose: () => void
}

const formatDay = (iso: string) => {
  const [y, m, d] = reportDay(iso).split('-')
  return `${d}/${m}/${y.slice(-2)}`
}

export function DrillDown({ title, rows, onClose }: Props) {
  const [limit, setLimit] = useState(PAGE)
  const visible = rows.slice(0, limit)
  return (
    <section className="rounded-lg border bg-card p-4 md:p-6" aria-live="polite">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'certificate' : 'certificates'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close list">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No certificates.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium md:px-2">Date</th>
                <th className="px-2 py-2 font-medium">Certificate</th>
                <th className="px-2 py-2 font-medium">Contract</th>
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-2 py-2 font-medium">Shipper</th>
                <th className="px-2 py-2 font-medium">Reasons failed</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums md:px-2">{formatDay(r.issuedAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <Link
                      href={`/certificates?q=${encodeURIComponent(r.certificateNumber)}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {r.certificateNumber}
                    </Link>
                    <span className="ml-1 text-xs uppercase text-muted-foreground">{r.sampleType}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {r.contract || r.buyerContract || '—'}
                    {r.contract && r.buyerContract && (
                      <div className="text-xs text-muted-foreground">{r.buyerContract}</div>
                    )}
                  </td>
                  <td className="px-2 py-2">{r.client || '—'}</td>
                  <td className="px-2 py-2">{r.shipper || '—'}</td>
                  <td className="px-2 py-2">
                    {r.isRejected ? (
                      <div className="flex flex-wrap gap-1">
                        {r.reasons.map((k, i) => (
                          <span
                            key={k}
                            className={
                              i === 0
                                ? 'rounded border border-[#ef4444]/40 bg-[#ef4444]/10 px-1.5 py-0.5 text-xs text-foreground'
                                : 'rounded border px-1.5 py-0.5 text-xs text-muted-foreground'
                            }
                            title={i === 0 ? 'Worst reason' : undefined}
                          >
                            {reasonLabel(k)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[#22c55e]">Approved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit(rows.length)}>
            Show all {rows.length}
          </Button>
        </div>
      )}
    </section>
  )
}
