'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { QuantityFields } from './quantity-model'

/**
 * Packaging and bag-weight pickers on the lists sys.wolthers.com uses: the
 * shared packaging_liners (Jute, GrainPro, Generic GrainPro, ... and the
 * "+ Pallets" style add-ons) and packaging_bag_sizes ("60kg", "59kg", ...)
 * tables. A value staff add here lands in those tables, so sys offers it too.
 *
 * A lined bag is stored as bag_type jute_bag + bag_liner (GrainPro), so the
 * bag counts and reports stay as they were; PP, big bags and bulk are bag
 * types of their own.
 */

type Kind = Exclude<QuantityFields['bag_type'], ''>
export interface PackagingValue { bag_type: Kind; bag_liner: string }

const BULK_ADD_ONS = ['+ Pallets', '+ ISPM15 Pallets']

/** Case-, space- and ®-insensitive, as sys matches packaging names ("Grain pro" is GrainPro). */
const nameKey = (value: string) => value.toLowerCase().replace(/[\s®]+/g, '')
const findName = (options: string[], typed: string) => options.find((o) => nameKey(o) === nameKey(typed))

interface PackagingTables {
  liners: string[]
  addOns: string[]
  weights: string[]
  loading: boolean
  addLiner: (name: string) => Promise<string | null>
  addWeight: (kg: string) => Promise<string | null>
}

let cache: { liners: string[]; addOns: string[]; weights: string[] } | null = null

function usePackagingTables(): PackagingTables {
  const [state, setState] = useState(cache ?? { liners: [], addOns: [], weights: [] })
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    if (cache) return
    let ignore = false
    ;(async () => {
      // Loaded on use, so a test rendering the inputs needs no Supabase client.
      let liners: { data: { value: string }[] | null }
      let sizes: { data: { value: string }[] | null }
      try {
        const db = (await import('@/lib/supabase')).supabase as any
        ;[liners, sizes] = await Promise.all([
          db.from('packaging_liners').select('value').eq('is_active', true).order('sort_order').order('value'),
          db.from('packaging_bag_sizes').select('value').eq('is_active', true).order('sort_order').order('value'),
        ])
      } catch (error) {
        console.error('[packaging-picker] packaging lists failed to load', error)
        if (!ignore) setLoading(false)
        return
      }
      if (ignore) return
      const linerValues: string[] = (liners.data ?? []).map((r: { value: string }) => r.value.trim())
      const next = {
        liners: linerValues.filter((v) => !v.startsWith('+')),
        addOns: [...new Set([...BULK_ADD_ONS, ...linerValues.filter((v) => v.startsWith('+'))])],
        weights: (sizes.data ?? [])
          .map((r: { value: string }) => r.value.trim().match(/^(\d+(?:\.\d+)?)\s*kg$/i)?.[1])
          .filter((w: string | undefined): w is string => !!w)
          .sort((a: string, b: string) => Number(a) - Number(b)),
      }
      cache = next
      setState(next)
      setLoading(false)
    })()
    return () => {
      ignore = true
    }
  }, [])

  const insert = async (table: string, value: string): Promise<boolean> => {
    const { supabase } = await import('@/lib/supabase')
    const { error } = await (supabase as any).from(table).insert({ value, sort_order: 999 })
    if (error) {
      toast.error(
        error.code === '42501'
          ? `Could not add "${value}": your session has expired. Reload the page and sign in again.`
          : `Could not add "${value}": ${error.message}`,
      )
      return false
    }
    return true
  }

  const update = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch }
    cache = next
    setState(next)
  }

  return {
    ...state,
    loading,
    addLiner: async (name) => {
      const trimmed = name.trim()
      if (!trimmed) return null
      const isAddOn = trimmed.startsWith('+')
      const existing = findName(isAddOn ? state.addOns : state.liners, trimmed)
      if (existing) return existing
      if (!(await insert('packaging_liners', trimmed))) return null
      update(isAddOn ? { addOns: [...state.addOns, trimmed] } : { liners: [...state.liners, trimmed] })
      return trimmed
    },
    addWeight: async (kg) => {
      const n = parseFloat(kg.replace(',', '.').replace(/kg$/i, ''))
      if (!(n > 0 && n < 1000)) return null
      const value = String(n)
      if (state.weights.includes(value)) return value
      if (!(await insert('packaging_bag_sizes', `${value}kg`))) return null
      update({ weights: [...state.weights, value].sort((a, b) => Number(a) - Number(b)) })
      return value
    },
  }
}

const TRIGGER =
  'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

