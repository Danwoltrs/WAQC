'use client'

/**
 * Reports landing page.
 *
 * Two report templates, each in its own card: Weekly SS Certificates and
 * Bi-Weekly Performance. They share one client picker; each card carries its
 * own date range (Weekly = Mon–Fri presets, Bi-Weekly = half-month presets).
 * Preview opens a single full-screen modal driven by the active card's
 * ReportKind. No server-side persistence — every generation runs fresh from
 * the current DB state.
 */

import { useEffect, useState, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { FileText, Calendar, Loader2, Eye } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  PreviewReportModal,
  WEEKLY_SS_KIND,
  BIWEEKLY_KIND,
  type ReportKind,
} from '@/components/reports/preview-report-modal'
import { firstHalf, secondHalf, previousHalfMonth } from '@/lib/reports/periods'

export default function ReportsPage() {
  const { toast } = useToast()

  // Default the date range to the previous Mon-Fri (the legacy "weekly" report
  // is for the just-completed work week). Computed once on mount.
  const defaultDates = useMemo(() => getPreviousWorkWeek(), [])
  // Bi-weekly defaults to the most recently completed half-month.
  const defaultBiweekly = useMemo(() => previousHalfMonth(new Date()), [])

  const [clients, setClients] = useState<SearchableSelectOption[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(defaultDates.start)
  const [endDate, setEndDate] = useState<string>(defaultDates.end)
  const [bwStart, setBwStart] = useState<string>(defaultBiweekly.start)
  const [bwEnd, setBwEnd] = useState<string>(defaultBiweekly.end)
  const [loadingClients, setLoadingClients] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeKind, setActiveKind] = useState<ReportKind | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadClients() {
      try {
        const res = await fetch('/api/clients?is_qc_client=true&limit=500')
        if (!res.ok) throw new Error('Failed to load clients')
        const json = await res.json()
        const opts: SearchableSelectOption[] = (json.clients || [])
          .map((c: any) => ({
            value: c.id,
            label: c.fantasy_name || c.company || c.name || c.id,
          }))
          .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
            a.label.localeCompare(b.label)
          )
        if (!cancelled) setClients(opts)
      } catch (err) {
        console.error(err)
        toast({
          title: 'Could not load clients',
          description: 'Please refresh and try again.',
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) setLoadingClients(false)
      }
    }
    loadClients()
    return () => {
      cancelled = true
    }
  }, [toast])

  // Validate the shared client + a card's date range, then open the preview
  // with that card's ReportKind.
  const openPreview = (kind: ReportKind, start: string, end: string) => {
    if (!clientId) {
      toast({ title: 'Pick a client', variant: 'destructive' })
      return
    }
    if (!start || !end) {
      toast({ title: 'Pick a date range', variant: 'destructive' })
      return
    }
    if (start > end) {
      toast({ title: 'Start date must be before end date', variant: 'destructive' })
      return
    }
    setActiveKind(kind)
    setPreviewOpen(true)
  }

  const presetThisWeek = () => {
    const { start, end } = getCurrentWorkWeek()
    setStartDate(start)
    setEndDate(end)
  }
  const presetLastWeek = () => {
    const { start, end } = getPreviousWorkWeek()
    setStartDate(start)
    setEndDate(end)
  }

  // Half-month presets operate on the month of the current bi-weekly start.
  const presetFirstHalf = () => {
    const d = new Date(bwStart)
    const h = firstHalf(d.getFullYear(), d.getMonth())
    setBwStart(h.start)
    setBwEnd(h.end)
  }
  const presetSecondHalf = () => {
    const d = new Date(bwStart)
    const h = secondHalf(d.getFullYear(), d.getMonth())
    setBwStart(h.start)
    setBwEnd(h.end)
  }

  const clientName = clients.find(c => c.value === clientId)?.label || 'Client'

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-sm font-semibold tracking-tight">Reports</h1>
          <p className="text-xs text-muted-foreground">
            Client-facing periodic reports. Generated on demand; no scheduled delivery yet.
          </p>
        </div>

        {/* Shared client picker — one selection drives both report cards. */}
        <Card className="rounded-[20px]">
          <CardContent className="pt-6">
            <Label className="text-xs mb-2 block">Client</Label>
            {loadingClients ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading clients…
              </div>
            ) : (
              <SearchableSelect
                options={clients}
                value={clientId}
                onValueChange={setClientId}
                placeholder="Select a QC client"
                searchPlaceholder="Search clients…"
                emptyMessage="No QC clients found"
              />
            )}
          </CardContent>
        </Card>

        {/* Report cards — each has its own date range + preview action. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Weekly SS Certificates */}
          <Card className="rounded-[20px]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-[#556b2f]" />
                </div>
                <div>
                  <CardTitle className="text-sm">Weekly SS Certificates</CardTitle>
                  <CardDescription className="text-xs">
                    List of all SS certificates issued in the selected week for one QC client.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-2 block">Start date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-2 block">End date</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={presetLastWeek}>
                  <Calendar className="w-3 h-3 mr-1" />
                  Last week (Mon–Fri)
                </Button>
                <Button variant="secondary" size="sm" onClick={presetThisWeek}>
                  <Calendar className="w-3 h-3 mr-1" />
                  This week (Mon–Fri)
                </Button>
              </div>

              <div className="flex justify-end pt-2 border-t border-border/50">
                <Button
                  onClick={() => openPreview(WEEKLY_SS_KIND, startDate, endDate)}
                  disabled={!clientId || !startDate || !endDate}
                  className="bg-[#556b2f] hover:bg-[#556b2f]/90"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview report
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bi-Weekly Performance */}
          <Card className="rounded-[20px]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-[#556b2f]" />
                </div>
                <div>
                  <CardTitle className="text-sm">Bi-Weekly Performance</CardTitle>
                  <CardDescription className="text-xs">
                    PSS + SS performance for one QC client over a ~15-day window — approvals,
                    rejections, and rejection reasons.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-2 block">Start date</Label>
                  <Input type="date" value={bwStart} onChange={e => setBwStart(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-2 block">End date</Label>
                  <Input type="date" value={bwEnd} onChange={e => setBwEnd(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={presetFirstHalf}>
                  <Calendar className="w-3 h-3 mr-1" />
                  1st half (1–15)
                </Button>
                <Button variant="secondary" size="sm" onClick={presetSecondHalf}>
                  <Calendar className="w-3 h-3 mr-1" />
                  2nd half (16–end)
                </Button>
              </div>

              <div className="flex justify-end pt-2 border-t border-border/50">
                <Button
                  onClick={() => openPreview(BIWEEKLY_KIND, bwStart, bwEnd)}
                  disabled={!clientId || !bwStart || !bwEnd}
                  className="bg-[#556b2f] hover:bg-[#556b2f]/90"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Single full-screen preview modal, fed by whichever card is active. */}
      {activeKind && clientId ? (
        <PreviewReportModal
          open={previewOpen}
          onOpenChange={(o) => { setPreviewOpen(o); if (!o) setActiveKind(null) }}
          kind={activeKind}
          clientId={clientId}
          clientName={clientName}
          startDate={activeKind.reportType === 'biweekly' ? bwStart : startDate}
          endDate={activeKind.reportType === 'biweekly' ? bwEnd : endDate}
        />
      ) : null}
    </MainLayout>
  )
}

// --- Date helpers ---
// Both helpers return YYYY-MM-DD strings (the format <input type="date">
// expects). "Work week" = Monday through Friday — the legacy weekly reports
// were always cut on Friday for the just-completed Mon–Fri block.

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getCurrentWorkWeek(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 1=Mon, ...
  // Monday = -(day-1) days from today, or +6 if Sunday
  const offsetToMonday = day === 0 ? -6 : -(day - 1)
  const monday = new Date(now)
  monday.setDate(now.getDate() + offsetToMonday)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return { start: toIsoDate(monday), end: toIsoDate(friday) }
}

function getPreviousWorkWeek(): { start: string; end: string } {
  const { start } = getCurrentWorkWeek()
  const thisMonday = new Date(start)
  const prevMonday = new Date(thisMonday)
  prevMonday.setDate(thisMonday.getDate() - 7)
  const prevFriday = new Date(prevMonday)
  prevFriday.setDate(prevMonday.getDate() + 4)
  return { start: toIsoDate(prevMonday), end: toIsoDate(prevFriday) }
}
