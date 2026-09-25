import { describe, it, expect } from 'vitest'
import React from 'react'
import { AnnualReport } from './annual-report'
import { bucketPerfTotals, perfLines, PERF_TABLE_CAP } from './perf-table'
import { annualFixture } from './__fixtures__/annual-fixture'
import { renderPdf, renderTexts } from './__fixtures__/pdf-text'
import { fmtInt, fmtMt } from './theme'
import type { GroupPerf } from '@/lib/reports/performance-data'

const g = (name: string, approvedCount: number, rejectedCount = 0): GroupPerf => ({
  name, approvedCount, rejectedCount,
  approvedBags: approvedCount * 320, rejectedBags: rejectedCount * 320,
  approvedMt: approvedCount * 19.2, rejectedMt: rejectedCount * 19.2, rejectionRate: 0,
})

describe('AnnualReport — cover and performance pages', () => {
  it('renders the full fixture to a PDF', async () => {
    const buf = await renderPdf(<AnnualReport data={annualFixture()} />)
    expect(buf.length).toBeGreaterThan(5000)
  })

  it('puts the year at a glance on the cover, quantity first', () => {
    const data = annualFixture()
    const texts = renderTexts(<AnnualReport data={data} />)
    const glance = data.agg.glance
    expect(texts).toContain('Annual Quality Performance Review')
    expect(texts).toContain('2026')
    const mt = texts.indexOf(fmtMt(glance.mt))
    const bags = texts.indexOf(fmtInt(glance.bags))
    const containers = texts.indexOf(fmtInt(glance.containers!))
    expect(mt).toBeGreaterThan(-1)
    expect(bags).toBeGreaterThan(mt)
    expect(containers).toBeGreaterThan(bags)
    expect(texts).toContain('MT cleared')
    expect(texts).toContain('Containers')
  })

  it('numbers the PSS page before the SS page', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture()} />)
    const pss = texts.indexOf('Pre-shipment (PSS) · by sample')
    const ss = texts.indexOf('Shipment (SS) · by bags')
    expect(pss).toBeGreaterThan(-1)
    expect(ss).toBeGreaterThan(pss)
    expect(texts[pss - 1]).toBe('01')
    expect(texts[ss - 1]).toBe('03')
  })

  it('prints shipper and seller side by side with the bucket totals and no %REJ column', () => {
    const data = annualFixture()
    const texts = renderTexts(<AnnualReport data={data} />)
    expect(texts.filter(t => t === 'By shipper').length).toBeGreaterThanOrEqual(2)
    expect(texts.filter(t => t === 'By seller').length).toBeGreaterThanOrEqual(2)
    expect(texts).not.toContain('%REJ')
    expect(texts.filter(t => t === 'TOTAL GERAL')).toHaveLength(4)
    expect(texts).toContain(fmtInt(data.agg.ss.totals.bagsApproved))
  })

  it('leaves out the SS pages and says so on the cover for a client without shipment samples', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture({ withSs: false })} />)
    expect(texts).not.toContain('Shipment (SS) · by bags')
    expect(texts).toContain('MT approved at pre-shipment')
    expect(texts).not.toContain('Containers')
  })

  it('renders only the cover, with the methodology, for a year without certificates', async () => {
    const data = annualFixture({ shippers: 0 })
    const texts = renderTexts(<AnnualReport data={data} />)
    expect(texts).not.toContain('Pre-shipment (PSS) · by sample')
    expect(texts.some(t => t.startsWith('Covers every certificate'))).toBe(true)
    const buf = await renderPdf(<AnnualReport data={data} />)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('shortens a long legal name in the tables', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture({ longNames: true, shippers: 2 })} />)
    expect(texts.some(t => t.startsWith('Ipanema Comercial') && t.endsWith('…'))).toBe(true)
  })
})

describe('perfLines', () => {
  it('folds rows past the cap into Others and sums them', () => {
    const rows = Array.from({ length: PERF_TABLE_CAP + 3 }, (_, i) => g(`S${String(i).padStart(2, '0')}`, 40 - i, 1))
    const lines = perfLines(rows, 'count', null)
    expect(lines).toHaveLength(PERF_TABLE_CAP + 1)
    const others = lines[lines.length - 1]
    expect(others.name).toBe('Others (3)')
    expect(others.app).toBe((40 - 16) + (40 - 17) + (40 - 18))
    expect(others.rej).toBe(3)
  })

  it('reads bags and containers on the bags basis', () => {
    const [line] = perfLines([g('Comexim', 2, 1)], 'bags', { Comexim: 2 })
    expect(line).toEqual({ name: 'Comexim', app: 640, rej: 320, mtApp: 38.4, mtRej: 19.2, cont: 2 })
  })

  it('takes TOTAL GERAL from the bucket totals, not from the rounded rows', () => {
    const t = { evaluated: 3, approved: 2, rejected: 1, rejectionRate: 33, bagsApproved: 640, mtApproved: 38.4, bagsRejected: 320, mtRejected: 19.2, contracts: 3, fcl: 3 }
    expect(bucketPerfTotals(t, 'bags', 2)).toEqual({ app: 640, rej: 320, mtApp: 38.4, mtRej: 19.2, cont: 2 })
    expect(bucketPerfTotals(t, 'count', null)).toEqual({ app: 2, rej: 1, mtApp: 38.4, mtRej: 19.2, cont: null })
  })
})
