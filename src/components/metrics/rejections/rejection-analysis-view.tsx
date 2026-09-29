'use client'

/**
 * The rejection analysis body for a set of certificates: KPI cards, the
 * reasons chart, the combinations (UpSet) chart and the drill-down list. The
 * page owns the date range and the fetch.
 */
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  buildRejectionAnalytics,
  sameSelection,
  selectCertificates,
  selectionTitle,
  type AnalyticsCertificate,
  type Selection,
} from '@/lib/reports/rejection-analytics'
import { ReasonBars } from './reason-bars'
import { UpsetChart } from './upset-chart'
import { DrillDown } from './drill-down'

interface Props {
  certs: AnalyticsCertificate[]
  loading?: boolean
}

export function RejectionAnalysisView({ certs, loading = false }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null)
  // A new range is a new question; the old list no longer applies.
  useEffect(() => setSelection(null), [certs])

  const analytics = useMemo(() => buildRejectionAnalytics(certs), [certs])
  const drillRows = useMemo(
    () => (selection ? selectCertificates(analytics, selection) : []),
    [analytics, selection],
  )

  // Clicking the open selection again closes it.
  const toggle = (s: Selection) => setSelection(cur => (sameSelection(cur, s) ? null : s))

  const kpis: Array<{ sel: Selection; label: string; value: string; note: string }> = [
    { sel: { kind: 'analyzed' }, label: 'Certificates analyzed', value: analytics.analyzed.toLocaleString('en-US'), note: 'Issued in the range' },
    {
      sel: { kind: 'rejected' },
      label: 'Certificates rejected',
      value: analytics.rejected.toLocaleString('en-US'),
      note: `${analytics.rejectionRate}% of analyzed`,
    },
    {
      sel: { kind: 'multi' },
      label: 'Rejected for more than one reason',
      value: analytics.multiReason.toLocaleString('en-US'),
      note: analytics.rejected > 0
        ? `${Math.round((analytics.multiReason / analytics.rejected) * 100)}% of rejected`
        : 'None rejected',
    },
  ]

  return (
    <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {kpis.map(k => {
              const active = sameSelection(selection, k.sel)
              return (
                <button
                  key={k.label}
                  type="button"
                  onClick={() => toggle(k.sel)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border bg-card p-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'border-foreground/40 bg-muted/60',
                  )}
                >
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : k.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.note}</div>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <section className="rounded-lg border bg-card p-4 md:p-6 xl:col-span-2">
              <h2 className="mb-3 text-sm font-semibold">Reasons</h2>
              <ReasonBars
                reasons={analytics.reasons}
                rejected={analytics.rejected}
                selected={selection?.kind === 'reason' ? selection.reason : null}
                onSelect={reason => toggle({ kind: 'reason', reason })}
              />
            </section>

            <section className="rounded-lg border bg-card p-4 md:p-6 xl:col-span-3">
              <h2 className="text-sm font-semibold">Combinations</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Rejected certificates grouped by the exact set of reasons they failed. Each certificate is in one
                combination, so these add up to the {analytics.rejected} rejected.
              </p>
              <UpsetChart
                combinations={analytics.combinations}
                selected={selection?.kind === 'combination' ? selection.reasons : null}
                onSelect={reasons => toggle({ kind: 'combination', reasons })}
              />
            </section>
          </div>

          {selection && (
            <DrillDown
              key={JSON.stringify(selection)}
              title={selectionTitle(selection)}
              rows={drillRows}
              onClose={() => setSelection(null)}
            />
          )}
    </>
  )
}
