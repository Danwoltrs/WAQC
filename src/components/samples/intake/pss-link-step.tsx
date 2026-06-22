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

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold mb-1">Link the approved pre-shipment sample</h3>
        <p className="text-xs text-muted-foreground">
          Every shipment sample references an approved PSS. Pick it to auto-fill the contract,
          quality and quantity details below. You can override any value afterward.
        </p>
      </div>

      {selected ? (
        <div className="rounded-2xl p-4 bg-[#556b2f]/10 border border-[#556b2f]/30">
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
          <p className="text-xs text-muted-foreground mt-2">
            Fields auto-filled in the next steps. Override anything that differs for the shipment.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
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
              className="h-9"
            />
          </div>
          <div className="rounded-2xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            No PSS linked yet. Every shipment sample should reference its approved pre-shipment
            sample — link one above, or continue if this is an exception.
          </div>
        </>
      )}
    </div>
  )
}
