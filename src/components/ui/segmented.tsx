import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface SegmentedProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: SegmentedOption<T>[]
  'aria-label': string
  size?: 'default' | 'sm'
  className?: string
}

/** Single-select segmented control: muted track, background chip on the active item. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
  size = 'default',
  className,
}: SegmentedProps<T>) {
  const sm = size === 'sm'
  return (
    <ToggleGroup
      type="single"
      value={value}
      // Radix reports '' when the active item is clicked again; a single-select never empties.
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-start gap-0 rounded-md bg-muted p-0.5',
        sm ? 'h-7' : 'h-9',
        className
      )}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            'min-w-0 gap-1.5 rounded-sm px-3 text-xs font-medium text-muted-foreground hover:text-foreground',
            'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
            sm ? 'h-6' : 'h-8'
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="tabular-nums text-muted-foreground">{option.count.toLocaleString()}</span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
