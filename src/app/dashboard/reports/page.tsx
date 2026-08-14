'use client'

/**
 * Reports landing page.
 *
 * Four generator cards sharing one client picker: SS Report, PSS Report,
 * SS+PSS Report (each a PeriodReportCard with its own date range + the four
 * shared presets) and the Annual Performance Review. Preview opens a single
 * full-screen modal driven by the active card's ReportKind. No server-side
 * persistence — every generation runs fresh from the current DB state.
 */

import { useEffect, useState, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { FileText, Loader2, Eye } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  PreviewReportModal,
  WEEKLY_SS_KIND,
  PSS_KIND,
  BIWEEKLY_KIND,
  ANNUAL_KIND,
  type ReportKind,
} from '@/components/reports/preview-report-modal'
import { PeriodReportCard } from '@/components/reports/period-report-card'
import { previousHalfMonth, getPreviousWorkWeek } from '@/lib/reports/periods'

interface ActivePreview {
  kind: ReportKind
  start: string
  end: string
}

export default function ReportsPage() {
  const { toast } = useToast()

  // SS + PSS default to the previous Mon–Fri; SS+PSS to the last half-month.
  const defaultWeek = useMemo(() => getPreviousWorkWeek(), [])
  const defaultHalf = useMemo(() => previousHalfMonth(new Date()), [])

  const [clients, setClients] = useState<SearchableSelectOption[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [loadingClients, setLoadingClients] = useState(true)
  const [active, setActive] = useState<ActivePreview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [annualYear, setAnnualYear] = useState<number>(new Date().getFullYear() - 1)
  const [activeAnnualYear, setActiveAnnualYear] = useState<number>(new Date().getFullYear() - 1)

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

  const openPreview = (kind: ReportKind) => (start: string, end: string) => {
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
    setActive({ kind, start, end })
    setPreviewOpen(true)
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

        {/* Shared client picker — one selection drives all report cards.
            Sticky so the selected client stays visible while scrolling the
            cards below. */}
        <div className="sticky top-0 z-20 -mx-6 -mt-6 bg-background px-6 pb-2 pt-6">
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
        </div>

        {/* Report cards — three period reports + Annual. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PeriodReportCard
            title="SS Report"
            description="Shipment Sample performance — approvals, rejections, regions, and the full certificate list."
            defaultStart={defaultWeek.start}
            defaultEnd={defaultWeek.end}
            disabled={!clientId}
            onPreview={openPreview(WEEKLY_SS_KIND)}
          />
          <PeriodReportCard
            title="PSS Report"
            description="Pre-Shipment Sample performance — approvals, rejections, rejection reasons, and the full certificate list."
            defaultStart={defaultWeek.start}
            defaultEnd={defaultWeek.end}
            disabled={!clientId}
            onPreview={openPreview(PSS_KIND)}
          />
          <PeriodReportCard
            title="SS+PSS Report"
            description="Combined Pre-Shipment + Shipment Sample performance over the selected window."
            defaultStart={defaultHalf.start}
            defaultEnd={defaultHalf.end}
            disabled={!clientId}
            onPreview={openPreview(BIWEEKLY_KIND)}
          />

          {/* Annual Performance Review — unchanged flow. */}
          <Card className="rounded-[20px]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-[#556b2f]" />
                </div>
                <div>
                  <CardTitle className="text-sm">Annual Performance Review</CardTitle>
                  <CardDescription className="text-xs">
                    Full-year supplier performance, all labs and origins.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">Year</Label>
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-background"
                  value={annualYear}
                  onChange={(e) => setAnnualYear(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((d) => {
                    const y = new Date().getFullYear() - d
                    return <option key={y} value={y}>{y}</option>
                  })}
                </select>
              </div>

              <div className="flex justify-end pt-2 border-t border-border/50">
                <Button
                  onClick={() => {
                    if (!clientId) {
                      toast({ title: 'Pick a client', variant: 'destructive' })
                      return
                    }
                    setActive({ kind: ANNUAL_KIND, start: '', end: '' })
                    setActiveAnnualYear(annualYear)
                    setPreviewOpen(true)
                  }}
                  disabled={!clientId}
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
      {active && clientId ? (
        <PreviewReportModal
          open={previewOpen}
          onOpenChange={(o) => { setPreviewOpen(o); if (!o) setActive(null) }}
          kind={active.kind}
          clientId={clientId}
          clientName={clientName}
          startDate={active.start}
          endDate={active.end}
          year={active.kind.reportType === 'annual' ? activeAnnualYear : undefined}
        />
      ) : null}
    </MainLayout>
  )
}
