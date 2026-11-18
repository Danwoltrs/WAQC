'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { substringFilter } from '@/components/ui/searchable-select-filter'
import type { DestinationOption } from '@/lib/seller-requests/destinations'
import type { BuyerSampleDestination } from '@/lib/seller-requests/types'

interface Props {
  /** The QC client the sample goes to; null leaves the picker disabled. */
  clientId: string | null
  clientName: string | null
  importerId: string | null
  roasterId: string | null
  value: BuyerSampleDestination | null
  onChange: (d: BuyerSampleDestination) => void
  disabled?: boolean
}

/** "Blaser · Guterstrasse 4, CH-3001 Bern, Switzerland" */
export function destinationLine(d: BuyerSampleDestination): string {
  return `${d.companyName} · ${d.lines.join(', ')}${d.country ? ', ' + d.country : ''}`
}

/** Plain substring search over the label only: the item value is `{key} {label}`
 *  (keys carry no space), so a typed hex run never matches a row id. */
function labelFilter(value: string, search: string): number {
  return substringFilter(value.slice(value.indexOf(' ') + 1), search)
}

/** The same address: the same saved row, else the same company and lines. */
function sameDestination(a: BuyerSampleDestination | null, b: BuyerSampleDestination): boolean {
  if (!a) return false
  if (a.savedAddressId || b.savedAddressId) return a.savedAddressId === b.savedAddressId
  return a.companyId === b.companyId && a.lines.join('\n') === b.lines.join('\n')
}

const EMPTY_FORM = { label: '', lines: '', country: '', recipient_name: '', attention: '', phone: '', instructions: '' }
type FormState = typeof EMPTY_FORM

/** The POST body: label and lines always, the rest only when filled in. */
function formBody(f: FormState): Record<string, string> {
  const body: Record<string, string> = { label: f.label.trim(), lines: f.lines.trim() }
  for (const k of ['country', 'recipient_name', 'attention', 'phone', 'instructions'] as const) {
    const v = f[k].trim()
    if (v) body[k] = v
  }
  return body
}

/**
 * Where the buyer's sample goes: the client's saved sample addresses (its group
 * companies' too), its company address, the contract's importer and roaster,
 * in sections, plus "+ New address for {client}…", which saves a sys
 * `company_addresses` row. The value is a snapshot of the picked address.
 */
