'use client'

import { StepComponentProps, FormData } from './types'
import { QuantityInputs, type QuantityValue } from './quantity-inputs'
import { isPrefilled } from './field-box'
import { SectionCard } from './section-card'

/**
 * The sample's own quantity and shipment (the details step's last card, full
 * width, so the inputs sit on one line). The numbers and the bulk cap live in
 * quantity-model; this only lays them out. A linked contract has filled what
 * it knows (packing, count, weight, shipment month). The live readout sits in
 * the wizard's footer, so it stays in view while the user types here. A
 * shipment sample's ICO and container sit with the sample reference.
 */
export function QuantityStep({ formData, updateFormData }: StepComponentProps) {
  const value: QuantityValue = {
    bag_type: formData.bag_type,
    bag_count: formData.bag_count,
    bag_weight_kg: formData.bag_weight_kg,
    bags_quantity_mt: formData.bags_quantity_mt,
    container_count: formData.container_count,
    shipment_month: formData.shipment_month,
  }

  return (
    <SectionCard section="quantity" label="Quantity and shipment">
      <QuantityInputs
        value={value}
        origin={formData.origin}
        readout={false}
        layout="row"
        prefilled={(key) => isPrefilled(formData, key as keyof FormData)}
        onChange={(patch) => {
          for (const [field, v] of Object.entries(patch)) updateFormData(field as keyof FormData, v)
        }}
      />
    </SectionCard>
  )
}
