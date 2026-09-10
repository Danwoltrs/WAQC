// src/components/samples/container-history-hint.tsx
//
// "This container already has samples" — a HINT, never a block.
//
// A container number is an attribute, not an identifier. The same container
// legitimately carries:
//   * a resubmission — the first sample was rejected, the shipper reworked the
//     coffee while the container waited, and sent a new sample; and
//   * a reuse — the same container number comes back 1-3 years later on a
//     completely different shipment.
// Both are normal. So this component only ever SHOWS what is already there,
// with links, so the user can read the rejection history before deciding. It
// renders nothing at all when the container is new, it never disables a button,
// and it never reports an error — a failed lookup is silence.

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { History, XCircle, CheckCircle2 } from 'lucide-react'

export interface ContainerSampleRow {
  id: string
  tracking_number: string | null
  container_nr: string | null
  sample_type: string | null
  status: string | null
  workflow_stage: string | null
  created_at: string | null
  exporter_sample_number: string | null
  wolthers_contract_nr: string | null
  client_name: string | null
  certificate_number: string | null
}

const isRejected = (s: ContainerSampleRow) =>
  s.status === 'rejected' || s.workflow_stage === 'rejected'
const isApproved = (s: ContainerSampleRow) =>
  s.status === 'approved' || s.status === 'sent_to_clients' || s.workflow_stage === 'certified'

function whenLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface Props {
  containerNr: string
  /** The sample being edited, so it never lists itself. */
  excludeSampleId?: string | null
  className?: string
}

export function ContainerHistoryHint({ containerNr, excludeSampleId, className = '' }: Props) {
  const [rows, setRows] = useState<ContainerSampleRow[]>([])
  const [total, setTotal] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = containerNr.trim()
    // Clear FIRST, always. Keeping the previous container's rows on screen
    // through the debounce + round trip showed a list headed by a container
    // number the user had already typed over — briefly asserting that the
    // container now in the box had a history that belongs to another one.
    setRows([])
    setTotal(0)
    if (q.length < 4) return

    const controller = new AbortController()
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ container_nr: q })
        if (excludeSampleId) params.set('exclude', excludeSampleId)
        const res = await fetch(`/api/samples/by-container?${params}`, { signal: controller.signal })
        if (!res.ok) throw new Error('lookup failed')
        const body = await res.json()
        setRows(body.samples || [])
        setTotal(body.total ?? (body.samples || []).length)
      } catch {
        // A hint that cannot load is simply not shown. It must never turn into
        // an error the user has to dismiss before registering coffee.
        setRows([])
        setTotal(0)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
    }
  }, [containerNr, excludeSampleId])

  if (rows.length === 0) return null

  const rejected = rows.filter(isRejected).length

  return (
    <div
      className={`rounded-xl border border-border bg-muted/40 p-3 space-y-2 ${className}`}
      // Advisory, not an alert: announced politely, never focus-stealing.
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <History className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-xs">
          <span className="font-medium">
            {total} earlier sample{total === 1 ? '' : 's'} used container {rows[0].container_nr}
          </span>
          {rejected > 0 && (
            <span className="text-muted-foreground">
              {' '}· {rejected} rejected
            </span>
          )}
          <span className="text-muted-foreground">
            {' '}— that is expected for a resubmission or a container reused on a later shipment. Carry on.
          </span>
        </div>
      </div>

      <ul className="space-y-1 pl-5">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            {isRejected(s) ? (
              <XCircle className="h-3 w-3 shrink-0 text-[#ef4444]" />
            ) : isApproved(s) ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-[#22c55e]" />
            ) : (
              <span className="h-3 w-3 shrink-0" />
            )}
            <Link
              href={`/samples/qc?open=${s.id}`}
              target="_blank"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              {s.certificate_number || s.tracking_number || 'Sample'}
            </Link>
            <span className="text-muted-foreground truncate">
              {[
                s.client_name,
                s.wolthers_contract_nr ? `contract ${s.wolthers_contract_nr}` : null,
                s.exporter_sample_number ? `sample ${s.exporter_sample_number}` : null,
                whenLabel(s.created_at),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>

      {total > rows.length && (
        <p className="pl-5 text-[11px] text-muted-foreground">
          Showing the {rows.length} most recent of {total}.
        </p>
      )}
    </div>
  )
}
