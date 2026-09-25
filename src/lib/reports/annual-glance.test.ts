import { describe, it, expect } from 'vitest'
import { computeGlance, countContainers } from './annual-glance'
import { aggregateBucket } from './performance-data'
import { annualRow } from './__fixtures__/annual-rows'

describe('countContainers', () => {
  it('counts distinct container numbers on bagged rows, ignoring case, spaces and blanks', () => {
    expect(countContainers([
      annualRow({ container_nr: 'MSKU1234567' }),
      annualRow({ container_nr: 'msku1234567 ' }),
      annualRow({ container_nr: 'TGHU7654321' }),
      annualRow({ container_nr: null }),
      annualRow({ container_nr: '  ' }),
    ])).toBe(2)
  })

  it('adds each bulk row\'s own container count, estimating from MT when none is stored', () => {
    expect(countContainers([
      annualRow({ bag_type: 'bulk', container_count: 3, mt: 64.8, container_nr: 'BULK1' }),
      annualRow({ bag_type: 'bulk', container_count: null, mt: 43.2, container_nr: null }),
      annualRow({ container_nr: 'MSKU1' }),
    ])).toBe(6)
  })
})

describe('computeGlance', () => {
  const pss = [
    annualRow({ exporter_name: 'EISA' }),
    annualRow({ exporter_name: 'EISA', is_rejected: true }),
    annualRow({ exporter_name: 'Comexim' }),
  ]
  const ss = [
    annualRow({ approval_date: '2026-06-02T00:00:00.000Z', bags: 320, mt: 19.2, container_nr: 'A1' }),
    annualRow({ approval_date: '2026-07-09T00:00:00.000Z', bags: 640, mt: 38.4, container_nr: 'A2' }),
    annualRow({ approval_date: '2026-07-10T00:00:00.000Z', bags: 320, mt: 19.2, container_nr: 'A3', is_rejected: true }),
  ]

  it('leads with approved shipment quantity and equals the SS bucket totals exactly', () => {
    const g = computeGlance(pss, ss)
    const bucket = aggregateBucket(ss, 'bags')
    expect(g.basis).toBe('ss')
    expect(g.mt).toBe(bucket.totals.mtApproved)
    expect(g.bags).toBe(bucket.totals.bagsApproved)
    expect(g.mt).toBe(57.6)
    expect(g.bags).toBe(960)
    expect(g.containers).toBe(2)
  })

  it('counts certificates, approval rates and rejections per bucket', () => {
    const g = computeGlance(pss, ss)
    expect(g.certificates).toEqual({ total: 6, pss: 3, ss: 3 })
    expect(g.rejections).toEqual({ total: 2, pss: 1, ss: 1 })
    expect(g.approvalRate).toEqual({ overall: 67, pss: 67, ss: 67 })
  })

  it('spreads approved MT over the months the certificates were issued in', () => {
    const g = computeGlance(pss, ss)
    expect(g.monthlyMt).toHaveLength(12)
    expect(g.monthlyMt[5]).toBe(19.2)
    expect(g.monthlyMt[6]).toBe(38.4)
    expect(g.monthlyMt.filter(v => v > 0)).toHaveLength(2)
  })

  it('falls back to approved pre-shipment quantity when the client had no shipment samples', () => {
    const g = computeGlance([annualRow({ bags: 300, mt: 18 }), annualRow({ bags: 100, mt: 6, is_rejected: true })], [])
    expect(g.basis).toBe('pss')
    expect(g.bags).toBe(300)
    expect(g.mt).toBe(18)
    expect(g.containers).toBeNull()
  })

  it('is zero-safe for a year without certificates', () => {
    const g = computeGlance([], [])
    expect(g.certificates.total).toBe(0)
    expect(g.approvalRate).toEqual({ overall: 0, pss: 0, ss: 0 })
    expect(g.mt).toBe(0)
    expect(g.monthlyMt.every(v => v === 0)).toBe(true)
  })
})
