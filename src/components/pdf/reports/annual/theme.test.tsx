import { describe, it, expect } from 'vitest'
import React from 'react'
import { Document, renderToBuffer } from '@react-pdf/renderer'
import {
  bandColors, CHARCOAL, fmtInt, fmtMt, fmtPct, formatIssued, MUTED, pct, rateBand, RED, truncate, WATCH_BAR, WATCH_FILL,
} from './theme'
import { CHARCOAL_SANKEY_PALETTE } from '@/lib/charts/sankey-layout'
import { AnnualPage } from './page-frame'
import { KpiStrip } from './kpi-strip'
import { RateBar } from './rate-bar'
import { RankBadge } from './rank-badge'
import { MonthSparkline } from './sparkline'

describe('rate bands', () => {
  it('reads 90 and above as the norm, 70–89 as watch, below 70 as a problem', () => {
    expect(rateBand(100)).toBe('ok')
    expect(rateBand(90)).toBe('ok')
    expect(rateBand(89)).toBe('watch')
    expect(rateBand(70)).toBe('watch')
    expect(rateBand(69)).toBe('problem')
    expect(rateBand(null)).toBe('none')
  })

  it('gives colour only to what needs attention', () => {
    expect(bandColors('ok')).toEqual({ text: CHARCOAL, bar: CHARCOAL, cellFill: null })
    expect(bandColors('watch')).toEqual({ text: CHARCOAL, bar: WATCH_BAR, cellFill: WATCH_FILL })
    expect(bandColors('problem').text).toBe(RED)
    expect(bandColors('none').text).toBe(MUTED)
  })

  it('matches the Sankey\'s charcoal palette', () => {
    expect(CHARCOAL_SANKEY_PALETTE.high).toBe(CHARCOAL)
    expect(CHARCOAL_SANKEY_PALETTE.mid).toBe(WATCH_BAR)
    expect(CHARCOAL_SANKEY_PALETTE.low).toBe(RED)
    expect(CHARCOAL_SANKEY_PALETTE.neutral).toBe(MUTED)
  })
})

describe('formatting', () => {
  it('formats counts, tonnes and percentages the way the tables print them', () => {
    expect(fmtInt(40740)).toBe('40,740')
    expect(fmtMt(2444.4)).toBe('2,444.4')
    expect(fmtMt(0)).toBe('0.0')
    expect(fmtPct(84.6)).toBe('85%')
    expect(pct(2, 3)).toBe(67)
    expect(pct(1, 0)).toBe(0)
  })

  it('shortens long legal names with an ellipsis', () => {
    const t = truncate('Ipanema Comercial e Exportadora S.A. or Ipanema Agrícola S.A.', 20)
    expect(t).toBe('Ipanema Comercial e…')
    expect(truncate('Ipanema Comercial  Exportadora', 19)).toBe('Ipanema Comercial…')
    expect(truncate('EISA', 20)).toBe('EISA')
  })

  it('prints the issue date as day, short month, year', () => {
    expect(formatIssued('2026-09-25T12:00:00.000Z')).toBe('25 Sep 2026')
  })
})

describe('primitives', () => {
  it('render inside a landscape page without errors', async () => {
    const doc = (
      <Document>
        <AnnualPage sectionNumber="01" title="Primitives" clientName="Ahold" year={2026} draft>
          <KpiStrip items={[{ label: 'Certificates', value: '102' }, { label: 'Approval rate', value: '69%' }]} />
          <RateBar rate={57} />
          <RankBadge rank={1} />
          <RankBadge rank={7} />
          <MonthSparkline values={[0, 0, 0, 0, 0, 5, 9, 7, 3, 0, 0, 0]} label="MT cleared by month" />
        </AnnualPage>
      </Document>
    )
    const buf = await renderToBuffer(doc)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