/** A pick list with an inline "+ Add" row, the sys PortalDropdown on the app's popover. */
function OptionDropdown({
  label,
  ariaLabel,
  options,
  selected,
  onSelect,
  addLabel,
  addPlaceholder,
  onAdd,
  clearLabel,
  onClear,
  loading,
  className,
}: {
  label: string
  ariaLabel: string
  options: { value: string; label: string }[]
  selected: string
  onSelect: (value: string) => void
  addLabel: string
  addPlaceholder: string
  onAdd: (typed: string) => Promise<void>
  clearLabel?: string
  onClear?: () => void
  loading: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const close = () => {
    setOpen(false)
    setAdding(false)
    setTyped('')
  }
  const submit = async () => {
    const value = typed.trim()
    close()
    if (value) await onAdd(value)
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={ariaLabel} disabled={loading} className={cn(TRIGGER, className)}>
          <span className={cn('truncate', !label && 'text-muted-foreground')}>{label || 'Select'}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[11rem] p-1">
        <div role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto">
          {onClear && clearLabel && (
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              onClick={() => {
                onClear()
                close()
              }}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              {clearLabel}
              {!selected && <Check className="h-4 w-4" />}
            </button>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === selected}
              onClick={() => {
                onSelect(o.value)
                close()
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                o.value === selected && 'bg-accent/60 font-medium',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === selected && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
        <div className="mt-1 border-t pt-1">
          {adding ? (
            <div className="space-y-1.5 p-1">
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    void submit()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    setAdding(false)
                    setTyped('')
                  }
                }}
                placeholder={addPlaceholder}
                aria-label={`New ${addLabel.toLowerCase()}`}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex gap-1">
                <button type="button" onClick={() => void submit()} className="h-7 flex-1 rounded-md border bg-accent text-xs hover:bg-accent/80">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false)
                    setTyped('')
                  }}
                  className="h-7 flex-1 rounded-md border text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const FIXED_KINDS: { value: string; label: string; kind: Kind }[] = [
  { value: 'pp', label: 'PP', kind: 'pp_bag' },
  { value: 'big_bag', label: 'Big bags', kind: 'big_bag' },
  { value: 'bulk', label: 'Bulk', kind: 'bulk' },
]

const isJute = (name: string) => nameKey(name) === 'jute'

/** The packaging option a stored bag_type + liner reads as. */
function optionOf(value: { bag_type: QuantityFields['bag_type']; bag_liner: string }): string {
  if (value.bag_type === 'jute_bag') return value.bag_liner.trim() ? `liner:${value.bag_liner.trim()}` : 'liner:Jute'
  return FIXED_KINDS.find((k) => k.kind === value.bag_type)?.value ?? ''
}

function valueOf(option: string): PackagingValue {
  const fixed = FIXED_KINDS.find((k) => k.value === option)
  if (fixed) return { bag_type: fixed.kind, bag_liner: '' }
  const name = option.replace(/^liner:/, '')
  return { bag_type: 'jute_bag', bag_liner: isJute(name) ? '' : name }
}

export function PackagingPicker({
  value,
  onChange,
  className,
}: {
  value: { bag_type: QuantityFields['bag_type']; bag_liner: string }
  onChange: (next: PackagingValue) => void
  className?: string
}) {
  const tables = usePackagingTables()
  const liners = [...(tables.liners.some(isJute) ? [] : ['Jute']), ...tables.liners]
  // A lined value saved before its liner reached the list (or since retired) stays pickable.
  const current = value.bag_type === 'jute_bag' ? value.bag_liner.trim() : ''
  if (current && !findName(liners, current)) liners.push(current)
  const options = [
    ...liners.map((name) => ({ value: `liner:${isJute(name) ? 'Jute' : name}`, label: name })),
    ...FIXED_KINDS.map(({ value: v, label }) => ({ value: v, label })),
  ]
  const selected = value.bag_type ? optionOf(value) : ''
  return (
    <OptionDropdown
      label={options.find((o) => o.value === selected)?.label ?? ''}
      ariaLabel="Packaging"
      options={options}
      selected={selected}
      onSelect={(option) => onChange(valueOf(option))}
      addLabel="Packaging"
      addPlaceholder="e.g. Ecotact"
      onAdd={async (typed) => {
        const fixed = FIXED_KINDS.find((k) => nameKey(k.label) === nameKey(typed))
        if (fixed) return onChange({ bag_type: fixed.kind, bag_liner: '' })
        const name = await tables.addLiner(typed.replace(/^\+\s*/, ''))
        if (name) onChange(valueOf(`liner:${name}`))
      }}
      loading={tables.loading}
      className={className}
    />
  )
}

export function WeightPicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (kg: string) => void
  className?: string
}) {
  const tables = usePackagingTables()
  const current = value && parseFloat(value) > 0 ? String(parseFloat(value)) : ''
  const weights = current && !tables.weights.includes(current) ? [...tables.weights, current] : tables.weights
  return (
    <OptionDropdown
      label={current ? `${current}kg` : ''}
      ariaLabel="Bag weight"
      options={weights.map((w) => ({ value: w, label: `${w}kg` }))}
      selected={current}
      onSelect={onChange}
      addLabel="Weight"
      addPlaceholder="kg, e.g. 69"
      onAdd={async (typed) => {
        const kg = await tables.addWeight(typed)
        if (kg) onChange(kg)
      }}
      loading={tables.loading}
      className={className}
    />
  )
}

/** Bulk / big-bag add-on ("+ Pallets"), optional; staff can add their own. */
export function AddOnPicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (addOn: string) => void
  className?: string
}) {
  const tables = usePackagingTables()
  const addOns = value && !findName(tables.addOns, value) ? [...tables.addOns, value] : tables.addOns
  return (
    <OptionDropdown
      label={value || '+ Liner'}
      ariaLabel="Liner or add-on"
      options={addOns.map((a) => ({ value: a, label: a }))}
      selected={value}
      onSelect={onChange}
      clearLabel="None"
      onClear={() => onChange('')}
      addLabel="Liner"
      addPlaceholder="e.g. Bulk liner"
      onAdd={async (typed) => {
        const name = await tables.addLiner(`+ ${typed.replace(/^\+\s*/, '')}`)
        if (name) onChange(name)
      }}
      loading={tables.loading}
      className={className}
    />
  )
}
