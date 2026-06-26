'use client'

import { AddableSelect } from './addable-select'
import { cropYearOptions } from './vocab-options'

/** Crop-year picker: date-generated options (May rollover), no add-new. */
export function CropYearField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = cropYearOptions(new Date(), value)
  return <AddableSelect value={value} options={options} onChange={onChange} allowAdd={false} />
}
