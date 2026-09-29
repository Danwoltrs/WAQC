'use client'

/**
 * Rejection analysis: why certificates were rejected, and in which
 * combinations. Shows EVERY reason each certificate failed — unlike the
 * weekly report, which counts only the worst reason per certificate. Both
 * classify through lib/reports/rejection-reasons.ts.
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/layout/main-layout'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/auth-provider'
import { supabase } from '@/lib/supabase'
import { reportDay, reportWindow } from '@/lib/reports/periods'
import { fetchAnalyticsCertificates } from '@/lib/reports/rejection-analytics-fetch'
import type { AnalyticsCertificate } from '@/lib/reports/rejection-analytics'
import { RejectionAnalysisView } from '@/components/metrics/rejections/rejection-analysis-view'

type Preset = 'month' | 'quarter' | 'ytd' | 'custom'

const today = () => reportDay(new Date().toISOString())

function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const to = today()
  const [y, m] = to.split('-').map(Number)
  if (p === 'month') return { from: `${y}-${String(m).padStart(2, '0')}-01`, to }
  if (p === 'quarter') {
    const d = new Date(Date.UTC(y, m - 1, 1))
    d.setUTCMonth(d.getUTCMonth() - 2)
    return { from: d.toISOString().slice(0, 10), to }
  }
  return { from: `${y}-01-01`, to }
}

const PRESETS: Array<{ key: Exclude<Preset, 'custom'>; label: string }> = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'ytd', label: 'Year to date' },
]

export default function RejectionAnalysisPage() {
  const { user, profile } = useAuth()
  const [preset, setPreset] = useState<Preset>('ytd')
  const [range, setRange] = useState(() => presetRange('ytd'))
  const [certs, setCerts] = useState<AnalyticsCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !profile || !range.from || !range.to || range.from > range.to) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const w = reportWindow(range.from, range.to)
    fetchAnalyticsCertificates(supabase as any, { start: w.start_date, end: w.end_date })
      .then(rows => { if (!cancelled) setCerts(rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load certificates') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, profile, range.from, range.to])

  return (
    <MainLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Rejection Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Every reason each rejected certificate failed, and the combinations they come in.
          </p>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? 'default' : 'outline'}
                onClick={() => { setPreset(p.key); setRange(presetRange(p.key)) }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="rej-from" className="text-xs">From</Label>
              <Input
                id="rej-from" type="date" className="w-[150px]" value={range.from} max={range.to}
                onChange={e => { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })) }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rej-to" className="text-xs">To</Label>
              <Input
                id="rej-to" type="date" className="w-[150px]" value={range.to} min={range.from}
                onChange={e => { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })) }}
              />
            </div>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground md:mb-2.5" />}
        </div>

        {error && (
          <p className="rounded-md border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-sm">{error}</p>
        )}

        <RejectionAnalysisView certs={certs} loading={loading} />
      </div>
    </MainLayout>
  )
}
