'use client'

import type { ReactNode } from 'react'
import type { StepComponentProps } from './types'
import { SupplyChainStep } from './supply-chain-step'
import { QualityStep } from './quality-step'
import { QuantityStep } from './quantity-step'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Step 2: everything about the sample itself, one section per concern. A
 * linked contract or PSS has prefilled what it could; the user checks the
 * sample reference and the shipper here and completes the rest.
 */
export function SampleFieldsStep(props: StepComponentProps) {
  return (
    <div className="space-y-8">
      <Section title="Supply chain and contract references">
        <SupplyChainStep {...props} />
      </Section>
      <Section title="Quality, micro-origins, post harvest processes and certificates">
        <QualityStep {...props} />
      </Section>
      <Section title="Quantity and shipment">
        <QuantityStep {...props} />
      </Section>
    </div>
  )
}
