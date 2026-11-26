import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** A labelled text input with an optional inline error. */
export function Field({
  label, value, onChange, error, className, placeholder, disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        aria-invalid={!!error || undefined} />
      {error && <span className="block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  )
}

export function FormActions({
  saving, submitLabel, onCancel, error, children,
}: { saving?: boolean; submitLabel: string; onCancel: () => void; error?: string | null; children?: ReactNode }) {
  return (
    <div className="space-y-2 pt-1">
      {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        {children}
        <button type="submit" disabled={saving}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Saving...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm hover:bg-accent">
          Cancel
        </button>
      </div>
    </div>
  )
}
