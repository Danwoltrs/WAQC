'use client'

import type { StepComponentProps } from './types'
import { SupplyChainStep } from './supply-chain-step'
import { QualityStep } from './quality-step'
import { QuantityStep } from './quantity-step'

/**
 * Step 2: everything about the sample itself. The two sides of the trade on
 * top (the sample and its seller on the left, the buyer and contract on the
 * right), then quality and quantity across the full width, so each reads as
 * one line. A linked contract or PSS has prefilled what it could; the cursor
 * starts in the sample reference. The live quantity and what is still
 * missing ride in the wizard's footer.
 */
export function SampleFieldsStep(props: StepComponentProps) {
  return (
    <div data-section="parties" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SupplyChainStep {...props} part="check" />
        <SupplyChainStep {...props} part="buyer" />
      </div>
      <QualityStep {...props} />
      <QuantityStep {...props} />
    </div>
  )
}
