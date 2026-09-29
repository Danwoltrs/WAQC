'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * A company picked by name for a contract row. A party filled from sys (or
 * copied from the sample) may not be among the loaded options; it stays one,
 * so the select never shows blank over a value it holds.
 */
export function PartySelect({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { key: string; name: string }[]
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  const all = value && !options.some((o) => o.name === value) ? [{ key: value, name: value }, ...options] : options
  return (
    <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={cn('h-9', className)}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Select...</SelectItem>
        {all.map((opt) => (
          <SelectItem key={opt.key} value={opt.name}>{opt.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
