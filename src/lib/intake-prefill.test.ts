import { describe, it, expect } from 'vitest'
import { mergePrefill } from './intake-prefill'

/**
 * The intake form remembers which fields a contract or PSS prefilled
 * (`contract_prefilled_fields`) so an Unlink can clear them and a user edit
 * can claim them. Replacing a contract RESETS what the old one filled and the
 * new one does not. A second source layered on top — the PSS's own sys
 * contract link — must not do that, or it wipes the ICO, sample number and
 * quantity the PSS just filled.
 */
type Form = {
  seller: string
  importer: string
  ico_number: string
  selected_contract: { id: string } | null
  contract_prefilled_fields: (keyof Form)[]
}
const initial: Form = { seller: '', importer: '', ico_number: '', selected_contract: null, contract_prefilled_fields: [] }

describe('mergePrefill', () => {
  it('replacing a source resets fields the old one filled and the new one does not', () => {
    const prev: Form = { ...initial, seller: 'A', importer: 'X', contract_prefilled_fields: ['seller', 'importer'] }
    const next = mergePrefill(prev, { seller: 'B' }, ['seller'], initial)
    expect(next.seller).toBe('B')
    expect(next.importer).toBe('')
    expect(next.contract_prefilled_fields).toEqual(['seller'])
  })

  it('layering a source keeps what earlier sources filled and tracks the union', () => {
    const prev: Form = { ...initial, ico_number: '123', contract_prefilled_fields: ['ico_number'] }
    const next = mergePrefill(prev, { selected_contract: { id: 'c-1' } }, ['selected_contract'], initial, { keepOthers: true })
    expect(next.ico_number).toBe('123')
    expect(next.selected_contract).toEqual({ id: 'c-1' })
    expect(next.contract_prefilled_fields).toEqual(['ico_number', 'selected_contract'])
  })

  it('ignores a tracked key the form no longer has (a draft restored from an older shape)', () => {
    const prev = { ...initial, contract_prefilled_fields: ['gone' as keyof Form] }
    const next = mergePrefill(prev, {}, [], initial)
    expect(next).not.toHaveProperty('gone')
    expect(next.contract_prefilled_fields).toEqual([])
  })
})
