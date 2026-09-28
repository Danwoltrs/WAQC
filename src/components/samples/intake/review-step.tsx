'use client'

import type { StepComponentProps } from './types'
import { SampleDetailsStep } from './sample-details-step'
import { ContractsStep } from './contracts-step'

interface ReviewStepProps extends StepComponentProps {
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAddContract: () => void
  onRemoveContract: (index: number) => void
}

/**
 * Step 3: arrival date, photo and notes, the summary of what will be saved,
 * and the other contracts the same sample covers. Submitting happens from
 * here, with or without sub-contracts.
 */
export function ReviewStep({ onPhotoUpload, onAddContract, onRemoveContract, ...props }: ReviewStepProps) {
  return (
    <div className="space-y-8">
      <SampleDetailsStep {...props} onPhotoUpload={onPhotoUpload} />
      <ContractsStep {...props} onAddContract={onAddContract} onRemoveContract={onRemoveContract} />
    </div>
  )
}
