import { describe, it, expect } from 'vitest'
import type { FormData } from './types'
import { withContractQuality, withLaboratory } from './lab-change'

/**
 * A quality spec belongs to one laboratory. When the intake moves to another
 * laboratory, the old laboratory's spec goes with it, and a linked contract's
 * quality is matched again among the new laboratory's specs.
 */

const match = (specId: string) => ({ spec_id: specId, confidence: 'high', source_text: '15/16 FC' }) as any

const form = (over: Partial<FormData> = {}): FormData => ({
  laboratory_id: 'lab-hq',
  quality_spec_id: 'spec-hq',
  quality_name: '15/16 FC',
  origin: 'Brazil',
  client_id: 'co-1',
  selected_contract: { id: 'c-1', contract_number: '42611/26' } as any,
  contract_prefilled_fields: ['quality_name', 'quality_spec_id', 'client_id'],
  contract_resolution: {
    seller_match_count: 1, shipper_match_count: 0, multiple_seller_matches: false,
    multiple_shipper_matches: false, importer_resolved: true, quality_match: match('spec-hq'),
  },
  ...over,
}) as FormData

const initial = { quality_spec_id: '', quality_name: '', client_id: '', origin: '', contract_prefilled_fields: [] } as unknown as FormData

describe('withLaboratory', () => {
  it('drops the old laboratory\'s spec, the quality name and the contract\'s spec match', () => {
    const next = withLaboratory(form(), 'lab-bv')
    expect(next).toMatchObject({ laboratory_id: 'lab-bv', quality_spec_id: '', quality_name: '' })
    expect(next.contract_resolution?.quality_match).toBeNull()
    // Everything else the contract filled stays.
    expect(next).toMatchObject({ client_id: 'co-1', origin: 'Brazil' })
    expect(next.contract_resolution?.importer_resolved).toBe(true)
  })

  it('keeps everything when the laboratory does not change', () => {
    const prev = form()
    expect(withLaboratory(prev, 'lab-hq')).toBe(prev)
  })

  it('drops a spec picked before any laboratory was', () => {
    const next = withLaboratory(form({ laboratory_id: '', contract_resolution: null }), 'lab-bv')
    expect(next).toMatchObject({ laboratory_id: 'lab-bv', quality_spec_id: '', quality_name: '' })
    expect(next.contract_resolution).toBeNull()
  })
})

describe('withContractQuality', () => {
  const moved = () => withLaboratory(form(), 'lab-bv')
  const rematch = (prev: FormData, patch: Partial<FormData>, specId: string | null, labId = 'lab-bv', contractId = 'c-1') =>
    withContractQuality(prev, initial, { labId, contractId, patch, qualityMatch: specId ? match(specId) : null })

  it('takes the new laboratory\'s matched spec and the contract\'s quality words', () => {
    const next = rematch(moved(), { quality_name: '15/16 FC', quality_spec_id: 'spec-bv', client_id: 'co-other' }, 'spec-bv')
    expect(next).toMatchObject({ laboratory_id: 'lab-bv', quality_spec_id: 'spec-bv', quality_name: '15/16 FC' })
    expect(next.contract_resolution?.quality_match?.spec_id).toBe('spec-bv')
    // Only the quality is re-applied: the rest of the contract's prefill stands.
    expect(next.client_id).toBe('co-1')
    expect(next.contract_prefilled_fields).toEqual(expect.arrayContaining(['quality_name', 'quality_spec_id', 'client_id']))
  })

  it('leaves the spec empty when the new laboratory has no match', () => {
    const next = rematch(moved(), { quality_name: '15/16 FC' }, null)
    expect(next).toMatchObject({ quality_spec_id: '', quality_name: '15/16 FC' })
    expect(next.contract_resolution?.quality_match).toBeNull()
  })

  it('ignores an answer for a laboratory or a contract the form has since left', () => {
    const prev = moved()
    expect(rematch(prev, { quality_spec_id: 'spec-x' }, 'spec-x', 'lab-pe')).toBe(prev)
    expect(rematch(prev, { quality_spec_id: 'spec-x' }, 'spec-x', 'lab-bv', 'c-2')).toBe(prev)
  })
})
