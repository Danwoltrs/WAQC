import { describe, it, expect } from 'vitest'
import React from 'react'
import { AnnualReport } from './annual-report'
import { MonthlyColumns } from './monthly-columns'
import { annualFixture } from './__fixtures__/annual-fixture'
import { renderPdf, renderTexts } from './__fixtures__/pdf-text'
import { HAIR } from './theme'

/**
 * Walks a react-pdf element tree (plain function components, no hooks) the
 * same way `pdf-text.ts` does for <Text>, but looks for a <View> whose style
 * — object or array — carries `backgroundColor: HAIR`. Used only to prove the
 * empty-month baseline tick (ruling N15) actually renders a View, since
 * `renderTexts` only sees <Text> leaves.
 */
function hasHairTick(node: unknown): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return false
  if (Array.isArray(node)) return node.some(hasHairTick)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown; style?: unknown } }
    if (typeof type === 'function') return hasHairTick((type as (p: unknown) => unknown)(props))
    if (type === 'VIEW') {
      const style = props?.style
      const styles = Array.isArray(style) ? style : [style]
      if (styles.some(st => st && typeof st === 'object' && (st as Record<string, unknown>).backgroundColor === HAIR)) {
        return true
      }
    }
    return hasHairTick(props?.children)
  }
  return false
}

describe('month-by-month pages', () => {
  it('follow each bucket’s performance page: PSS, PSS months, SS, SS months', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture()} />)
    const order = [
      'Pre-shipment (PSS) · by sample',
      'Pre-shipment (PSS) · month by month',
      'Shipment (SS) · by bags',
      'Shipment (SS) · month by month',
    ].map(t => texts.indexOf(t))
    expect(order.every(i => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('print month totals once, then the shipper and seller grids with a year column', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture()} />)
    const start = texts.indexOf('Pre-shipment (PSS) · month by month')
    const page = texts.slice(start, texts.indexOf('Shipment (SS) · by bags'))
    expect(page.filter(t => t === 'APP')).toHaveLength(1)
    expect(page.filter(t => t === '%APP')).toHaveLength(1)
    expect(page).toContain('By shipper')
    expect(page).toContain('By seller')
    expect(page.filter(t => t === 'YEAR')).toHaveLength(3)
    expect(page).toContain('EISA')
  })

  it('shows approved/total per PSS cell and approved bags per SS cell', () => {
    const data = annualFixture()
    const texts = renderTexts(<AnnualReport data={data} />)
    const eisa = data.agg.months.pss.byShipper.rows.find(r => r.name === 'EISA')!
    const june = eisa.cells[5]!
    expect(texts).toContain(`${june.approved}/${june.total}`)
    const ssStart = texts.indexOf('Shipment (SS) · month by month')
    expect(texts.slice(ssStart)).toContain('640')
  })

  it('folds a long supplier list into Others so the page stays one page', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture({ shippers: 20 })} />)
    expect(texts.some(t => t.startsWith('Others ('))).toBe(true)
  })

  it('adds importer and roaster grids on a continuation page for a final-buyer client', () => {
    const texts = renderTexts(<AnnualReport data={annualFixture({ sankeyType: 'final_buyer', importers: 3, roasters: 2 })} />)
    expect(texts).toContain('Pre-shipment (PSS) · month by month (continued)')
    expect(texts).toContain('By importer')
    expect(texts).toContain('By roaster')
  })

  it('renders to a PDF', async () => {
    const buf = await renderPdf(<AnnualReport data={annualFixture({ sankeyType: 'final_buyer', importers: 3, roasters: 2 })} />)
    expect(buf.length).toBeGreaterThan(5000)
  })

  it('gives a month with no certificates a faint baseline tick (ruling N15)', () => {
    const data = annualFixture()
    const totals = data.agg.months.pss.totals
    expect(totals.some(t => t.total === 0)).toBe(true)
    expect(hasHairTick(<MonthlyColumns totals={totals} />)).toBe(true)
  })
})