export function DestinationPicker({ clientId, clientName, importerId, roasterId, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<DestinationOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const sourceKey = `${clientId ?? ''}|${importerId ?? ''}|${roasterId ?? ''}`
  // Latest-request guard: a list for an earlier client never lands.
  const reqRef = useRef(0)
  useEffect(() => {
    reqRef.current++
    setOptions(null)
    setLoadError(null)
  }, [sourceKey])

  const client = clientName?.trim() || 'the client'

  const load = () => {
    if (!clientId) return
    const id = ++reqRef.current
    const qs = new URLSearchParams()
    if (importerId) qs.set('importerId', importerId)
    if (roasterId) qs.set('roasterId', roasterId)
    const query = qs.toString()
    fetch(`/api/companies/${clientId}/sample-destinations${query ? `?${query}` : ''}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Could not load the addresses')
        return (Array.isArray(data.options) ? data.options : []) as DestinationOption[]
      })
      .then((list) => {
        if (id !== reqRef.current) return
        setOptions(list)
        // Nothing on file: go straight to a new address.
        if (list.length === 0) setAdding(true)
      })
      .catch((e) => {
        if (id === reqRef.current) setLoadError(e instanceof Error ? e.message : 'Could not load the addresses')
      })
  }

  const openChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setAdding(false)
      setSaveError(null)
      return
    }
    if (options === null) load()
  }

  const pick = (d: BuyerSampleDestination) => {
    setNote(null)
    onChange(d)
    setOpen(false)
  }

  const save = async () => {
    if (!clientId) return
    setSaving(true)
    setSaveError(null)
    try {
      const r = await fetch(`/api/companies/${clientId}/sample-destinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formBody(form)),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.destination) {
        setSaveError(data.error || 'Could not save the address')
        return
      }
      const saved = data.destination as BuyerSampleDestination
      if (!data.duplicate && saved.savedAddressId) {
        const option: DestinationOption = {
          key: `saved:${saved.savedAddressId}`,
          section: 'saved',
          sectionTitle: `Saved for ${client}`,
          destination: saved,
        }
        setOptions((prev) => (prev ? [option, ...prev] : prev))
      }
      onChange(saved)
      setNote(data.duplicate ? 'Already saved' : null)
      setForm(EMPTY_FORM)
      setAdding(false)
      setOpen(false)
    } catch {
      setSaveError('Could not save the address')
    } finally {
      setSaving(false)
    }
  }

  // Sections in the order the route returns them.
  const sections: Array<{ title: string; items: DestinationOption[] }> = []
  for (const o of options ?? []) {
    const last = sections[sections.length - 1]
    if (last && last.title === o.sectionTitle) last.items.push(o)
    else sections.push({ title: o.sectionTitle, items: [o] })
  }

  const canSave = form.label.trim().length > 0 && form.lines.trim().length > 0 && !saving
  const field = (key: keyof FormState, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`dest-${key}`} className="text-xs">{label}</Label>
      <Input
        id={`dest-${key}`}
        className="h-8"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <div className="space-y-1">
      {/* `modal`, like SearchableSelect, so the list scrolls inside a Dialog too. */}
      <Popover open={open} onOpenChange={openChange} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Sample address"
            aria-expanded={open}
            disabled={disabled || !clientId}
            className={cn('h-auto min-h-8 w-full justify-between py-1.5 text-left font-normal', !value && 'text-muted-foreground')}
          >
            <span className="whitespace-normal text-xs">
              {value ? destinationLine(value) : clientId ? 'Choose the address…' : 'No client to send the sample to'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
          {adding ? (
            <form
              className="space-y-2 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (canSave) void save()
              }}
            >
              <div className="text-xs font-semibold">New address for {client}</div>
              {field('label', 'Label *')}
              <div className="space-y-1">
                <Label htmlFor="dest-lines" className="text-xs">Address *</Label>
                <Textarea
                  id="dest-lines"
                  className="min-h-[72px] text-sm"
                  placeholder="One line per row"
                  value={form.lines}
                  onChange={(e) => setForm((f) => ({ ...f, lines: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {field('country', 'Country')}
                {field('recipient_name', 'Recipient')}
                {field('attention', 'ATTN')}
                {field('phone', 'Phone')}
              </div>
              <div className="space-y-1">
                <Label htmlFor="dest-instructions" className="text-xs">Instructions</Label>
                <Textarea
                  id="dest-instructions"
                  className="min-h-[56px] text-sm"
                  value={form.instructions}
                  onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                />
              </div>
              {saveError && <p className="text-xs text-red-500">{saveError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Back
                </Button>
                <Button type="submit" size="sm" disabled={!canSave}>
                  {saving ? 'Saving…' : 'Save address'}
                </Button>
              </div>
            </form>
          ) : (
            <Command filter={labelFilter}>
              <CommandInput placeholder="Search addresses…" />
              <CommandList>
                <CommandEmpty>
                  {loadError ?? (options === null ? 'Loading addresses…' : 'No address found.')}
                </CommandEmpty>
                {sections.map((section) => (
                  <CommandGroup key={section.title} heading={section.title}>
                    {section.items.map((o) => {
                      const label = destinationLine(o.destination)
                      return (
                        <CommandItem
                          key={o.key}
                          // Never a bare uuid: cmdk searches the value (cmdk value trap).
                          value={`${o.key} ${label}`}
                          onSelect={() => pick(o.destination)}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4 shrink-0', sameDestination(value, o.destination) ? 'opacity-100' : 'opacity-0')}
                          />
                          <span className="text-xs">{label}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
              <div className="border-t p-1">
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setAdding(true)}
                >
                  + New address for {client}…
                </button>
              </div>
            </Command>
          )}
        </PopoverContent>
      </Popover>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}
