import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { VerticalGroupedBarChart, niceAxisMax, type GroupedBarCategory } from './vertical-grouped-bar-chart'

const cat = (over: Partial<GroupedBarCategory> = {}): GroupedBarCategory => ({
  label: 'Comexim',
  approved: 3940,
  rejected: 0,
  approvedMt: 236.4,
  rejectedMt: 0,
  rejectionRate: 0,
  ...over,
})

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
})
