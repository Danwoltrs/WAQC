'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X } from 'lucide-react'
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

function targetLabel(c: ScreenSizeConstraint): string {
  switch (c.constraint_type) {
    case 'minimum': return `≥ ${c.min_value ?? 0}%`
    case 'maximum': return `≤ ${c.max_value ?? 0}%`
    case 'range': return `${c.min_value ?? 0}–${c.max_value ?? 0}%`
    default: return 'Any amount'
  }
}

export function ScreenSizesSection({ params, patch }: SectionProps) {
  const constraints: ScreenSizeConstraint[] = params?.screen_size_requirements?.constraints || []

  const setConstraints = (next: ScreenSizeConstraint[]) =>
    patch({ screen_size_requirements: { ...(params?.screen_size_requirements || {}), constraints: next } })

  const sorted = [...constraints].sort((a, b) => screenSortKey(b.screen_size) - screenSortKey(a.screen_size))
  const usedSizes = new Set(constraints.map((c) => c.screen_size))

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

  const removeConstraint = (idx: number) => {
    const original = constraints.indexOf(sorted[idx])
    setConstraints(constraints.filter((_, i) => i !== original))
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base font-semibold">Defined constraints</h3>
        <span className="text-sm text-muted-foreground">{constraints.length}</span>
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No constraints yet — add one below.</p>
        )}
        {sorted.map((c, idx) => (
          <div key={`${c.screen_size}-${idx}`} className="flex items-center gap-3 rounded-xl border border-border px-3 h-12">
            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-background border border-border">
              {c.screen_size}
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
              {c.constraint_type}
            </span>
            <span className="text-sm text-foreground/80">{targetLabel(c)}</span>
            <button
              onClick={() => removeConstraint(idx)}
              className="ml-auto h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Remove constraint"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add-constraint row */}
      <div className="mt-4 pt-4 border-t border-dashed border-border grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Screen size</Label>
          <Select value={newSize || undefined} onValueChange={setNewSize}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {STANDARD_SCREEN_SIZES.map((s) => (
                <SelectItem key={s} value={s} disabled={usedSizes.has(s)}>{s}</SelectItem>
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
