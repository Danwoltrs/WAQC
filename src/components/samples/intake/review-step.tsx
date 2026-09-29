'use client'

import type { StepComponentProps } from './types'
import { FinishDetails } from './finish-details'
import { ReviewSummary, type DetailsSection } from './review-summary'
import { SubContractsTable } from './sub-contracts-table'

interface ReviewStepProps extends StepComponentProps {
  onPhoto: (file: File | null) => void
  onAddContract: () => void
  onRemoveContract: (index: number) => void
  onEdit: (step: number, section?: DetailsSection) => void
}

/**
 * Step 3: what will be saved (grouped, each group with an Edit link back),
 * arrival date, photo and notes beside it, and the other contracts the same
 * sample covers across the full width. Submitting happens from here, with or
 * without sub-contracts.
 */
export function ReviewStep({ onPhoto, onAddContract, onRemoveContract, onEdit, ...props }: ReviewStepProps) {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ReviewSummary
          formData={props.formData}
          laboratories={props.laboratories}
          approvedPSSSamples={props.approvedPSSSamples}
          exporters={props.exporters}
          onEdit={onEdit}
        />
        <FinishDetails formData={props.formData} updateFormData={props.updateFormData} onPhoto={onPhoto} />
      </div>
      <SubContractsTable {...props} onAddContract={onAddContract} onRemoveContract={onRemoveContract} />
    </div>
  )
}
