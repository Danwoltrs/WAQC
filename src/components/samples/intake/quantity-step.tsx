'use client'

import { StepComponentProps, FormData } from './types'
import { QuantityInputs, type QuantityValue } from './quantity-inputs'
import { isPrefilled } from './field-box'
import { SectionCard } from './section-card'

/**
 * The sample's own quantity and shipment (the details step's last card, full
 * width, so the inputs sit on one line): boxes × bags per box, as sys quotes
 * a contract. The numbers and limits live in quantity-model; this only lays
 * them out. A linked contract has filled what it knows (packaging, container,
 * boxes, shipment month). A shipment sample is one container, so its Boxes
 * stays 1; its ICO and container number sit with the sample reference.
 */
export function QuantityStep({ formData, updateFormData }: StepComponentProps) {
  const value: QuantityValue = {
    bag_type: formData.bag_type,
    bag_liner: formData.bag_liner,
    bag_weight_kg: formData.bag_weight_kg,
    container_count: formData.container_count,
    container_size: formData.container_size,
    bags_per_box: formData.bags_per_box,
    mt_per_box: formData.mt_per_box,
    shipment_month: formData.shipment_month,
  }

  return (
    <SectionCard section="quantity" label="Quantity and shipment">
      <QuantityInputs
        value={value}
        origin={formData.origin}
        layout="row"
        singleBox={formData.sample_type === 'ss'}
        prefilled={(key) => isPrefilled(formData, key as keyof FormData)}
        onChange={(patch) => {
          for (const [field, v] of Object.entries(patch)) updateFormData(field as keyof FormData, v)
        }}
      />
    </SectionCard>
  )
}
