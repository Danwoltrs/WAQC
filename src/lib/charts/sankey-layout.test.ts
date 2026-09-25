import { describe, it, expect } from 'vitest'
import {
  computeSankeyLayout,
  CHARCOAL_SANKEY_PALETTE,
  DEFAULT_SANKEY_PALETTE,
  SANKEY_COLORS,
  type SankeyInputNode,
} from './sankey-layout'
import { buildSankey } from '@/lib/report-data'

const nodes: SankeyInputNode[] = [
  { id: 'a', label: 'A', column: 0, approvalRate: 95 },
  { id: 'b', label: 'B', column: 0, approvalRate: 80 },
  { id: 'c', label: 'C', column: 0, approvalRate: 50 },
  { id: 'd', label: 'D', column: 0 },
  { id: 'x', label: 'X', column: 1 },
]
const links = ['a', 'b', 'c', 'd'].map(source => ({ source, target: 'x', value: 10 }))
const fillOf = (layout: ReturnType<typeof computeSankeyLayout>, id: string) => layout.nodes.find(n => n.id === id)!.fill

describe('computeSankeyLayout palettes', () => {
  it('keeps the olive bands and 0.35 link opacity by default', () => {
    const layout = computeSankeyLayout(nodes, links, { width: 400, height: 200 })
    expect(fillOf(layout, 'a')).toBe('#556b2f')
    expect(fillOf(layout, 'b')).toBe('#a9a454')
    expect(fillOf(layout, 'c')).toBe('#ef4444')
    expect(fillOf(layout, 'd')).toBe('#445763')
    expect(layout.links[0].strokeOpacity).toBe(0.35)
    expect(layout.palette).toEqual(DEFAULT_SANKEY_PALETTE)
    expect(SANKEY_COLORS.high).toBe('#556b2f')
  })

  it('applies the charcoal palette and a lighter link opacity when asked', () => {
    const layout = computeSankeyLayout(nodes, links, {
      width: 400, height: 200, palette: CHARCOAL_SANKEY_PALETTE, linkOpacity: 0.18,
    })
    expect(fillOf(layout, 'a')).toBe('#2F3337')
    expect(fillOf(layout, 'b')).toBe('#A3A6AA')
    expect(fillOf(layout, 'c')).toBe('#EF4444')
    expect(fillOf(layout, 'd')).toBe('#6B6E72')
    expect(layout.links.every(l => l.strokeOpacity === 0.18)).toBe(true)
    expect(layout.palette).toEqual(CHARCOAL_SANKEY_PALETTE)
  })

  it('reports the palette on an empty layout too', () => {
    const layout = computeSankeyLayout([], [], { width: 10, height: 10, palette: CHARCOAL_SANKEY_PALETTE })
    expect(layout.palette).toEqual(CHARCOAL_SANKEY_PALETTE)
  })
})

describe('buildSankey layout options', () => {
  it('passes width and palette through to the layout', () => {
    const row = {
      approval_date: '2026-06-01T00:00:00Z', certificate_number: 'X', exporter_name: 'EISA', seller_name: 'Ecom',
      importer_name: 'Ahold', importer_contract_nr: null, roaster_name: 'Unsold', container_nr: 'C1', ico_marks: null,
      bags: 320, mt: 19.2, is_rejected: false,
    }
    const { layout } = buildSankey([row], [], 'roaster', 'Ahold', 330, { width: 760, palette: CHARCOAL_SANKEY_PALETTE })
    expect(layout.width).toBe(760)
    expect(layout.height).toBe(330)
    expect(layout.palette).toEqual(CHARCOAL_SANKEY_PALETTE)
  })
})
