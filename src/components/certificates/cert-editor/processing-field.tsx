'use client'

import { AddableSelect } from './addable-select'
import { mergeProcessingOptions } from './vocab-options'
import { PROCESSING_METHODS } from '@/components/samples/intake/constants'

/** Processing picker: canonical + distinct-from-data options, with "+ add new". */
export function ProcessingField({
  value,
  distinct,
  onChange,
}: {
  value: string
  distinct: string[]
  onChange: (v: string) => void
}) {
  const options = mergeProcessingOptions([...PROCESSING_METHODS], distinct, value)
  return (
    <AddableSelect value={value} options={options} onChange={onChange} allowAdd addLabel="Add processing method" />
  )
}
