'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { StepComponentProps } from './types'

export function TrackingNumbersStep({ formData, updateFormData }: StepComponentProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All contract numbers are optional. Fill in what is available.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wolthers_contract_nr">Wolthers Contract Number</Label>
          <Input
            id="wolthers_contract_nr"
            value={formData.wolthers_contract_nr}
            onChange={(e) => updateFormData('wolthers_contract_nr', e.target.value)}
            placeholder="e.g., WC-2024-001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exporter_contract_nr">Exporter Contract Number</Label>
          <Input
            id="exporter_contract_nr"
            value={formData.exporter_contract_nr}
            onChange={(e) => updateFormData('exporter_contract_nr', e.target.value)}
            placeholder="e.g., EX-2024-001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="buyer_contract_nr">Buyer Contract Number</Label>
          <Input
            id="buyer_contract_nr"
            value={formData.buyer_contract_nr}
            onChange={(e) => updateFormData('buyer_contract_nr', e.target.value)}
            placeholder="e.g., BC-2024-001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="roaster_contract_nr">Roaster Contract Number</Label>
          <Input
            id="roaster_contract_nr"
            value={formData.roaster_contract_nr}
            onChange={(e) => updateFormData('roaster_contract_nr', e.target.value)}
            placeholder="e.g., RC-2024-001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ico_number">ICO Number</Label>
          <Input
            id="ico_number"
            value={formData.ico_number}
            onChange={(e) => updateFormData('ico_number', e.target.value)}
            placeholder="e.g., ICO-123456"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="container_nr">Container Number</Label>
          <Input
            id="container_nr"
            value={formData.container_nr}
            onChange={(e) => updateFormData('container_nr', e.target.value)}
            placeholder="e.g., ABCD1234567"
          />
        </div>
      </div>
    </div>
  )
}
