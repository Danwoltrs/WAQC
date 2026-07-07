'use client'

import { X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { buildPssPickerOptions, pssOfficialRef, subContractRef, resolvePssSelection } from '@/lib/pss-picker-option'
import type { FormData } from './types'

interface Props {
  formData: FormData
  approvedPSSSamples: any[]
  onSelectPss: (id: string) => void
  onClearPss: () => void
}

export function PssLinkStep({ formData, approvedPSSSamples, onSelectPss, onClearPss }: Props) {
  const pickValue = formData.linked_pss_sample_contract_id || formData.linked_pss_sample_id
  const selection = resolvePssSelection(approvedPSSSamples, pickValue)

  const options = approvedPSSSamples.flatMap(buildPssPickerOptions)

  if (selection) {
    const sc = selection.subContract
    const ref = sc ? subContractRef(sc) : (pssOfficialRef(selection.mother) || selection.mother.tracking_number)
    const parties = sc
      ? [sc.importer_name || sc.roaster_name || sc.qc_client_name].filter(Boolean)
      : [selection.mother.seller_name || selection.mother.exporter_name, selection.mother.importer_name].filter(Boolean)
    return (
      <div className="rounded-2xl p-3 bg-[#556b2f]/10 border border-[#556b2f]/30 min-w-[300px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              Linked PSS #{ref}
              {sc ? <span className="ml-2 text-xs font-normal text-muted-foreground">(sub-contract)</span> : null}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {parties.join(' → ')}
              {selection.mother.origin ? ` · ${selection.mother.origin}` : ''}
              {selection.mother.quality_name ? ` · ${selection.mother.quality_name}` : ''}
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
        value={pickValue || ''}
        onValueChange={onSelectPss}
        placeholder={
          approvedPSSSamples.length
            ? 'Search by certificate #, contract #, sample #, supplier...'
            : 'No approved PSS samples'
        }
        searchPlaceholder="Search by certificate #, contract #, supplier..."
        className="h-9 w-[340px]"
        substringMatch
      />
      <p className="text-xs text-amber-700 dark:text-amber-400">
        No PSS linked yet — link one, or continue if this is an exception.
      </p>
    </div>
  )
}
