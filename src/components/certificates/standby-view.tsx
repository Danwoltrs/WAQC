'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { cleanContainerNumber } from '@/lib/pre-certificate'
import type { StandbyRow } from '@/lib/pre-certificate-list'
import { sampleTypeTag } from '@/lib/certificate-list'

/**
 * Pre-certificates waiting for their container. Each has its number already;
 * adding the container makes it final. Found by ICO number, shipper or
 * certificate number. The one that has waited longest is on top.
 */

export const STANDBY_BADGE = 'inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'

export function StandbyView() {
  const { toast } = useToast()
  const [rows, setRows] = useState<StandbyRow[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)
  const [readOnly, setReadOnly] = useState(false)
  const [target, setTarget] = useState<StandbyRow | null>(null)
  const [container, setContainer] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/certificates/standby${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load the standby list')
      setRows(data.certificates ?? [])
      setTotal(data.total ?? 0)
      setAvailable(data.available !== false)
      setReadOnly(data.lab_view?.read_only === true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the standby list')
    } finally {
      setLoading(false)
    }
  }, [])

  // Search as typed, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => void load(search), search ? 250 : 0)
    return () => clearTimeout(t)
  }, [search, load])

  const clean = cleanContainerNumber(container)

  const finalize = async () => {
    if (!target || !clean) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/certificates/${target.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container_nr: clean }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(data.error || 'Could not finalize the pre-certificate')
        return
      }
      toast({
        title: 'Certificate finalized',
        description: `${target.certificateNumber ?? 'The certificate'} is final, container ${clean}.`,
      })
      setRows((prev) => prev.filter((r) => r.id !== target.id))
      setTotal((n) => Math.max(0, n - 1))
      setTarget(null)
      setContainer('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/certificates"><ArrowLeft className="mr-2 h-4 w-4" />Certificates</Link>
        </Button>
        <h1 className="text-sm font-semibold">Standby</h1>
        <span className="text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${total} pre-certificate${total === 1 ? '' : 's'} waiting for a container`}
        </span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search by ICO number, shipper or certificate number"
            placeholder="ICO number, shipper or certificate number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-[320px] max-w-full rounded-[16px] pl-9"
          />
        </div>
      </div>

      {!available && (
        <p className="text-sm text-muted-foreground">Pre-certificates are not set up on the database yet.</p>
      )}
      {error && <p role="alert" className="text-sm text-[#ef4444]">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pre-certificate</th>
              <th className="px-3 py-2 font-medium">ICO number</th>
              <th className="px-3 py-2 font-medium">Shipper</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Quality</th>
              <th className="px-3 py-2 font-medium">Contract</th>
              <th className="px-3 py-2 font-medium">Waiting</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.certificateNumber ?? 'No number'}</span>
                    <span className={STANDBY_BADGE}>Standby</span>
                    {sampleTypeTag(r.sampleType) && <span className="text-muted-foreground">{sampleTypeTag(r.sampleType)}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono">{r.ico ?? '—'}</td>
                <td className="px-3 py-2">{r.shipper ?? '—'}</td>
                <td className="px-3 py-2">{r.client ?? '—'}</td>
                <td className="px-3 py-2">{r.quality ?? '—'}</td>
                <td className="px-3 py-2">{r.contract ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.daysWaiting === 0 ? 'Today' : `${r.daysWaiting} day${r.daysWaiting === 1 ? '' : 's'}`}
                </td>
                <td className="px-3 py-2 text-right">
                  {!readOnly && (
                    <Button size="sm" onClick={() => { setTarget(r); setContainer(''); setSaveError(null) }}>
                      Add container
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && !error && available && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim() ? 'No pre-certificate on standby matches that.' : 'Nothing is waiting on standby.'}
        </p>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !saving) setTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add container</DialogTitle>
            <DialogDescription>
              {target?.certificateNumber ?? 'This pre-certificate'} becomes the final certificate, with the same number.
              {target?.ico ? ` ICO ${target.ico}.` : ''} This cannot be undone from here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              aria-label="Container number"
              placeholder="Container number"
              autoFocus
              value={container}
              onChange={(e) => setContainer(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') void finalize() }}
            />
            {saveError && <p role="alert" className="text-xs text-[#ef4444]">{saveError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setTarget(null)}>Cancel</Button>
            <Button disabled={!clean || saving} onClick={() => void finalize()}>
              {saving ? 'Finalizing…' : 'Finalize certificate'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * The way to the Standby view from the Certificates page: shown only where
 * pre-certificates are in use (the laboratory has the check on, or something
 * is waiting), so a Brazil user never sees it.
 */
export function StandbyLink() {
  const [state, setState] = useState<{ total: number; show: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/certificates/standby')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setState({ total: d.total ?? 0, show: d.enabled === true || (d.total ?? 0) > 0 }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  if (!state?.show) return null
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/certificates/standby">
        Standby
        {state.total > 0 && <span className={`ml-2 ${STANDBY_BADGE}`}>{state.total}</span>}
      </Link>
    </Button>
  )
}
