import { describe, it, expect } from 'vitest'
import {
  MAX_PRINT_LIST,
  printListBagSleeveEntries,
  printListSelection,
  printListStorageKey,
  readPrintList,
  tinCountLine,
  tinCountNote,
  toPrintListEntry,
  writePrintList,
  type PrintListEntry,
} from './print-list'

const entry = (id: string, over: Partial<PrintListEntry> = {}): PrintListEntry => ({
  id,
  certificate_number: `SAG-${id}/26`,
  sample_id: `s-${id}`,
  lab_source_sample_id: null,
  client_name: null,
  contract_ref: null,
  buyer_id: null,
  seller_id: null,
  include_qr: true,
  ...over,
})

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  }
}

describe('print list', () => {
  it("round-trips through storage under the user's own key", () => {
    const s = memoryStorage()
    const list = [entry('c1'), entry('c2')]
    writePrintList(s, 'u-1', list)
    expect(s.has('waqc:certificates:print-list:v1:u-1')).toBe(true)
    expect(printListStorageKey('u-1')).toBe('waqc:certificates:print-list:v1:u-1')
    expect(readPrintList(s, 'u-1')).toEqual(list)
    expect(readPrintList(s, 'u-2')).toEqual([])
  })

  it('an empty list removes the key', () => {
    const s = memoryStorage()
    writePrintList(s, 'u-1', [entry('c1')])
    writePrintList(s, 'u-1', [])
    expect(s.has(printListStorageKey('u-1'))).toBe(false)
  })

  it('null storage is tolerated', () => {
    expect(readPrintList(null, 'u-1')).toEqual([])
    expect(() => writePrintList(null, 'u-1', [entry('c1')])).not.toThrow()
  })

  it.each(['not json', '{"a":1}', '[{"id":3}]'])('a corrupt stored list (%s) loads empty', (raw) => {
    expect(readPrintList({ getItem: () => raw }, 'u-1')).toEqual([])
  })

  it('drops invalid entries and keeps at most 300', () => {
    const many = Array.from({ length: MAX_PRINT_LIST + 20 }, (_, i) => entry(`c${i}`))
    const raw = JSON.stringify([{ id: 1 }, ...many])
    expect(readPrintList({ getItem: () => raw }, 'u-1')).toHaveLength(MAX_PRINT_LIST)
  })

  it('storage that throws never breaks the page', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(readPrintList(broken, 'u-1')).toEqual([])
    expect(() => writePrintList(broken, 'u-1', [entry('c1')])).not.toThrow()
    expect(() => writePrintList(broken, 'u-1', [])).not.toThrow()
  })

  it('an entry never carries the SAN', () => {
    const e = toPrintListEntry({
      id: 'c1',
      certificate_number: 'SAG-011960/26',
      sample_id: 's1',
      sample: { lab_source_sample_id: null, tracking_number: 'SAN-00921/26' } as never,
    })
    expect(JSON.stringify(e)).not.toContain('SAN-')
    expect(Object.keys(e).sort()).toEqual(
      ['buyer_id', 'certificate_number', 'client_name', 'contract_ref', 'id', 'include_qr', 'lab_source_sample_id', 'sample_id', 'seller_id'],
    )
  })

  it('snapshots client name (fantasy first), contract ref and parties', () => {
    const e = toPrintListEntry({
      id: 'c1',
      certificate_number: 'X-1/26',
      issued_to: 'Issued Co',
      sample_id: 's1',
      buyer_id: 'b',
      seller_id: 'sl',
      sample: {
        lab_source_sample_id: 'lab',
        buyer_contract_nr: 'BC-9',
        importer_is_qc_client: true,
        client: { name: 'N', company: 'Legal Ltd', fantasy_name: 'Fancy' },
      },
    })
    expect(e).toEqual({
      id: 'c1', certificate_number: 'X-1/26', sample_id: 's1', lab_source_sample_id: 'lab',
      client_name: 'Fancy', contract_ref: 'BC-9', buyer_id: 'b', seller_id: 'sl', include_qr: true,
    })
    expect(toPrintListEntry({ id: 'c', certificate_number: 'n', sample_id: null, issued_to: 'Issued Co' }).client_name).toBe('Issued Co')
    expect(toPrintListEntry({ id: 'c', certificate_number: 'n', sample_id: null }).client_name).toBeNull()
  })

  it('printListSelection feeds the tin mapping', () => {
    const sel = printListSelection([entry('c1', { lab_source_sample_id: 'lab' })])
    expect(sel).toEqual([{ sample_id: 's-c1', sample: { lab_source_sample_id: 'lab' } }])
  })

  it('a lab unit and its sibling are one tin', () => {
    const list = [entry('c1', { sample_id: 'lab' }), entry('c2', { sample_id: 'sib', lab_source_sample_id: 'lab' })]
    expect(tinCountLine(list)).toBe('2 certificates → 1 tin')
  })

  it('singular and plural copy', () => {
    expect(tinCountLine([entry('c1')])).toBe('1 certificate → 1 tin')
    expect(tinCountLine([entry('c1'), entry('c2')])).toBe('2 certificates → 2 tins')
  })

  it('tinCountNote keeps the page copy and is undefined when nothing collapses', () => {
    expect(tinCountNote([entry('c1'), entry('c2')])).toBeUndefined()
    const list = [entry('c1', { sample_id: 'lab' }), entry('c2', { sample_id: 'sib', lab_source_sample_id: 'lab' })]
    expect(tinCountNote(list)).toBe("2 certificates -> 1 tin label (contract siblings share their lot's label).")
  })

  it('a newly ticked certificate gets a QR on its bag sleeve', () => {
    expect(toPrintListEntry({ id: 'c1', certificate_number: 'n', sample_id: 's1' }).include_qr).toBe(true)
  })

  it('a list stored before the QR column loads with the QR on; a stored false survives', () => {
    const { include_qr: _dropped, ...old } = entry('c1')
    const raw = JSON.stringify([old, entry('c2', { include_qr: false }), { ...entry('c3'), include_qr: 'no' }])
    expect(readPrintList({ getItem: () => raw }, 'u-1').map((e) => e.include_qr)).toEqual([true, false, true])

    const s = memoryStorage()
    writePrintList(s, 'u-1', [entry('c4', { include_qr: false })])
    expect(readPrintList(s, 'u-1')[0].include_qr).toBe(false)
  })

  it('bag sleeves: one per sample with its own QR choice, first entry wins, no sample no sleeve', () => {
    const list = [
      entry('c1', { sample_id: 's1', include_qr: false }),
      entry('c2', { sample_id: 's2', lab_source_sample_id: 's1' }),
      entry('c3', { sample_id: 's1', include_qr: true }),
      entry('c4', { sample_id: null }),
    ]
    expect(printListBagSleeveEntries(list)).toEqual([
      { id: 's1', includeQrCode: false },
      { id: 's2', includeQrCode: true },
    ])
    expect(printListBagSleeveEntries([])).toEqual([])
  })
})
