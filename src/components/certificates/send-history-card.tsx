'use client'

import type { SendHistoryEntry } from '@/lib/approval-notification/send-history'

/** "12 Nov 2026, 14:30" in the viewer's own time zone. */
function when(iso: string | null): string {
  if (!iso) return 'Date unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Date unknown'
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * The earlier sends of this email's certificates to the same party: when, by
 * whom, to which addresses. Shown above the cover note so that sending again is
 * a decision, not an accident. Renders nothing when there are none.
 */
export function SendHistoryCard({ history, total }: { history?: SendHistoryEntry[]; total: number }) {
  if (!history || history.length === 0) return null
  return (
    <div
      role="region"
      aria-label="Sent before"
      className="rounded-[10px] border border-[#b07946]/50 bg-[#efe4d4]/40 p-4 dark:bg-[#b07946]/10"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
        Sent before · {history.length} time{history.length === 1 ? '' : 's'}
      </div>
      <ul className="space-y-2 text-sm">
        {history.map((h, i) => (
          <li key={`${h.sentAt}-${i}`}>
            <div>
              <span className="font-medium">{when(h.sentAt)}</span>
              <span className="opacity-70"> · {h.sentBy || 'Sender unknown'}</span>
              {total > 1 && (
                <span className="opacity-70">
                  {' '}· {h.sampleIds.length} of {total} certificates
                </span>
              )}
              {h.sandbox && <span className="opacity-70"> · test send</span>}
            </div>
            <div className="break-words text-xs opacity-70">
              To {h.to.length > 0 ? h.to.join(', ') : 'no address recorded'}
              {h.cc.length > 0 ? ` · CC ${h.cc.join(', ')}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
