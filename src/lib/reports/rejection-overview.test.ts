import { describe, it, expect } from 'vitest'
import { violationDetails, buildRejectionOverview } from './rejection-overview'
import type { PerformanceRow } from './performance-data'

describe('violationDetails', () => {
  it.each([
    ['Quakers: 12 exceeds maximum (8)', 'quakers', '12', 'max 8'],
    ['Primary defects: 3 exceeds limit (2)', 'primary', '3', 'max 2'],
    ['Secondary defects: 20 exceeds limit (15)', 'secondary', '20', 'max 15'],
    ['Total defects: 22 exceeds limit (8)', 'secondary', 'Total 22', 'max 8'],
    ['Fault "Hard (riado)": Intensity 4 exceeds maximum (2)', 'cup_fault', 'Hard (riado) 4', 'max 2'],
    ['Taint "Earthy": Intensity 3 exceeds maximum (1)', 'cup_taint', 'Earthy 3', 'max 1'],
    ['Cupping faults: 2 exceeds limit (0)', 'cup_fault', '2 faults', 'max 0'],
    ['Cupping taints: 1 exceeds limit (0)', 'cup_taint', '1 taint', 'max 0'],
    ['Cupping defects combined: 3 exceeds limit (1)', 'cup_fault', '3 combined', 'max 1'],
    ['Screen 17: 40.0% is below minimum (60%)', 'screen', '17: 40%', 'min 60%'],
    ['Screen Screen 16: 38.5% is below minimum (45%)', 'screen', '16: 38.5%', 'min 45%'],
    ['Screen Pan: 3.0% exceeds maximum (2%)', 'screen', 'Pan: 3%', 'max 2%'],
    ['Moisture: 13% exceeds maximum (12%)', 'moisture', '13%', 'max 12%'],
    ['Moisture: 9.5% is below minimum (10%)', 'moisture', '9.5%', 'min 10%'],
    ['Finish: 2.50 is below minimum (3)', 'cup_score', 'Finish 2.50', 'min 3'],
    ['Overall: 9.50 is above maximum (9)', 'cup_score', 'Overall 9.50', 'max 9'],
    ['CVA score 82 is below the 84 pass mark', 'cup_score', 'CVA 82', 'min 84'],
  ])('%s', (sentence, key, value, limit) => {
    expect(violationDetails(sentence)).toEqual([{ key, value, limit }])
  })

  it('splits a zero-tolerance line into its faults and taints', () => {
    expect(violationDetails('Zero tolerance: 1 taint(s) and 2 fault(s) detected')).toEqual([
      { key: 'cup_fault', value: '2 faults', limit: 'max 0' },
      { key: 'cup_taint', value: '1 taint', limit: 'max 0' },
    ])
  })

  it('names a cupper rejection and a status override without a limit', () => {
    expect(violationDetails('Manual rejection by cupper')).toEqual([{ key: 'cupper', value: 'Rejected', limit: null }])
    expect(violationDetails('Status override')).toEqual([{ key: 'override', value: 'Overridden', limit: null }])
  })

  it('keeps an unrecognised sentence as it was written', () => {
    expect(violationDetails('Something new')).toEqual([{ key: 'other', value: 'Something new', limit: null }])
  })
})

let seq = 37000
const row = (o: Partial<PerformanceRow> & { violations?: string[] }): PerformanceRow => {
  const { violations, ...rest } = o
  return {
    approval_date: '2026-09-21T15:00:00Z',
    certificate_number: `BR-0${++seq}/26`,
    exporter_name: 'Grano',
    seller_name: 'Volcafe',
    importer_name: 'OFI',
    importer_contract_nr: null,
    roaster_name: null,
    container_nr: 'MSKU 123.456-7',
    ico_marks: null,
    bags: 333,
    mt: 20,
    is_rejected: !!violations,
    region: null,
    _violations: violations ?? [],
    ...rest,
  } as PerformanceRow
}

const Q = 'Quakers: 12 exceeds maximum (8)'
const S = 'Screen 17: 40.0% is below minimum (60%)'
const F = 'Fault "Hard (riado)": Intensity 4 exceeds maximum (2)'
const SEC = 'Secondary defects: 20 exceeds limit (15)'

