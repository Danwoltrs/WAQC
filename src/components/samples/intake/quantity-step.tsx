'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StepComponentProps } from './types'

export function QuantityStep({ formData, updateFormData }: StepComponentProps) {
  return (
    <div className="space-y-4">
      <div className="bg-muted/50 p-4 rounded-lg">
        <p className="text-sm font-medium mb-2">Quantity Priority</p>
        <p className="text-xs text-muted-foreground">
          M/T (Metric Tons) is displayed as the primary quantity. Provide at least one quantity measurement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="bags_quantity_mt" className="flex items-center gap-2">
            Quantity (M/T) *
            <Badge variant="secondary" className="text-xs">Priority</Badge>
          </Label>
          <Input
            id="bags_quantity_mt"
            type="number"
            step="0.01"
            min="0"
            value={formData.bags_quantity_mt}
            onChange={(e) => updateFormData('bags_quantity_mt', e.target.value)}
            placeholder="e.g., 18.50"
          />
          <p className="text-xs text-muted-foreground">
            Metric Tons (preferred)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bag_count">Bag Count</Label>
          <Input
            id="bag_count"
            type="number"
            min="1"
            value={formData.bag_count}
            onChange={(e) => updateFormData('bag_count', e.target.value)}
            placeholder="e.g., 300"
          />
          <p className="text-xs text-muted-foreground">
            Number of bags
          </p>
        </div>
      </div>

      {formData.bags_quantity_mt && formData.bag_count && (
        <div className="bg-primary/5 p-4 rounded-lg">
          <p className="text-sm font-medium mb-1">Calculated Average</p>
          <p className="text-xs text-muted-foreground">
            {(parseFloat(formData.bags_quantity_mt) * 1000 / parseInt(formData.bag_count)).toFixed(2)} kg per bag
          </p>
        </div>
      )}
    </div>
  )
}
