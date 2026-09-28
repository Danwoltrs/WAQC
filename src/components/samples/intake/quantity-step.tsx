'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { StepComponentProps, FormData } from './types'
import { QuantityInputs, type QuantityValue } from './quantity-inputs'
import { IcoNumberInput } from '../ico-number-input'
import { ContainerHistoryHint } from '../container-history-hint'

/**
 * The sample's own quantity and shipment (section of the details step). The
 * numbers and the bulk cap live in quantity-model; this only lays them out,
 * plus the ICO and container of a shipment sample.
 */
export function QuantityStep({ formData, updateFormData }: StepComponentProps) {
  const value: QuantityValue = {
    bag_type: formData.bag_type,
    bag_count: formData.bag_count,
    bag_weight_kg: formData.bag_weight_kg,
    bags_quantity_mt: formData.bags_quantity_mt,
    container_count: formData.container_count,
    shipment_month: formData.shipment_month,
  }

  return (
    <div className="space-y-4">
      <QuantityInputs
        value={value}
        origin={formData.origin}
        onChange={(patch) => {
          for (const [field, v] of Object.entries(patch)) updateFormData(field as keyof FormData, v)
        }}
      />

      {/* ICO Number and Container Nr - shown for SS (Shipment Samples) */}
      {formData.sample_type === 'ss' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ico_number" className="text-xs text-muted-foreground">ICO number</Label>
            <IcoNumberInput
              id="ico_number"
              value={formData.ico_number}
              onChange={(e) => updateFormData('ico_number', e.target.value)}
              placeholder="e.g. 002/1234/0567"
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="container_nr" className="text-xs text-muted-foreground">Container number</Label>
            <Input
              id="container_nr"
              value={formData.container_nr}
              onChange={(e) => updateFormData('container_nr', e.target.value)}
              placeholder="e.g. ABCD1234567"
              className="h-9 font-mono"
            />
            {/* Non-blocking: a repeated container is normal (resubmission after
                a rejection, or the same container on a later shipment). This
                only shows the earlier samples so the history is visible. */}
            <ContainerHistoryHint containerNr={formData.container_nr} />
          </div>
        </div>
      )}
    </div>
  )
}
