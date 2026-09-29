'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhotoDropZone } from './photo-drop-zone'
import type { FormData } from './types'

/**
 * What only the lab knows at intake: when the sample arrived, its photo and
 * any notes. The photo's checks (size) stay with the form, through `onPhoto`.
 */
export function FinishDetails({
  formData,
  updateFormData,
  onPhoto,
}: {
  formData: FormData
  updateFormData: (field: keyof FormData, value: any) => void
  onPhoto: (file: File | null) => void
}) {
  return (
    <div className="space-y-4">
      {formData.sample_type === 'ss' && !formData.linked_pss_sample_id && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          No PSS linked to this shipment sample. Every SS should reference its approved pre-shipment
          sample. Go back to Contract to link one, or continue if this is an exception.
        </p>
      )}
      <div className="space-y-1.5" data-field="arrival_date">
        <Label htmlFor="arrival_date" className="text-[12.5px] font-medium">Arrival date *</Label>
        <Input
          id="arrival_date"
          type="date"
          value={formData.arrival_date}
          onChange={(e) => updateFormData('arrival_date', e.target.value)}
          className="h-9 w-full sm:w-48"
          data-autofocus
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12.5px] font-medium">Sample photo</Label>
        <PhotoDropZone file={formData.photo_file} onFile={onPhoto} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-[12.5px] font-medium">Notes</Label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => updateFormData('notes', e.target.value)}
          placeholder="Anything the lab should know about this sample"
          className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}
