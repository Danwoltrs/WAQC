import { describe, it, expect } from 'vitest'
import { buildSellerList, buildSellerDetail } from './supplier-review'
import { cooxupeFixture, fact } from './supplier-review.fixtures'
import { filterFacts } from './overview-model'

describe('buildSellerDetail', () => {
  const { facts, details } = cooxupeFixture()
  const d = buildSellerDetail(facts, 'Cooxupé', details)!

  it('names each certificate by its single worst reason, top 5', () => {
    expect(d.topReasons.map(r => r.label)).toEqual([
      'Cup fault: phenolic', 'Primary defects: black beans', 'Secondary defects: broken', 'Cup fault: ferment', 'Quakers',
    ])
    expect(d.topReasons.map(r => r.count)).toEqual([3, 3, 2, 1, 1])
  })

  it('counts rejected totals and multi-reason certificates', () => {
    expect(d.rejectedTotal).toBe(10)
    expect(d.multiReason).toBe(2)
    expect(d.row.certificates).toBe(40)
    expect(d.row.rejected).toBe(10)
    expect(d.row.approvalRate).toBe(75)
  })

  it('builds measured values from the violation text, newest certificate first', () => {
    const primary = d.topReasons[1]
    expect(primary.certificates.map(c => c.id)).toEqual(['r7', 'r6', 'r5'])
    expect(primary.certificates[0].measured[0]).toEqual({ label: 'Primary defects', value: '12', limit: '8' })
    expect(primary.certificates[1].measured).toHaveLength(1)
  })

  it('has a monthly series in calendar order with 0-100 rates', () => {
    expect(d.monthly).toEqual([
      { month: '2026-08', approvalRate: 91, certificates: 11 },
      { month: '2026-09', approvalRate: 71, certificates: 14 },
      { month: '2026-10', approvalRate: 67, certificates: 15 },
    ])
  })

  it('returns null for an unknown seller', () => {
    expect(buildSellerDetail(facts, 'Nobody', details)).toBeNull()
  })

  it('says not named when the lab recorded no name', () => {
    const one = [fact({ id: 'x', rejected: true, violations: ['Primary defects: 12 exceeds limit (8)'] })]
    expect(buildSellerDetail(one, 'Cooxupé', new Map())!.topReasons[0].label).toBe('Primary defects: not named')
  })

  it('uses Cup taint for taints', () => {
    const one = [fact({ id: 'x', rejected: true, violations: ['Taint "earthy": Intensity 3 exceeds maximum (0)'] })]
    const det = new Map([['lab-x', { primaryDefects: [], secondaryDefects: [], faults: [], taints: ['earthy'] }]])
    expect(buildSellerDetail(one, 'Cooxupé', det)!.topReasons[0].label).toBe('Cup taint: earthy')
  })
})

describe('buildSellerList', () => {
  it('ranks a 51/51 seller above a 4/4 one and flags few lots', () => {
    const facts = [
      ...Array.from({ length: 51 }, (_, i) => fact({ id: `b${i}`, seller: 'Big' })),
      ...Array.from({ length: 4 }, (_, i) => fact({ id: `s${i}`, seller: 'Small' })),
    ]
    const list = buildSellerList(facts)
    expect(list.map(r => r.seller)).toEqual(['Big', 'Small'])
    expect(list.map(r => r.fewLots)).toEqual([false, true])
  })

  it('computes per-type rates and SS tons', () => {
    const list = buildSellerList([
      fact({ id: '1', type: 'ss', mt: 19.25 }),
      fact({ id: '2', type: 'ss', mt: 19.3, rejected: true }),
      fact({ id: '3', type: 'pss' }),
    ])
    expect(list[0]).toMatchObject({ pssRate: 100, ssRate: 50, ssMt: 38.6, approvalRate: 67 })
    expect(buildSellerList([fact({ id: '4' })])[0].ssRate).toBeNull()
  })
})

describe('filterFacts', () => {
  it('reuses the flow filter rules', () => {
    const facts = [fact({ id: '1', seller: 'A' }), fact({ id: '2', seller: 'B' })]
    expect(filterFacts(facts, { seller: 'B' }).map(f => f.id)).toEqual(['2'])
  })
})