describe('buildRejectionOverview', () => {
  it('is null when nothing was rejected', () => {
    expect(buildRejectionOverview([row({}), row({})])).toBeNull()
  })

  it('lists only rejected certificates, with a column only for reasons that occur, worst first', () => {
    const o = buildRejectionOverview([row({}), row({ violations: [S, Q] }), row({ violations: [F] })])!
    expect(o.total).toBe(2)
    expect(o.reasons).toEqual(['cup_fault', 'quakers', 'screen'])
    expect(o.failing).toEqual({ cup_fault: 1, quakers: 1, screen: 1 })
  })

  it('fills each cell with the measured value and marks the worst reason', () => {
    const o = buildRejectionOverview([row({ violations: [S, Q] })])!
    const r = o.sellers[0].shippers[0].rows[0]
    expect(r.worst).toBe('quakers')
    expect(r.cells.quakers).toEqual([{ value: '12', limit: 'max 8' }])
    expect(r.cells.screen).toEqual([{ value: '17: 40%', limit: 'min 60%' }])
  })

  it('keeps two failures of the same reason in one cell', () => {
    const o = buildRejectionOverview([row({ violations: [S, 'Screen Pan: 3.0% exceeds maximum (2%)'] })])!
    expect(o.sellers[0].shippers[0].rows[0].cells.screen).toHaveLength(2)
  })

  it('drops an unrecognised line next to a recognised reason, as the charts page does', () => {
    const o = buildRejectionOverview([row({ violations: [Q, 'Something new'] })])!
    expect(o.reasons).toEqual(['quakers'])
    expect(o.sellers[0].shippers[0].rows[0].cells.other).toBeUndefined()
  })

  it('names a rejection with nothing recorded', () => {
    const o = buildRejectionOverview([row({ is_rejected: true, _violations: [] } as Partial<PerformanceRow>)])!
    expect(o.reasons).toEqual(['other'])
    expect(o.sellers[0].shippers[0].rows[0].cells.other).toEqual([{ value: 'Not recorded', limit: null }])
  })

  it('groups by seller, most rejections first, and by shipper only when a seller used more than one', () => {
    const o = buildRejectionOverview([
      row({ seller_name: 'OFI', exporter_name: 'OFI', violations: [Q] }),
      row({ seller_name: 'Volcafe', exporter_name: 'Grano', violations: [Q] }),
      row({ seller_name: 'Volcafe', exporter_name: 'Volcafe', violations: [SEC] }),
      row({ seller_name: 'Volcafe', exporter_name: 'Grano', violations: [F] }),
    ])!
    expect(o.sellers.map(s => [s.seller, s.certificates, s.bags])).toEqual([['Volcafe', 3, 999], ['OFI', 1, 333]])
    expect(o.sellers[0].showShippers).toBe(true)
    expect(o.sellers[0].shippers.map(s => [s.shipper, s.rows.length])).toEqual([['Grano', 2], ['Volcafe', 1]])
    expect(o.sellers[1].showShippers).toBe(false)
  })

  it('falls back to the shipper when no seller is recorded', () => {
    const o = buildRejectionOverview([row({ seller_name: null, exporter_name: 'Cooxupé', violations: [Q] })])!
    expect(o.sellers[0].seller).toBe('Cooxupé')
  })

  it('orders certificates by São Paulo day, then certificate number', () => {
    const o = buildRejectionOverview([
      row({ approval_date: '2026-09-22T12:00:00Z', certificate_number: 'BR-037370/26', violations: [Q] }),
      row({ approval_date: '2026-09-22T02:00:00Z', certificate_number: 'BR-037375/26', violations: [Q] }), // 21/09 in São Paulo
      row({ approval_date: '2026-09-22T12:00:00Z', certificate_number: 'BR-037366/26', violations: [Q] }),
    ])!
    expect(o.sellers[0].shippers[0].rows.map(r => r.row.certificate_number))
      .toEqual(['BR-037375/26', 'BR-037366/26', 'BR-037370/26'])
  })
})
