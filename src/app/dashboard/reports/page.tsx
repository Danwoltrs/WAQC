'use client'

/**
 * Reports landing page.
 *
 * MVP supports a single template (Weekly SS Certificates). Adding new report
 * variants is a future expansion — when there are 3+, switch this to a card
 * grid where each card opens its own form panel.
 *
 * The "Generate" button opens the PDF in a new tab via the streaming endpoint
 * at /api/reports/weekly-ss. No server-side persistence — every generation
 * runs fresh from the current DB state.
 */

import { useEffect, useState, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { FileText, Calendar, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function ReportsPage() {
  const { toast } = useToast()

  // Default the date range to the previous Mon-Fri (the legacy "weekly" report
  // is for the just-completed work week). Computed once on mount.
  const defaultDates = useMemo(() => getPreviousWorkWeek(), [])

  const [clients, setClients] = useState<SearchableSelectOption[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(defaultDates.start)
  const [endDate, setEndDate] = useState<string>(defaultDates.end)
  const [loadingClients, setLoadingClients] = useState(true)
  const [generating, setGenerating] = useState(false)

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

  const handleGenerate = () => {
    if (!clientId) {
      toast({ title: 'Pick a client', variant: 'destructive' })
      return
    }
    if (!startDate || !endDate) {
      toast({ title: 'Pick a date range', variant: 'destructive' })
      return
    }
    if (startDate >= endDate) {
      toast({ title: 'Start date must be before end date', variant: 'destructive' })
      return
    }

    setGenerating(true)
    // Open the PDF in a new tab. We use window.open immediately (synchronously
    // in the click handler) so Safari doesn't block it as a popup. The endpoint
    // streams the PDF inline so it'll render in the new tab.
    const params = new URLSearchParams({
      client_id: clientId,
      start_date: new Date(startDate).toISOString(),
      // End is exclusive — bump to the day after the picked end-date so the
      // selected end day is included in the [start, end) window.
      end_date: new Date(new Date(endDate).getTime() + 86400000).toISOString(),
    })
    const url = `/api/reports/weekly-ss?${params.toString()}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setGenerating(false)
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

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-sm font-semibold tracking-tight">Reports</h1>
          <p className="text-xs text-muted-foreground">
            Client-facing periodic reports. Generated on demand; no scheduled delivery yet.
          </p>
        </div>

        {/* Single report card. When we add more variants (15-day, monthly,
            annual) this becomes a grid of cards with one selected at a time. */}
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
            {/* Client */}
            <div>
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
            </div>

            {/* Date range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-2 block">Start date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs mb-2 block">End date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Presets */}
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

            {/* Generate */}
            <div className="flex justify-end pt-2 border-t border-border/50">
              <Button
                onClick={handleGenerate}
                disabled={generating || !clientId || !startDate || !endDate}
                className="bg-[#556b2f] hover:bg-[#556b2f]/90"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Generate PDF
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
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
