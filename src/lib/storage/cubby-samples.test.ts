import { describe, it, expect } from 'vitest'
import { buildCubbySampleRows, sanitizeStorageSearch } from './cubby-samples'

describe('buildCubbySampleRows', () => {
  it('names a sample by its certificate, else its own reference, and never by the SAN number', () => {
    const rows = buildCubbySampleRows(
      [
        { id: 's1', storage_position_id: 'p', wolthers_contract_nr: '42273/26', container_nr: 'HASU 155.201-6', ico_number: null, exporter_sample_number: null, client: { name: 'Dunkin Brands Inc', fantasy_name: 'Dunkin' }, tracking_number: 'SAN-01234/26' } as any,
        { id: 's2', storage_position_id: 'p', wolthers_contract_nr: null, container_nr: 'MSKU 100.000-1', ico_number: null, exporter_sample_number: null, client: null },
      ],
      [{ id: 'c1', sample_id: 's1', certificate_number: 'SAG-011895/26' }],
    )
    expect(rows).toEqual([
      { id: 's2', label: expect.stringContaining('MSKU 100.000-1'), contract: null, client: '' },
      { id: 's1', label: 'SAG-011895/26', contract: '42273/26', client: 'Dunkin' },
    ])
    expect(JSON.stringify(rows)).not.toContain('SAN-')
  })
})

describe('sanitizeStorageSearch', () => {
  it('drops PostgREST syntax and wildcards and needs two characters', () => {
    expect(sanitizeStorageSearch(' 42273,(x)* ')).toBe('42273 x')
    expect(sanitizeStorageSearch('%_')).toBe('')
    expect(sanitizeStorageSearch('a')).toBe('')
    expect(sanitizeStorageSearch(null)).toBe('')
  })
})
