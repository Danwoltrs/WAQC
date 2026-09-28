import { describe, it, expect } from 'vitest'
import { buildDuplicateRow, duplicateQuantityError, NO_QUANTITY_OVERRIDE } from './sample-duplicate'

describe('buildDuplicateRow', () => {
  it('writes only columns the source row has, plus a blank container', () => {
    const row = buildDuplicateRow({ id: 'x', sample_type: 'ss', ico_number: '002/1/2', container_nr: 'MSCU1' })
    expect(row).toEqual({ sample_type: 'ss', ico_number: '002/1/2', container_nr: null })
  })

  it('blanks the legacy container column too when the row has one', () => {
    expect(buildDuplicateRow({ container: 'OLD 123', container_nr: 'MSCU1' })).toEqual({ container: null, container_nr: null })
  })

  it('never copies identity, lab, decision or print state', () => {
    const row = buildDuplicateRow({
      id: 'x', tracking_number: 'SAN-1', status: 'certified', workflow_stage: 'certified', created_by: 'u',
      lab_source_sample_id: 'lab', contract_ordinal: 2, storage_position: 'A1', cards_printed_at: 'now',
      tin_label_printed_at: 'now', seller_comment: 'ok', deleted_at: null,
    })
    expect(row).toEqual({ container_nr: null })
  })

  it('keeps the source quantity without an override', () => {
    const source = { bag_type: 'bulk', bag_count: 360, bags_quantity_mt: 21.6, equivalent_60kg_bags: 360, container_count: 1 }
    expect(buildDuplicateRow(source, NO_QUANTITY_OVERRIDE)).toMatchObject(source)
  })
})

describe('duplicateQuantityError', () => {
  it('refuses bulk equivalents above one container, and nothing else', () => {
    const o = { bagCount: 361, containerCount: null, bagsMt: null }
    expect(duplicateQuantityError({ bag_type: 'bulk' }, o)).toBe('Bulk is at most 360 × 60 kg bag equivalents (21.6 MT) per sample')
    expect(duplicateQuantityError({ bag_type: 'bulk' }, { ...o, bagCount: 360 })).toBeNull()
    expect(duplicateQuantityError({ bag_type: 'jute_bag' }, o)).toBeNull()
  })
})
