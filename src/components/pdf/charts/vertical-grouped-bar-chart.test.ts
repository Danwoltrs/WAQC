import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { VerticalGroupedBarChart, niceAxisMax, fmtMt, type GroupedBarCategory } from './vertical-grouped-bar-chart'

const cat = (over: Partial<GroupedBarCategory> = {}): GroupedBarCategory => ({
  label: 'Comexim',
  approved: 3940,
  rejected: 0,
  approvedMt: 236.4,
  rejectedMt: 0,
  rejectionRate: 0,
  ...over,
})

// Walk the React element tree returned by a plain function component (no
// hooks/context, so it's safe to call directly) and collect every string/
// number leaf in document order. This pins the MT row's actual text content
// without going through a full PDF render.
function collectTexts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(collectTexts)
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return collectTexts((node as { props?: { children?: unknown } }).props?.children)
  }
  return []
}

describe('niceAxisMax', () => {
  it('rounds small maxima up by one', () => {
    expect(niceAxisMax(4)).toBe(5)
  })
  it('rounds large maxima to a clean tick', () => {
    expect(niceAxisMax(4320)).toBe(5000)
  })
  it('never returns zero', () => {
    expect(niceAxisMax(0)).toBe(1)
  })
})

describe('fmtMt', () => {
  it('formats a positive value to one decimal', () => {
    expect(fmtMt(236.4)).toBe('236.4')
  })
  it('pads a whole number to one decimal', () => {
    expect(fmtMt(21)).toBe('21.0')
  })
  it('renders zero as a dash', () => {
    expect(fmtMt(0)).toBe('-')
  })
})

describe('VerticalGroupedBarChart', () => {
  it('renders a grid with an MT row to a non-empty PDF', async () => {
    const el = React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' },
      React.createElement(VerticalGroupedBarChart, {
        categories: [cat(), cat({ label: 'Ecom', approved: 4320, approvedMt: 259.2 })],
        metric: 'bags',
      }),
    ))
    const buf = await renderToBuffer(el as any)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('lists the MT approved row with one-decimal values, a dash for zero, under both metric modes', () => {
    // The metric prop selects what the BARS encode, not what the grid
    // reports — MT must appear identically whether bars are drawn in
    // sample counts (PSS) or bag counts (SS). This is the row's defining
    // requirement, so it's asserted for both 'count' and 'bags'.
    const categories: GroupedBarCategory[] = [
      cat(),
      cat({ label: 'Ecom', approved: 4320, approvedMt: 259.2 }),
      cat({ label: 'Zero', approvedMt: 0 }),
    ]
    for (const metric of ['bags', 'count'] as const) {
      // VerticalGroupedBarChart is a plain function component with no
      // hooks/context, so it can be invoked directly to get its element
      // tree without going through a renderer.
      const el = VerticalGroupedBarChart({ categories, metric })
      const texts = collectTexts(el)
      const mtIdx = texts.indexOf('MT approved')
      expect(mtIdx).toBeGreaterThanOrEqual(0)
      expect(texts.slice(mtIdx + 1, mtIdx + 1 + categories.length)).toEqual(['236.4', '259.2', '-'])
    }
  })
})
