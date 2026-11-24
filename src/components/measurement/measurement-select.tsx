'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DEFAULT_MEASUREMENT_OPTIONS,
  KIND_COPY,
  cleanOptionName,
  isIsoMethod,
  optionLabel,
  optionsForLot,
  type MeasurementKind,
  type MeasurementOption,
} from '@/lib/measurement-options'

/**
 * The humidity method and the density type are picked from lists the lab keeps
 * itself. One fetch serves every field on the screen.
 */

interface ListState { options: MeasurementOption[]; editable: boolean }

let cache: ListState | null = null
let inflight: Promise<ListState> | null = null
const listeners = new Set<(s: ListState) => void>()

async function fetchLists(): Promise<ListState> {
  try {
    const res = await fetch('/api/measurement-options')
    if (!res.ok) throw new Error('lists unavailable')
    const data = await res.json()
    return { options: data.options ?? [], editable: data.editable !== false }
  } catch {
    return { options: DEFAULT_MEASUREMENT_OPTIONS, editable: false }
  }
}

function publish(next: ListState) {
  cache = next
  for (const l of listeners) l(next)
}

/** For tests: forget what was fetched. */
export function resetMeasurementOptionsCache() {
  cache = null
  inflight = null
}

export function useMeasurementOptions(): ListState & {
  add: (kind: MeasurementKind, name: string, isIso: boolean) => Promise<MeasurementOption | string>
  change: (id: string, patch: { is_iso?: boolean; is_active?: boolean }) => Promise<string | null>
} {
  const [state, setState] = useState<ListState>(cache ?? { options: DEFAULT_MEASUREMENT_OPTIONS, editable: false })

  useEffect(() => {
    listeners.add(setState)
    if (cache) setState(cache)
    else {
      inflight ??= fetchLists()
      void inflight.then(publish)
    }
    return () => { listeners.delete(setState) }
  }, [])

  const add = useCallback(async (kind: MeasurementKind, name: string, isIso: boolean) => {
    const res = await fetch('/api/measurement-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, is_iso: isIso }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.option) return (data.error as string) || 'Could not add the entry'
    const option = data.option as MeasurementOption
    const current = cache ?? { options: [], editable: true }
    publish({ ...current, options: [...current.options.filter((o) => o.id !== option.id), option] })
    return option
  }, [])

  const change = useCallback(async (id: string, patch: { is_iso?: boolean; is_active?: boolean }) => {
    const res = await fetch(`/api/measurement-options/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.option) return (data.error as string) || 'Could not change the entry'
    const option = data.option as MeasurementOption
    const current = cache ?? { options: [], editable: true }
    publish({ ...current, options: current.options.map((o) => (o.id === option.id ? option : o)) })
    return null
  }, [])

  return { ...state, add, change }
}

const NOT_SET = '__not_set__'
const MANAGE = '__manage__'

export interface MeasurementSelectProps {
  kind: MeasurementKind
  /** The name chosen; '' = not set. */
  value: string
  /** What is saved on the lot: always among the choices, even when retired. */
  saved?: string | null
  savedIso?: boolean | null
  /** The name, and for a humidity method whether it is an ISO one. */
  onChange: (name: string, isIso: boolean) => void
  className?: string
}

/** One measurement list as a dropdown, with a way to add to the list. */
export function MeasurementSelect({ kind, value, saved, savedIso, onChange, className }: MeasurementSelectProps) {
  const lists = useMeasurementOptions()
  const [managing, setManaging] = useState(false)
  const copy = KIND_COPY[kind]
  const choices = optionsForLot(lists.options, kind, saved ?? value, savedIso)

  return (
    <>
      <Select
        value={value || NOT_SET}
        onValueChange={(v) => {
          if (v === MANAGE) { setManaging(true); return }
          if (v === NOT_SET) { onChange('', false); return }
          onChange(v, kind === 'humidity_method' ? isIsoMethod(lists.options, v, savedIso) : false)
        }}
      >
        <SelectTrigger aria-label={copy.field} className={className ?? 'h-9'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_SET}>Not set</SelectItem>
          {choices.map((o) => (
            <SelectItem key={o.name} value={o.name}>
              {optionLabel(o)}{o.retired ? ' (no longer listed)' : ''}
            </SelectItem>
          ))}
          {lists.editable && (
            <>
              <SelectSeparator />
              <SelectItem value={MANAGE}>{copy.add}…</SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      {managing && (
        <ManageMeasurementList
          kind={kind}
          onClose={() => setManaging(false)}
          onAdded={(o) => { onChange(o.name, o.is_iso); setManaging(false) }}
        />
      )}
    </>
  )
}

/** The list itself: add an entry, mark a humidity method as ISO or not, retire or bring back. */
function ManageMeasurementList({
  kind,
  onClose,
  onAdded,
}: {
  kind: MeasurementKind
  onClose: () => void
  onAdded: (option: MeasurementOption) => void
}) {
  const lists = useMeasurementOptions()
  const copy = KIND_COPY[kind]
  const [name, setName] = useState('')
  const [isIso, setIsIso] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entries = lists.options
    .filter((o) => o.kind === kind)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const clean = cleanOptionName(name)

  const add = async () => {
    if (!clean) return
    setBusy(true)
    setError(null)
    const result = await lists.add(kind, clean, kind === 'humidity_method' && isIso)
    setBusy(false)
    if (typeof result === 'string') setError(result)
    else onAdded(result)
  }

  const change = async (id: string, patch: { is_iso?: boolean; is_active?: boolean }) => {
    setError(null)
    const failed = await lists.change(id, patch)
    if (failed) setError(failed)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.list}</DialogTitle>
          <DialogDescription>
            The list every grader picks from. A retired entry stays on the lots measured with it.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border text-sm">
          {entries.length === 0 && <li className="py-3 text-muted-foreground">Nothing on the list yet.</li>}
          {entries.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2">
              <span className={`min-w-0 flex-1 truncate ${o.is_active ? '' : 'text-muted-foreground line-through'}`}>{o.name}</span>
              {kind === 'humidity_method' && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={o.is_iso}
                    aria-label={`${o.name} is an ISO method`}
                    onCheckedChange={(checked) => void change(o.id, { is_iso: checked === true })}
                  />
                  ISO
                </label>
              )}
              <Button variant="ghost" size="sm" onClick={() => void change(o.id, { is_active: !o.is_active })}>
                {o.is_active ? 'Retire' : 'Bring back'}
              </Button>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label={copy.add}
              placeholder={copy.add}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
              className="h-9"
            />
            <Button onClick={() => void add()} disabled={!clean || busy}>Add</Button>
          </div>
          {kind === 'humidity_method' && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={isIso} onCheckedChange={(checked) => setIsIso(checked === true)} />
              This is an ISO method
            </label>
          )}
          {error && <p className="text-xs text-[#ef4444]">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
