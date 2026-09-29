'use client'

import { useMemo } from 'react'
import type { ContractWithParties } from '@/lib/contract-intake-mapping'
import { buildPssPickerOptions, pssOfficialRef, resolvePssSelection } from '@/lib/pss-picker-option'
import { ContractSearchStep } from './contract-search-step'
import { SegmentedControl } from './segmented-control'
import type { FormData } from './types'

/**
 * Step 1, the compact New Sample dialog: what kind of sample, and the
 * contract it is for (or No contract). A shipment sample links its approved
 * PSS, listed above the contracts in the same search; a contract is the
 * fallback for a PSS that is not in WAQC. Picking either moves straight on
 * to Step 2 (the form does that), where the header names the link.
 */
export function ContractStep({
  formData,
  approvedPSSSamples,
  onTypeChange,
  onSelectPss,
  onClearPss,
  applyContract,
  unlinkContract,
  onLinked,
  onNoContract,
}: {
  formData: FormData
  approvedPSSSamples: any[]
  onTypeChange: (type: string) => void
  onSelectPss: (id: string) => void
  onClearPss: () => void
  applyContract: (patch: Partial<FormData>, prefilled: (keyof FormData)[]) => void
  unlinkContract: () => void
  onLinked: (contract: ContractWithParties) => void
  onNoContract: () => void
}) {
  const isSs = formData.sample_type === 'ss'
  const pssOptions = useMemo(
    () => (isSs ? approvedPSSSamples.flatMap(buildPssPickerOptions) : undefined),
    [isSs, approvedPSSSamples],
  )
  const pss = formData.linked_pss_sample_id
    ? resolvePssSelection(approvedPSSSamples, formData.linked_pss_sample_id)?.sample
    : null

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-[12.5px] font-medium">Sample type</div>
        <SegmentedControl
          size="sm"
          ariaLabel="Sample type"
          value={formData.sample_type}
          options={[
            { value: 'pss', label: 'PSS (pre-shipment)' },
            { value: 'ss', label: 'SS (shipment)' },
            { value: 'type', label: 'Type sample' },
          ]}
          onChange={onTypeChange}
        />
      </div>
      <ContractSearchStep
        formData={formData}
        applyContract={applyContract}
        unlinkContract={unlinkContract}
        onLinked={onLinked}
        onNoContract={onNoContract}
        pssOptions={pssOptions}
        onPickPss={onSelectPss}
        linkedPssLabel={pss ? pssOfficialRef(pss) || pss.tracking_number : null}
        onClearPss={onClearPss}
      />
      {isSs && !formData.linked_pss_sample_id && (
        <p className="text-xs text-muted-foreground">
          Link the approved PSS this shipment ships against. If it isn&apos;t in WAQC, find the contract instead.
        </p>
      )}
    </div>
  )
}
