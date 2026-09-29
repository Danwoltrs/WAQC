'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X } from 'lucide-react'
import { REVIEW_FIELD, type ReviewTone } from '../spec-review'
import { isImpliedScreen, screenNumberOf, withImpliedScreens } from '@/lib/implied-screens'
import {
  STANDARD_SCREEN_SIZES,
  type ConstraintType,
  type ScreenSizeConstraint,
} from '@/types/screen-size-constraints'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

// Largest → smallest, Pan always last (matches the list rule).
const screenSortKey = (size: any) => {
  const s = String(size ?? '').trim()
  if (/pan/i.test(s)) return -Infinity
  const m = s.match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : -1
}

const TYPE_OPTIONS: { value: ConstraintType; label: string }[] = [
  { value: 'minimum', label: 'Min (≥)' },
  { value: 'maximum', label: 'Max (≤)' },
  { value: 'range', label: 'Range' },
  { value: 'any', label: 'Any' },
]

/** A row switched to another type keeps the value it had where it can. */
function retype(c: ScreenSizeConstraint, type: ConstraintType): ScreenSizeConstraint {
  const value = c.min_value ?? c.max_value
  const next: ScreenSizeConstraint = { screen_size: c.screen_size, constraint_type: type }
  if (c.display_order != null) next.display_order = c.display_order
  if (type === 'minimum' && value != null) next.min_value = value
  if (type === 'maximum' && value != null) next.max_value = value
  if (type === 'range') {
    if (c.min_value != null) next.min_value = c.min_value
    if (c.max_value != null) next.max_value = c.max_value
  }
  return next
}

const toNumber = (v: string) => (v.trim() === '' ? undefined : parseFloat(v))

function PercentInput({ value, onChange, label }: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  label: string
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(toNumber(e.target.value))}
      className="h-8 w-20 text-sm"
    />
  )
}

export function ScreenSizesSection({ params, patch, tones }: SectionProps & {
  /** Rows changed on the lab's behalf, by screen_size: amber until confirmed. */
  tones?: Record<string, ReviewTone>
}) {
  const constraints: ScreenSizeConstraint[] = params?.screen_size_requirements?.constraints || []

  const setConstraints = (next: ScreenSizeConstraint[]) =>
    patch({ screen_size_requirements: { ...(params?.screen_size_requirements || {}), constraints: next } })

  const usedSizes = new Set(constraints.map((c) => c.screen_size))
  const usedNumbers = new Set<number | null>(constraints.map((c) => screenNumberOf(c.screen_size)).filter((n) => n != null))

  // Add-row local state
  const [newSize, setNewSize] = useState('')
  const [newType, setNewType] = useState<ConstraintType>('minimum')
  const [newMin, setNewMin] = useState('')
  const [newMax, setNewMax] = useState('')

  const canAdd = newSize && (newType === 'any' ||
    (newType === 'range' ? newMin !== '' && newMax !== '' : newMin !== ''))

  const addConstraint = () => {
    if (!canAdd) return
    const c: ScreenSizeConstraint = {
      screen_size: newSize,
      constraint_type: newType,
      display_order: constraints.length,
    }
    if (newType === 'minimum') c.min_value = parseFloat(newMin)
    if (newType === 'maximum') c.max_value = parseFloat(newMin)
    if (newType === 'range') { c.min_value = parseFloat(newMin); c.max_value = parseFloat(newMax) }
    setConstraints([...constraints, c])
    setNewSize(''); setNewType('minimum'); setNewMin(''); setNewMax('')
  }

  // Edit a row in place. A screen shown only because it lies between listed
  // screens becomes a listed row the moment it is given a type or value.
  const updateRow = (size: string, row: ScreenSizeConstraint) => {
    const { implied: _implied, ...next } = row as ScreenSizeConstraint & { implied?: true }
    const at = constraints.findIndex((c) => c.screen_size === size)
    if (at < 0) setConstraints([...constraints, { ...next, display_order: constraints.length }])
    else setConstraints(constraints.map((c, i) => (i === at ? next : c)))
  }

  const removeRow = (size: string) => setConstraints(constraints.filter((c) => c.screen_size !== size))

  const rows = [...withImpliedScreens(constraints)]
    .sort((a, b) => screenSortKey(b.screen_size) - screenSortKey(a.screen_size))

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-base font-semibold">Defined constraints</h3>
        <span className="text-sm text-muted-foreground">{constraints.length}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Screens between two listed screens are always graded as any amount; list one only to give it a requirement.
      </p>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No constraints yet — add one below.</p>
        )}
        {rows.map((row) => {
          const implied = isImpliedScreen(row)
          const c = row as ScreenSizeConstraint
          const tone = tones?.[c.screen_size]
          const set = (patchRow: Partial<ScreenSizeConstraint>) => updateRow(c.screen_size, { ...c, ...patchRow })
          return (
            <div
              key={c.screen_size}
              data-testid={`screen-row-${c.screen_size}`}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 min-h-12 ${
                implied ? 'border-dashed border-border' : 'border-border'} ${tone ? REVIEW_FIELD[tone] : ''}`}
            >
              <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md border border-border min-w-[5.5rem] text-center ${
                implied ? 'text-muted-foreground' : 'bg-background'}`}>
                {c.screen_size}
              </span>
              <Select value={c.constraint_type} onValueChange={(v) => updateRow(c.screen_size, retype(c, v as ConstraintType))}>
                <SelectTrigger className="h-8 w-[112px] text-xs" aria-label={`${c.screen_size} type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 text-sm text-foreground/80">
                {c.constraint_type === 'minimum' && (
                  <>≥ <PercentInput label={`${c.screen_size} minimum %`} value={c.min_value} onChange={(v) => set({ min_value: v })} /> %</>
                )}
                {c.constraint_type === 'maximum' && (
                  <>≤ <PercentInput label={`${c.screen_size} maximum %`} value={c.max_value} onChange={(v) => set({ max_value: v })} /> %</>
                )}
                {c.constraint_type === 'range' && (
                  <>
                    <PercentInput label={`${c.screen_size} minimum %`} value={c.min_value} onChange={(v) => set({ min_value: v })} />
                    –
                    <PercentInput label={`${c.screen_size} maximum %`} value={c.max_value} onChange={(v) => set({ max_value: v })} /> %
                  </>
                )}
                {c.constraint_type === 'any' && <span>Any amount</span>}
              </div>
              {implied ? (
                <span className="ml-auto text-xs text-muted-foreground">Between listed screens</span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeRow(c.screen_size)}
                  className="ml-auto h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Remove constraint"
                  aria-label={`Remove ${c.screen_size}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Add-constraint row */}
      <div className="mt-4 pt-4 border-t border-dashed border-border grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Screen size</Label>
          <Select value={newSize || undefined} onValueChange={setNewSize}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {STANDARD_SCREEN_SIZES.map((s) => (
                <SelectItem key={s} value={s} disabled={usedSizes.has(s) || usedNumbers.has(screenNumberOf(s))}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={newType} onValueChange={(v) => setNewType(v as ConstraintType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{newType === 'range' ? 'Min – Max %' : 'Value %'}</Label>
          {newType === 'any' ? (
            <Input disabled placeholder="—" />
          ) : newType === 'range' ? (
            <div className="flex gap-2">
              <Input type="number" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="Min" />
              <Input type="number" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="Max" />
            </div>
          ) : (
            <Input type="number" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="40" />
          )}
        </div>
        <Button onClick={addConstraint} disabled={!canAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  )
}
