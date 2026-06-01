'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

export function MoistureSection({ params, patch }: SectionProps) {
  const min = params?.moisture_min != null ? String(params.moisture_min) : ''
  const max = params?.moisture_max != null ? String(params.moisture_max) : ''
  const standard: 'coffee_industry' | 'iso_6673' = params?.moisture_standard || 'coffee_industry'

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="space-y-2">
          <Label htmlFor="moist-min">Min (%)</Label>
          <Input
            id="moist-min" type="number" value={min}
            onChange={(e) => patch({ moisture_min: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
            placeholder="11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="moist-max">Max (%)</Label>
          <Input
            id="moist-max" type="number" value={max}
            onChange={(e) => patch({ moisture_max: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
            placeholder="12"
          />
        </div>
        <div className="space-y-2">
          <Label>Standard</Label>
          <Select value={standard} onValueChange={(v) => patch({ moisture_standard: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="coffee_industry">Coffee Industry</SelectItem>
              <SelectItem value="iso_6673">ISO 6673</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
