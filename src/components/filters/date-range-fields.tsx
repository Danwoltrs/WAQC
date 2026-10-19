'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface DateRangeFieldsProps {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  presets?: { label: string; onSelect: () => void }[]
}

/** One "Date" block for a Filters popover: From and To side by side, labelled. */
export function DateRangeFields({ from, to, onFromChange, onToChange, presets }: DateRangeFieldsProps) {
  const id = React.useId()
  const fromId = `${id}-from`
  const toId = `${id}-to`
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">Date</div>
      <div data-testid="date-range-row" className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={fromId} className="block text-[11px] font-normal text-muted-foreground">From</Label>
          <Input
            id={fromId}
            type="date"
            className="h-8 text-xs"
            value={from}
            max={to || undefined}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
        <span aria-hidden="true" className="flex h-8 items-center text-xs text-muted-foreground">&ndash;</span>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={toId} className="block text-[11px] font-normal text-muted-foreground">To</Label>
          <Input
            id={toId}
            type="date"
            className="h-8 text-xs"
            value={to}
            min={from || undefined}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
      </div>
      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1 pt-0.5">
          {presets.map((p) => (
            <Button key={p.label} type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={p.onSelect}>
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
