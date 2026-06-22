'use client'

import { X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import type { FormData } from './types'

interface Props {
  formData: FormData
  approvedPSSSamples: any[]
  onSelectPss: (id: string) => void
  onClearPss: () => void
}

export function PssLinkStep({ formData, approvedPSSSamples, onSelectPss, onClearPss }: Props) {
  const selected = approvedPSSSamples.find((s: any) => s.id === formData.linked_pss_sample_id)

  const options = approvedPSSSamples.map((s: any) => ({
    value: s.id,
    label: [s.tracking_number, s.seller_name || s.exporter_name, s.origin]
      .filter(Boolean)
      .join(' · '),
  }))

  if (selected) {
    return (
      <div className="rounded-2xl p-3 bg-[#556b2f]/10 border border-[#556b2f]/30 min-w-[300px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Linked PSS #{selected.tracking_number}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {[selected.seller_name || selected.exporter_name, selected.importer_name]
                .filter(Boolean)
                .join(' → ')}
              {selected.origin ? ` · ${selected.origin}` : ''}
              {selected.quality_name ? ` · ${selected.quality_name}` : ''}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearPss}
            className="flex-shrink-0"
          >
            <X className="h-4 w-4 mr-1" />
            Unlink
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Approved PSS</Label>
      <SearchableSelect
        options={options}
        value={formData.linked_pss_sample_id || ''}
        onValueChange={onSelectPss}
        placeholder={
          approvedPSSSamples.length
            ? 'Search by tracking #, exporter, origin...'
            : 'No approved PSS samples'
        }
        searchPlaceholder="Search approved PSS..."
        className="h-9 w-[340px]"
      />
      <p className="text-xs text-amber-700 dark:text-amber-400">
        No PSS linked yet — link one, or continue if this is an exception.
      </p>
    </div>
  )
}
