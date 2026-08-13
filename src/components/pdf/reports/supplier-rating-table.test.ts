import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToBuffer, Document, Page } from '@react-pdf/renderer'
import '@/components/pdf/certificate/certificate-styles'
import { SupplierRatingTables } from './supplier-rating-table'
import type { SupplierRatingRow } from '@/lib/reports/supplier-ratings'

const r = (over: Partial<SupplierRatingRow> = {}): SupplierRatingRow => ({
  rank: 1, name: 'Comexim', total: 41, pss: 12, ss: 29, approvalRate: 100, ...over,
})

const page = (el: React.ReactElement) =>
  React.createElement(Document, {}, React.createElement(Page, { size: 'A4', orientation: 'landscape' }, el))

// Flatten every string/number leaf under a node, resolving nested function
// components along the way (react-pdf primitives like View/Text carry a
// plain string `type` — 'VIEW', 'TEXT' — so only actual function components
// like the private RatingTable sub-component hit that branch).
function flattenLeaves(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(flattenLeaves)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown } }
    if (typeof type === 'function') return flattenLeaves((type as (p: unknown) => unknown)(props))
    return flattenLeaves(props?.children)
  }
  return []
}

// Walk the React element tree returned by a plain function component (no
// hooks/context, so it's safe to call directly) and collect one text token
// per rendered <Text>, in document order. Mirrors the pattern in
// vertical-grouped-bar-chart.test.ts, but joins a Text node's children (e.g.
// `{rate}%` compiles to two JSX children) into one string, matching how
// react-pdf actually lays a Text node's children out as a single run.
function collectTexts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (Array.isArray(node)) return node.flatMap(collectTexts)
  if (typeof node === 'object' && 'type' in (node as Record<string, unknown>)) {
    const { type, props } = node as { type: unknown; props?: { children?: unknown } }
    if (typeof type === 'function') return collectTexts((type as (p: unknown) => unknown)(props))
    if (type === 'TEXT') {
      const leaves = flattenLeaves(props?.children)
      return leaves.length > 0 ? [leaves.join('')] : []
    }
    return collectTexts(props?.children)
  }
  return []
}

describe('SupplierRatingTables', () => {
  it('returns null when both sides are empty', () => {
    // SupplierRatingTables has no hooks/context, so it can be called
    // directly as a plain function to inspect its return value.
    const el = SupplierRatingTables({ shippers: [], sellers: [], windowLabel: 'Jan 01 – Jul 31' })
    expect(el).toBeNull()
  })

  it('renders a row\'s cells in order: rank, name, certs, pss, ss, approval rate as a percentage', () => {
    const el = SupplierRatingTables({
      shippers: [r({ rank: 1, name: 'Comexim', total: 41, pss: 12, ss: 29, approvalRate: 97 })],
      sellers: [],
      windowLabel: 'Jan 01 – Jul 31',
    })
    const texts = collectTexts(el)
    const nameIdx = texts.indexOf('Comexim')
    expect(nameIdx).toBeGreaterThan(0)
    expect(texts[nameIdx - 1]).toBe('1') // rank cell precedes the name cell
    expect(texts.slice(nameIdx + 1, nameIdx + 5)).toEqual(['41', '12', '29', '97%'])
  })

  it('renders a dash for a zero PSS or SS count', () => {
    const el = SupplierRatingTables({
      shippers: [r({ name: 'AllPSS', total: 10, pss: 10, ss: 0, approvalRate: 100 })],
      sellers: [r({ name: 'AllSS', total: 10, pss: 0, ss: 10, approvalRate: 100 })],
      windowLabel: 'Jan 01 – Jul 31',
    })
    const texts = collectTexts(el)
    const allPssIdx = texts.indexOf('AllPSS')
    expect(texts.slice(allPssIdx + 1, allPssIdx + 5)).toEqual(['10', '10', '-', '100%'])
    const allSsIdx = texts.indexOf('AllSS')
    expect(texts.slice(allSsIdx + 1, allSsIdx + 5)).toEqual(['10', '-', '10', '100%'])
  })

  it('truncates each table at the given limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => r({ rank: i + 1, name: `Shipper ${i}` }))
    const el = SupplierRatingTables({ shippers: many, sellers: [], windowLabel: 'Jan 01 – Jul 31', limit: 3 })
    const texts = collectTexts(el)
    expect(texts).toContain('Shipper 0')
    expect(texts).toContain('Shipper 1')
    expect(texts).toContain('Shipper 2')
    expect(texts).not.toContain('Shipper 3')
  })

  it('defaults the limit to 8 rows when not specified', () => {
    const many = Array.from({ length: 20 }, (_, i) => r({ rank: i + 1, name: `Shipper ${i}` }))
    const el = SupplierRatingTables({ shippers: many, sellers: [], windowLabel: 'Jan 01 – Jul 31' })
    const texts = collectTexts(el)
    expect(texts).toContain('Shipper 7')
    expect(texts).not.toContain('Shipper 8')
  })

  it('shows a placeholder for a side with no rows instead of an empty table', () => {
    const el = SupplierRatingTables({
      shippers: [r()],
      sellers: [],
      windowLabel: 'Jan 01 – Jul 31',
    })
    const texts = collectTexts(el)
    expect(texts).toContain('No certificates this year.')
  })

  it('renders a real PDF document end to end', async () => {
    const buf = await renderToBuffer(page(React.createElement(SupplierRatingTables, {
      shippers: [r(), r({ rank: 2, name: 'Ecom', approvalRate: 97 })],
      sellers: [r({ name: 'Volcafe CH' })],
      windowLabel: 'Jan 01 – Jul 31',
    })) as any)
    expect(buf.length).toBeGreaterThan(1000)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})
