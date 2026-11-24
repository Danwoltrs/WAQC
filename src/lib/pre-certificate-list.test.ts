import { describe, it, expect } from 'vitest'
import { searchStandbyRows, toStandbyRows, type StandbyCertificateRecord } from './pre-certificate-list'

type Sample = NonNullable<StandbyCertificateRecord['sample']>
const rec = (over: Omit<Partial<StandbyCertificateRecord>, 'sample'> & { sample?: Partial<Sample> | null } = {}): StandbyCertificateRecord => ({
  id: 'c1',
  certificate_number: '000123-COL/26',
  standby_at: '2026-11-10T12:00:00Z',
  sample_id: 's1',
  ...over,
  sample: over.sample === null ? null : {
    id: 's1', ico_number: '003/1234/0056', sample_type: 'pss', origin: 'Colombia', quality_name: 'Excelso EP',
    wolthers_contract_nr: '42250/26', buyer_contract_nr: null,
    exporter: { name: 'Carcafe Ltda', fantasy_name: 'Carcafe' }, seller: { name: 'Volcafe' }, client: { name: 'Dunkin Brands', fantasy_name: "Dunkin'" },
    ...(over.sample ?? {}),
  },
})

const NOW = new Date('2026-11-19T12:00:00Z')

describe('the Standby list', () => {
  it('shows who waits longest first, with the days waited', () => {
    const rows = toStandbyRows([rec({ id: 'new', standby_at: '2026-11-18T12:00:00Z' }), rec({ id: 'old' })], NOW)
    expect(rows.map((r) => [r.id, r.daysWaiting])).toEqual([['old', 9], ['new', 1]])
  })

  it('names the shipper and client by fantasy name, and falls back to the seller', () => {
    expect(toStandbyRows([rec()], NOW)[0]).toMatchObject({ shipper: 'Carcafe', client: "Dunkin'", contract: '42250/26' })
    expect(toStandbyRows([rec({ sample: { exporter: null } })], NOW)[0].shipper).toBe('Volcafe')
  })

  it('never shows the internal lab number, and drops a deleted lot', () => {
    expect(toStandbyRows([rec({ certificate_number: 'SAN-09001/26' })], NOW)[0].certificateNumber).toBeNull()
    expect(toStandbyRows([rec({ sample: { deleted_at: '2026-11-12' } }), rec({ sample: null })], NOW)).toEqual([])
  })

  it('is searched by ICO, shipper or certificate number, however it is typed', () => {
    const rows = toStandbyRows([rec(), rec({ id: 'c2', certificate_number: '000124-COL/26', sample: { ico_number: '003/9999/0001', exporter: { name: 'Racafe' } } })], NOW)
    expect(searchStandbyRows(rows, '003-1234').map((r) => r.id)).toEqual(['c1'])
    expect(searchStandbyRows(rows, 'racafe').map((r) => r.id)).toEqual(['c2'])
    expect(searchStandbyRows(rows, '124 col').map((r) => r.id)).toEqual(['c2'])
    expect(searchStandbyRows(rows, '  ')).toHaveLength(2)
    expect(searchStandbyRows(rows, 'nothing')).toEqual([])
  })
})
