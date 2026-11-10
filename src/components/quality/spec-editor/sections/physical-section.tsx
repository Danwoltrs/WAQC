'use client'

import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

const DENSITY_HINT = 'Enter g/mL, e.g. 0.680'

/** Density is typed in g/mL. Anything of 2 or more is a g/L entry and is refused, never converted. */
export function parseDensity(input: string): { value?: number; error?: string } {
  const text = input.trim()
  if (text === '') return {}
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || n >= 2) return { error: DENSITY_HINT }
  return { value: n }
}

const isSet = (v: unknown) => v != null
const fmt = (n: number) => n.toFixed(3)

/** One line for the nav: the checks that are on, in the order moisture, density, quakers. */
export function physicalSummary(params: any): string {
  const p = params || {}
  const parts: string[] = []
  if (isSet(p.moisture_min) || isSet(p.moisture_max)) {
    parts.push(
      isSet(p.moisture_min) && isSet(p.moisture_max) ? `${p.moisture_min}–${p.moisture_max}%`
        : isSet(p.moisture_min) ? `≥${p.moisture_min}%` : `≤${p.moisture_max}%`,
    )
  }
  if (isSet(p.density_min) || isSet(p.density_max)) {
    const lo = Number(p.density_min), hi = Number(p.density_max)
    parts.push(
      isSet(p.density_min) && isSet(p.density_max) ? `${fmt(lo)}–${fmt(hi)} g/mL`
        : isSet(p.density_min) ? `≥${fmt(lo)} g/mL` : `≤${fmt(hi)} g/mL`,
    )
  }
  if (isSet(p.max_quakers)) parts.push(`≤${p.max_quakers}`)
  return parts.length ? parts.join(' · ') : 'Not measured'
}

function Row({ name, helper, on, onToggle, children }: {
  name: string
  helper: string
  on: boolean
  onToggle: (on: boolean) => void
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 py-5 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold">{name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">{helper}</p>
        <Switch checked={on} onCheckedChange={onToggle} aria-label={name} />
      </div>
      <div>
        {on ? children : <p className="text-sm text-muted-foreground">Not measured for this quality.</p>}
      </div>
    </div>
  )
}

const numOrUndef = (v: string) => (v === '' ? undefined : parseFloat(v))

export function PhysicalSection({ params, patch }: SectionProps) {
  const p = params || {}
  // The switches are display only: seeded from the keys, and a row stays on while its fields are empty.
  const [moistureOn, setMoistureOn] = useState(isSet(p.moisture_min) || isSet(p.moisture_max) || isSet(p.moisture_standard))
  const [densityOn, setDensityOn] = useState(isSet(p.density_min) || isSet(p.density_max))
  const [quakersOn, setQuakersOn] = useState(isSet(p.max_quakers) || isSet(p.roast_sample_size_grams))

  // Raw density text, so the hint can show while the entry is invalid.
  const [densityText, setDensityText] = useState({
    min: isSet(p.density_min) ? fmt(Number(p.density_min)) : '',
    max: isSet(p.density_max) ? fmt(Number(p.density_max)) : '',
  })
  const [densityError, setDensityError] = useState<{ min?: string; max?: string }>({})

  const setDensity = (side: 'min' | 'max', text: string) => {
    setDensityText((t) => ({ ...t, [side]: text }))
    const parsed = parseDensity(text)
    setDensityError((e) => ({ ...e, [side]: parsed.error }))
    if (!parsed.error) patch({ [`density_${side}`]: parsed.value })
  }

  const str = (v: unknown) => (v != null ? String(v) : '')
  const standard: 'coffee_industry' | 'iso_6673' = p.moisture_standard || 'coffee_industry'

  return (
    <div className="divide-y divide-border">
      <Row
        name="Moisture" helper="Acceptable range and the measurement standard."
        on={moistureOn}
        onToggle={(on) => {
          setMoistureOn(on)
          if (!on) patch({ moisture_min: undefined, moisture_max: undefined, moisture_standard: undefined })
        }}
      >
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-2">
            <Label htmlFor="moist-min">Min (%)</Label>
            <Input
              id="moist-min" type="number" className="w-24" value={str(p.moisture_min)} placeholder="11"
              onChange={(e) => patch({ moisture_min: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="moist-max">Max (%)</Label>
            <Input
              id="moist-max" type="number" className="w-24" value={str(p.moisture_max)} placeholder="12"
              onChange={(e) => patch({ moisture_max: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Standard</Label>
            <Select value={standard} onValueChange={(v) => patch({ moisture_standard: v })}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coffee_industry">Coffee industry</SelectItem>
                <SelectItem value="iso_6673">ISO 6673</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Row>

      <Row
        name="Density" helper="Green bulk density, as typed on the grading screen. Leave a side empty for no limit."
        on={densityOn}
        onToggle={(on) => {
          setDensityOn(on)
          if (!on) {
            setDensityText({ min: '', max: '' })
            setDensityError({})
            patch({ density_min: undefined, density_max: undefined })
          }
        }}
      >
        <div className="flex flex-wrap items-start gap-5">
          {(['min', 'max'] as const).map((side) => (
            <div key={side} className="space-y-2">
              <Label htmlFor={`density-${side}`}>{side === 'min' ? 'Min (g/mL)' : 'Max (g/mL)'}</Label>
              <Input
                id={`density-${side}`} type="number" step="0.001" className="w-24"
                placeholder={side === 'min' ? '0.650' : '0.720'}
                value={densityText[side]}
                onChange={(e) => setDensity(side, e.target.value)}
              />
              {densityError[side] && <p className="text-xs text-destructive max-w-[10rem]">{densityError[side]}</p>}
            </div>
          ))}
        </div>
      </Row>

      <Row
        name="Quakers" helper="Counted on the roasted sample."
        on={quakersOn}
        onToggle={(on) => {
          setQuakersOn(on)
          if (!on) patch({ max_quakers: undefined, roast_sample_size_grams: undefined })
        }}
      >
        <div className="flex flex-wrap items-end gap-5">
          <div className="space-y-2">
            <Label htmlFor="roast-size">Roast sample (g)</Label>
            <Input
              id="roast-size" type="number" className="w-24" value={str(p.roast_sample_size_grams)} placeholder="300"
              onChange={(e) => patch({ roast_sample_size_grams: numOrUndef(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quaker-limit">Max quakers</Label>
            <Input
              id="quaker-limit" type="number" className="w-24" value={str(p.max_quakers)} placeholder="5"
              onChange={(e) => patch({ max_quakers: numOrUndef(e.target.value) })}
            />
          </div>
        </div>
      </Row>
    </div>
  )
}
