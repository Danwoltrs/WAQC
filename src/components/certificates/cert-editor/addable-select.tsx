'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Plus } from 'lucide-react'

/** Option list + optional "+ add new" row. The body of an InlineEdit popover. */
export function AddableSelect({
  value,
  options,
  onChange,
  allowAdd = false,
  addLabel = 'Add new',
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  allowAdd?: boolean
  addLabel?: string
}) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const list = value && !options.includes(value) ? [...options, value] : options

  const submit = () => {
    const v = custom.trim()
    if (v) onChange(v)
    setCustom('')
    setAdding(false)
  }

  return (
    <div className="flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto">
      {list.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${
            opt === value ? 'font-medium text-foreground' : 'text-muted-foreground'
          }`}
        >
          {opt}
          {opt === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </button>
      ))}
      {allowAdd ? (
        adding ? (
          <div className="flex items-center gap-1 px-1 py-1">
            <Input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={addLabel}
              className="h-7 text-sm"
            />
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={submit}>
              Add
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-0.5 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-muted/60"
          >
            <Plus className="h-3.5 w-3.5" /> {addLabel}
          </button>
        )
      ) : null}
    </div>
  )
}
