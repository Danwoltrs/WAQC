'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ClientSummaryResponse, LatestSample } from '@/lib/clients/client-summary'
import { MonthlyResultsChart, ResultLegend } from './client-charts'

/** The Samples tab: where open samples are, samples per month, and the latest seven. */
export function ClientSamplesSummary({ summary, error }: { summary: ClientSummaryResponse | null; error: string | null }) {
  if (error) return <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
  if (!summary) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[68px] rounded-[10px]" />
        <Skeleton className="h-[220px] rounded-[10px]" />
        <Skeleton className="h-[300px] rounded-[10px]" />
      </div>
    )
  }

  const { counts, monthly, latest, notSent, notSentWindowDays } = summary
  const decidedYear = monthly.reduce((n, m) => n + m.approved + m.withComments + m.rejected, 0)
  const yearCounts = monthly.reduce(
    (acc, m) => ({
      approved: acc.approved + m.approved + m.withComments,
      approvedWithComments: acc.approvedWithComments + m.withComments,
      rejected: acc.rejected + m.rejected,
    }),
    { approved: 0, approvedWithComments: 0, rejected: 0 },
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-border bg-border sm:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <Stage n={counts.received} label="Received" />
        <Stage n={counts.inProgress} label="In grading or cupping" />
        <Stage n={counts.underReview} label="Under review" />
        <Stage
          n={notSent ?? '–'}
          label={`Not sent yet, last ${notSentWindowDays} days`}
          hot={(notSent ?? 0) > 0}
        />
        <Stage n={decidedYear} label="Decided, last 12 months" />
      </div>

      <section className="rounded-[10px] border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-[14px] font-semibold">Samples per month</h3>
          <ResultLegend counts={yearCounts} />
        </div>
        <MonthlyResultsChart monthly={monthly} />
      </section>

      <section className="space-y-3">
        <h3 className="text-[14px] font-semibold">Latest samples</h3>
        {latest.length === 0 ? (
          <p className="rounded-[10px] border border-border py-10 text-center text-[13px] text-muted-foreground">
            No samples for this client yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  {['Certificate', 'Contract', 'Seller', 'Quality', 'Result', 'Sent', 'Date'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latest.map((s) => <LatestRow key={s.sampleId} s={s} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stage({ n, label, hot }: { n: number | string; label: string; hot?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className={cn('text-[20px] font-semibold leading-tight tabular-nums', hot && 'text-amber-600 dark:text-amber-300')}>{n}</div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </div>
  )
}

function LatestRow({ s }: { s: LatestSample }) {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50">
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12.5px]">
        <Link href={`/samples/qc?open=${s.sampleId}`} className="hover:underline">{s.label}</Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">{s.contract ?? '–'}</td>
      <td className="px-3 py-2.5">{s.seller ?? '–'}</td>
      <td className="px-3 py-2.5">{s.quality ?? s.origin ?? '–'}</td>
      <td className="whitespace-nowrap px-3 py-2.5"><ResultChip s={s} /></td>
      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
        {s.sent == null ? '–' : s.sent ? 'Sent' : <span className="text-amber-600 dark:text-amber-300">Not yet</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{format(new Date(s.createdAt), 'MMM d, yyyy')}</td>
    </tr>
  )
}

function ResultChip({ s }: { s: LatestSample }) {
  const [label, cls] =
    s.status === 'approved' && s.approvedWithComments
      ? ['Approved with comments', 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200']
      : s.status === 'approved'
        ? ['Approved', 'bg-[#e7f2ec] text-[#15663f] dark:bg-emerald-950/40 dark:text-emerald-300']
        : s.status === 'rejected'
          ? ['Rejected', 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300']
          : [STATUS_LABEL[s.status ?? ''] ?? 'In the lab', 'bg-muted text-muted-foreground']
  return <span className={cn('rounded-[4px] px-2 py-0.5 text-[12px] font-medium', cls)}>{label}</span>
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  in_progress: 'In progress',
  under_review: 'Under review',
}
