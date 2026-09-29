import { describe, it, expect } from 'vitest'
import {
  buildRejectionAnalytics,
  selectCertificates,
  selectionTitle,
  type AnalyticsCertificate,
} from './rejection-analytics'

const QUAKERS = 'Quakers: 12 exceeds maximum (8)'
const SCREEN = 'Screen 17: 40.0% is below minimum (60%)'
const FAULT = 'Fault "Hard (riado)": Intensity 4 exceeds maximum (2)'
const PRIMARY = 'Primary defects: 3 exceeds limit (2)'

let n = 0
const cert = (over: Partial<AnalyticsCertificate> = {}): AnalyticsCertificate => {
  n += 1
  return {
    id: `c${n}`,
    sampleId: `s${n}`,
    certificateNumber: `BR-0${37000 + n}/26`,
    issuedAt: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}T12:00:00Z`,
    isRejected: false,
    violations: [],
    contract: `W-${n}`,
    buyerContract: null,
    client: 'Dunkin',
    shipper: 'Cooxupé',
    sampleType: 'ss',
    ...over,
  }
}
const rej = (...violations: string[]) => cert({ isRejected: true, violations })

const CERTS = [
  cert(), cert(), cert(), cert(),
  rej(QUAKERS), rej(QUAKERS),
  rej(QUAKERS, SCREEN), rej(SCREEN, QUAKERS),
  rej(FAULT, PRIMARY, SCREEN),
]

describe('buildRejectionAnalytics', () => {
  const a = buildRejectionAnalytics(CERTS)

  it('KPIs: analyzed, rejected with rate, rejected for more than one reason', () => {
    expect(a.analyzed).toBe(9)
    expect(a.rejected).toBe(5)
    expect(a.rejectionRate).toBe(56)
    expect(a.multiReason).toBe(3)
  })

  it('counts a certificate under EVERY reason it failed, in severity order', () => {
    expect(a.reasons.map(r => [r.key, r.count])).toEqual([
      ['cup_fault', 1], ['primary', 1], ['quakers', 4], ['screen', 3],
    ])
    // The bars do not add up to the rejections, and must not be read that way.
    expect(a.reasons.reduce((s, r) => s + r.count, 0)).toBeGreaterThan(a.rejected)
  })

  it('groups the rejections by their exact set of reasons, largest first', () => {
    expect(a.combinations.map(c => [c.label, c.count])).toEqual([
      ['Quakers only', 2],
      ['Quakers + Screen', 2],
      ['Cup fault + Primary + Screen', 1],
    ])
    expect(a.combinations.reduce((s, c) => s + c.count, 0)).toBe(a.rejected)
  })

  it('is all zeros for an empty range', () => {
    const e = buildRejectionAnalytics([])
    expect([e.analyzed, e.rejected, e.rejectionRate, e.multiReason]).toEqual([0, 0, 0, 0])
    expect(e.reasons).toEqual([])
    expect(e.combinations).toEqual([])
  })
})

describe('selectCertificates (drill-down)', () => {
  const a = buildRejectionAnalytics(CERTS)
  const certs = (sel: Parameters<typeof selectCertificates>[1]) =>
    selectCertificates(a, sel).map(r => r.certificateNumber)

  it('lists every analyzed certificate, rejected ones with their reasons', () => {
    const rows = selectCertificates(a, { kind: 'analyzed' })
    expect(rows).toHaveLength(9)
    expect(rows.find(r => r.violations.includes(FAULT))!.reasons).toEqual(['cup_fault', 'primary', 'screen'])
    expect(rows.filter(r => !r.isRejected).every(r => r.reasons.length === 0)).toBe(true)
  })

  it('lists the rejected, and the multi-reason rejected', () => {
    expect(selectCertificates(a, { kind: 'rejected' })).toHaveLength(5)
    expect(selectCertificates(a, { kind: 'multi' }).every(r => r.reasons.length > 1)).toBe(true)
    expect(selectCertificates(a, { kind: 'multi' })).toHaveLength(3)
  })

  it('a reason bar lists every certificate that failed it, alone or with others', () => {
    expect(certs({ kind: 'reason', reason: 'screen' })).toHaveLength(3)
  })

  it('a combination bar lists only the certificates with exactly that set', () => {
    const rows = selectCertificates(a, { kind: 'combination', reasons: ['quakers', 'screen'] })
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.reasons.join() === 'quakers,screen')).toBe(true)
  })

  it('lists newest first, then by certificate number', () => {
    const rows = selectCertificates(a, { kind: 'analyzed' })
    const keys = rows.map(r => r.issuedAt)
    expect([...keys].sort().reverse()).toEqual(keys)
  })
})

describe('selectionTitle', () => {
  it.each([
    [{ kind: 'analyzed' }, 'All certificates analyzed'],
    [{ kind: 'rejected' }, 'Rejected certificates'],
    [{ kind: 'multi' }, 'Rejected for more than one reason'],
    [{ kind: 'reason', reason: 'quakers' }, 'Failed on Quakers'],
    [{ kind: 'combination', reasons: ['quakers'] }, 'Quakers only'],
  ] as const)('%o', (sel, title) => {
    expect(selectionTitle(sel as any)).toBe(title)
  })
})
