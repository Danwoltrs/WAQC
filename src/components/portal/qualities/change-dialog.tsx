'use client'

/**
 * The portal's two spec-change dialogs: saving the working copy as a new
 * version (now or from a date), and confirming the cancel of a scheduled one.
 */

import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { diffSpecParameters, removedCuppingAttributes } from '@/lib/quality-spec/spec-diff'
import { PortalSessionEnded } from '@/lib/portal/portal-fetch'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatCalendarDate } from './qualities-table'

type PortalFetch = (path: string, init?: RequestInit) => Promise<Response>

const SAVE_FAILED = 'Could not save the change. Please try again.'
const CANCEL_FAILED = 'Could not cancel the change. Please try again.'

/** Tomorrow on the local calendar, as YYYY-MM-DD: the earliest date a scheduled change can start. */
const tomorrowYmd = () => format(addDays(new Date(), 1), 'yyyy-MM-dd')

/** The server's own words on 400/409, a generic line otherwise. */
async function errorText(res: Response, fallback: string): Promise<string> {
  if (res.status !== 400 && res.status !== 409) return fallback
  try {
    const body = await res.json()
    return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
  } catch {
    return fallback
  }
}

export function ChangeDialog({ open, onOpenChange, qualityId, baseVersionId, baseline, working, fetch, onSaved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  qualityId: string
  baseVersionId: string
  /** The in-force parameters as the editor started from them (stable cupping ids). */
  baseline: Record<string, any>
  working: Record<string, any>
  fetch: PortalFetch
  onSaved: () => void
}) {
  const [when, setWhen] = useState<'now' | 'date'>('now')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  /** The removed names the client acknowledged: a different set needs a fresh tick. */
  const [understoodFor, setUnderstoodFor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changes = useMemo(() => diffSpecParameters(baseline, working), [baseline, working])
  const removed = useMemo(() => removedCuppingAttributes(baseline, working), [baseline, working])
  const removedKey = removed.join('\n')
  const understood = understoodFor === removedKey
  const min = tomorrowYmd()

  const dateOk = when === 'now' || (date !== '' && date >= min)
  const canSave = changes.length > 0 && dateOk && (removed.length === 0 || understood) && !saving

  const changeOpen = (next: boolean) => {
    if (next) setError(null)
    onOpenChange(next)
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const trimmed = note.trim()
      const res = await fetch(`/api/portal/qualities/${qualityId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseVersionId,
          parameters: working,
          effectiveFrom: when === 'now' ? 'now' : date,
          note: trimmed === '' ? null : trimmed,
        }),
      })
      if (res.status === 201) {
        setSaving(false)
        onSaved()
        return
      }
      setError(await errorText(res, SAVE_FAILED))
    } catch (e) {
      if (e instanceof PortalSessionEnded) return
      setError(SAVE_FAILED)
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[10px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Review change</DialogTitle>
          <DialogDescription className="text-[13px] text-black/40">Check what changes, then choose when it starts.</DialogDescription>
        </DialogHeader>

        <section aria-label="Changes" className="space-y-1">
          {changes.length === 0 ? (
            <p className="text-[13px] text-black/40">No changes yet.</p>
          ) : (
            <ul className="space-y-1 text-[13px]">
              {changes.map((c, i) => (
                <li key={`${c.path}-${i}`} className="break-words">{`${c.section}: ${c.path} ${c.before} → ${c.after}`}</li>
              ))}
            </ul>
          )}
        </section>

        {removed.length > 0 && (
          <div className="space-y-2 rounded-[6px] border-[0.5px] border-[#ef4444]/40 p-3 text-[13px]">
            {removed.map((name) => (
              <p key={name}>{`${name} is no longer in the cupping attributes. Its score history does not carry over to a new name.`}</p>
            ))}
            <div className="flex items-center gap-2">
              <Checkbox id="spec-change-understood" checked={understood} onCheckedChange={(v) => setUnderstoodFor(v === true ? removedKey : null)} />
              <Label htmlFor="spec-change-understood" className="text-[13px] font-normal">I understand</Label>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs text-black/40">Starts</div>
          <RadioGroup value={when} onValueChange={(v) => setWhen(v === 'date' ? 'date' : 'now')} className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="now" id="spec-change-now" />
              <Label htmlFor="spec-change-now" className="text-[13px] font-normal">Now</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="date" id="spec-change-date" />
              <Label htmlFor="spec-change-date" className="text-[13px] font-normal">From a date</Label>
            </div>
          </RadioGroup>
          {when === 'date' && (
            <div className="flex items-center gap-2">
              <Label htmlFor="spec-change-starts" className="text-[13px] font-normal">Starts on</Label>
              <input
                id="spec-change-starts"
                type="date"
                min={min}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 rounded-[6px] border-[0.5px] border-black/10 bg-white px-2 text-[13px]"
              />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="spec-change-note" className="text-xs font-normal text-black/40">Note (optional)</Label>
          <Textarea id="spec-change-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-[6px] text-[13px]" />
        </div>

        {error && <p role="alert" className="text-[13px] text-[#ef4444]">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-[6px]" onClick={() => changeOpen(false)}>Back to editing</Button>
          <Button type="button" className="rounded-[6px]" disabled={!canSave} onClick={submit}>Save change</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Confirms the cancel of a scheduled version, then sends DELETE. Open while `version` is set. */
export function CancelScheduledDialog({ version, onClose, qualityId, fetch, onCancelled }: {
  version: { id: string; effectiveFrom: string } | null
  onClose: () => void
  qualityId: string
  fetch: PortalFetch
  onCancelled: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setError(null)
    onClose()
  }

  const confirm = async () => {
    if (!version || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/qualities/${qualityId}/versions/${version.id}`, { method: 'DELETE' })
      if (res.ok) {
        setBusy(false)
        onCancelled()
        return
      }
      setError(await errorText(res, CANCEL_FAILED))
    } catch (e) {
      if (e instanceof PortalSessionEnded) return
      setError(CANCEL_FAILED)
    }
    setBusy(false)
  }

  return (
    <AlertDialog open={version !== null} onOpenChange={(o) => { if (!o) close() }}>
      <AlertDialogContent className="rounded-[10px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm font-semibold">
            {version ? `Cancel the change scheduled for ${formatCalendarDate(version.effectiveFrom)}?` : ''}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] text-black/40">
            The specification in force stays as it is.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-[13px] text-[#ef4444]">{error}</p>}
        <AlertDialogFooter>
          <Button type="button" variant="outline" className="rounded-[6px]" onClick={close}>Keep it</Button>
          <Button type="button" variant="destructive" className="rounded-[6px]" disabled={busy} onClick={confirm}>Cancel the change</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
