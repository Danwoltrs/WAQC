import type { PortalVersionView } from '@/lib/portal/portal-qualities'
import { Button } from '@/components/ui/button'
import { formatCalendarDate } from './qualities-table'

function statusLabel(v: PortalVersionView): string {
  if (v.status === 'in_force') return 'In force'
  if (v.status === 'scheduled') return `Scheduled from ${formatCalendarDate(v.effectiveFrom)}`
  if (v.status === 'cancelled') return 'Cancelled'
  return 'Past'
}

/** The quality's versions, newest first. Cancel is offered on a scheduled version only, to a client who can edit. */
export function VersionsPanel({ versions, canEdit, onCancel }: {
  versions: PortalVersionView[]
  canEdit: boolean
  onCancel?: (versionId: string) => void
}) {
  const rows = [...versions].sort((a, b) => b.versionNo - a.versionNo)
  return (
    <section aria-label="Versions">
      <h2 className="text-sm font-semibold">Versions</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-black/40">No versions yet.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((v) => (
            <li key={v.id} data-testid="version-row" className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b-[0.5px] border-black/10 py-2.5 text-[13px] last:border-b-0">
              <span data-testid="version-no" className="w-8 shrink-0 font-semibold">{`v${v.versionNo}`}</span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-[4px] px-1.5 py-0.5 text-xs ${v.status === 'in_force' ? 'bg-black/10 font-medium' : 'bg-black/5'} ${v.status === 'cancelled' ? 'text-black/40' : ''}`}>
                    {statusLabel(v)}
                  </span>
                  {v.original ? (
                    <span className="text-xs text-black/40">Original specification</span>
                  ) : v.status !== 'scheduled' && (
                    <span className="text-xs text-black/40">{`From ${formatCalendarDate(v.effectiveFrom)}`}</span>
                  )}
                  <span className="text-xs text-black/40">{`Changed by ${v.changedBy}`}</span>
                </div>
                {v.note && <p className="text-black/70">{v.note}</p>}
                {v.status === 'cancelled' && v.cancelNote && <p className="text-black/40">{v.cancelNote}</p>}
              </div>
              {v.status === 'scheduled' && canEdit && onCancel && (
                <Button type="button" variant="outline" size="sm" className="rounded-[6px]" onClick={() => onCancel(v.id)}>
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
