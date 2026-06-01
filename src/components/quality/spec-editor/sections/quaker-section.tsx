'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

export function QuakerSection({ params, patch }: SectionProps) {
  // "Required" is derived from max_quakers presence, but kept local so the
  // toggle can stay ON while the limit field is briefly empty.
  const [required, setRequired] = useState<boolean>(params?.max_quakers != null)

  const roastSize = params?.roast_sample_size_grams != null ? String(params.roast_sample_size_grams) : ''
  const limit = params?.max_quakers != null ? String(params.max_quakers) : ''

  const toggle = (on: boolean) => {
    setRequired(on)
    if (!on) patch({ max_quakers: undefined })
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">Quaker count required</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Off → quakers aren&apos;t assessed for this quality.
          </p>
        </div>
        <Switch checked={required} onCheckedChange={toggle} />
      </div>

      {required && (
        <div className="mt-5 pt-5 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="roast-size">Roast sample size (grams)</Label>
            <Input
              id="roast-size" type="number" value={roastSize}
              onChange={(e) => patch({ roast_sample_size_grams: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              placeholder="300"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quaker-limit">Quaker limit (max)</Label>
            <Input
              id="quaker-limit" type="number" value={limit}
              onChange={(e) => patch({ max_quakers: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
              placeholder="e.g. 5"
            />
          </div>
        </div>
      )}
    </div>
  )
}
