'use client'

/**
 * Lab activity summary — the internal per-lab digest, viewable here and
 * emailed on a schedule (see lib/reports/lab-activity-routes.ts). The same
 * report the cron sends: PSS approved / SS rejected / samples deleted per lab
 * (or the full split), and one row per deleted sample with the certificate
 * that existed before the deletion.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Calendar, Loader2, Mail, RefreshCw, Activity } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  periodLabel,
  previousPeriod,
  type LabActivityBreakdown,
  type LabActivityReport,
} from '@/lib/reports/lab-activity-data'
import { certificateBeforeDeletionLabel, labActivityColumns } from '@/lib/reports/lab-activity-email'

const BREAKDOWNS: Array<{ value: LabActivityBreakdown; label: string }> = [
  { value: 'pss_approved_ss_rejected', label: 'PSS approved / SS rejected' },
  { value: 'full', label: 'Both types, both outcomes' },
]

/** The date inputs are INCLUSIVE; the API's end is exclusive. */
function inclusiveToExclusive(end: string): string {
  const d = new Date(`${end}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
function exclusiveToInclusive(end: string): string {
  const d = new Date(`${end}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export default function LabActivityReportPage() {
  const { toast } = useToast()
  const lastWeek = useMemo(() => previousPeriod('weekly'), [])
  const [start, setStart] = useState(lastWeek.start)
  const [endInclusive, setEndInclusive] = useState(exclusiveToInclusive(lastWeek.end))
  const [breakdown, setBreakdown] = useState<LabActivityBreakdown>('pss_approved_ss_rejected')
  const [report, setReport] = useState<LabActivityReport | null>(null)
  const [recipient, setRecipient] = useState<string>('trading@wolthers.com')
  const [cadence, setCadence] = useState<string>('weekly')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!start || !endInclusive) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ start_date: start, end_date: inclusiveToExclusive(endInclusive), breakdown })
      const res = await fetch(`/api/reports/lab-activity?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load the report')
      setReport(body.report)
      if (body.recipient) setRecipient(body.recipient)
      if (body.cadence) setCadence(body.cadence)
    } catch (err) {
      toast({ title: 'Could not build the report', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [start, endInclusive, breakdown, toast])

  useEffect(() => { void load() }, [load])

  const applyPeriod = (p: { start: string; end: string }) => {
    setStart(p.start)
    setEndInclusive(exclusiveToInclusive(p.end))
  }

  const sendNow = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/reports/lab-activity/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: start, end_date: inclusiveToExclusive(endInclusive), breakdown }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Send failed')
      toast({ title: 'Report sent', description: `${body.subject} → ${(body.sent_to as string[]).join(', ')}${body.sandbox ? ' (sandbox)' : ''}` })
    } catch (err) {
      toast({ title: 'Send failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const columns = labActivityColumns(breakdown)

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="space-y-1">
          <h1 className="text-sm font-semibold tracking-tight">Lab activity summary</h1>
          <p className="text-xs text-muted-foreground">
            Per-lab approvals, rejections and deletions. Emailed {cadence} to {recipient}; the same report, on demand, here.
          </p>
        </div>

        <Card className="rounded-[20px]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-[#556b2f]" />
              </div>
              <div>
                <CardTitle className="text-sm">Period and breakdown</CardTitle>
                <CardDescription className="text-xs">Dates are inclusive. Deleted samples count by their deletion date; certificates by their issue date.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs mb-2 block">Start date</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs mb-2 block">End date</Label>
                <Input type="date" value={endInclusive} onChange={(e) => setEndInclusive(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs mb-2 block">Breakdown</Label>
                <div className="flex flex-wrap gap-2">
                  {BREAKDOWNS.map((b) => (
                    <Button
                      key={b.value}
                      type="button"
                      size="sm"
                      variant={breakdown === b.value ? 'default' : 'secondary'}
                      className={breakdown === b.value ? 'bg-[#556b2f] hover:bg-[#556b2f]/90' : ''}
                      onClick={() => setBreakdown(b.value)}
                    >
                      {b.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => applyPeriod(previousPeriod('weekly'))}>
                <Calendar className="w-3 h-3 mr-1" /> Last week (Mon–Sun)
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyPeriod(previousPeriod('monthly'))}>
                <Calendar className="w-3 h-3 mr-1" /> Last month
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <div className="flex-1" />
              <Button onClick={sendNow} disabled={sending || loading || !report} className="bg-[#556b2f] hover:bg-[#556b2f]/90">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Send to {recipient}
              </Button>
            </div>
          </CardContent>
        </Card>

        {report && (
          <>
            <Card className="rounded-[20px]">
              <CardHeader>
                <CardTitle className="text-sm">Per lab · {periodLabel(report.period)}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lab</TableHead>
                      {columns.map((c) => <TableHead key={c.key} className="text-right">{c.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.labs.map((lab) => (
                      <TableRow key={lab.labId ?? 'unassigned'}>
                        <TableCell>
                          {lab.labName}
                          {lab.country ? <span className="text-muted-foreground"> ({lab.country})</span> : null}
                        </TableCell>
                        {columns.map((c) => <TableCell key={c.key} className="text-right tabular-nums">{lab[c.key]}</TableCell>)}
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      {columns.map((c) => <TableCell key={c.key} className="text-right tabular-nums">{report.totals[c.key]}</TableCell>)}
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="rounded-[20px]">
              <CardHeader>
                <CardTitle className="text-sm">Deleted samples ({report.deleted.length})</CardTitle>
                <CardDescription className="text-xs">
                  The last column is the one that matters: a certificate that existed, and was sent, before the sample was deleted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {report.deleted.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No samples were deleted in this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lab</TableHead>
                        <TableHead>Sample ref</TableHead>
                        <TableHead>Contract ref</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Importer</TableHead>
                        <TableHead>Created by</TableHead>
                        <TableHead>Deleted by</TableHead>
                        <TableHead>Deleted at</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Certificate before deletion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.deleted.map((d) => (
                        <TableRow key={d.sampleId}>
                          <TableCell>{d.labName}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            {d.trackingNumber}
                            {d.sampleType ? <span className="ml-1 text-muted-foreground">{d.sampleType.toUpperCase()}</span> : null}
                          </TableCell>
                          <TableCell>{d.contractRef ?? '—'}</TableCell>
                          <TableCell>{d.seller ?? '—'}</TableCell>
                          <TableCell>{d.importer ?? '—'}</TableCell>
                          <TableCell>{d.createdBy ?? '—'}</TableCell>
                          <TableCell>{d.deletedBy ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmt(d.deletedAt)}</TableCell>
                          <TableCell>{d.deletedReason ?? '—'}</TableCell>
                          <TableCell className={d.certificate ? 'font-semibold text-red-700 dark:text-red-300' : ''}>
                            {certificateBeforeDeletionLabel(d)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  )
}
