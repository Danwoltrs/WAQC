import { describe, it, expect } from 'vitest'
import { highlightedKeys, washOut, CertificateFlavorWheel } from './certificate-flavor-wheel'
import { NODES } from '@/lib/cva/flavor-wheel-data'

describe('highlightedKeys', () => {
  it('lights the whole lineage of a pick, hub outward', () => {
    // Picking a leaf must light its family and subcategory too, so the wedge
    // reads as one radial band rather than a floating outer sliver.
    expect(highlightedKeys([['Nutty/Cocoa', 'Cocoa', 'Chocolate']])).toEqual(
      new Set(['Nutty/Cocoa', 'Nutty/Cocoa>Cocoa', 'Nutty/Cocoa>Cocoa>Chocolate']),
    )
  })

  it('lights only as deep as the cupper actually went', () => {
    // Stopping at the subcategory must NOT light the leaves beneath it — those
    // are flavours the cupper did not claim to have found.
    const lit = highlightedKeys([['Sweet', 'Brown Sugar']])
    expect(lit).toEqual(new Set(['Sweet', 'Sweet>Brown Sugar']))
    expect(lit.has('Sweet>Brown Sugar>Caramelized')).toBe(false)
  })

  it('merges overlapping picks without double-counting', () => {
    expect(
      highlightedKeys([
        ['Nutty/Cocoa', 'Cocoa', 'Chocolate'],
        ['Nutty/Cocoa', 'Cocoa', 'Dark Chocolate'],
      ]),
    ).toEqual(
      new Set([
        'Nutty/Cocoa',
        'Nutty/Cocoa>Cocoa',
        'Nutty/Cocoa>Cocoa>Chocolate',
        'Nutty/Cocoa>Cocoa>Dark Chocolate',
      ]),
    )
  })

  it('is empty for no picks, and survives malformed entries', () => {
    expect(highlightedKeys([]).size).toBe(0)
    expect(highlightedKeys([null as any, undefined as any]).size).toBe(0)
  })

  it('produces keys that actually match real wheel nodes', () => {
    // The guard that matters: the key format here must be the same
    // `path.join('>')` the renderer computes from NODES, or nothing lights up
    // and the wheel prints uniformly washed with no error anywhere.
    const nodeKeys = new Set(NODES.map((n) => n.path.join('>')))
    for (const key of highlightedKeys([['Nutty/Cocoa', 'Cocoa', 'Chocolate']])) {
      expect(nodeKeys.has(key)).toBe(true)
    }
  })
})

describe('washOut', () => {
  it('mixes a colour toward white without reaching it', () => {
    const out = washOut('#000000', 0.5)
    expect(out).toBe('#808080')
  })

  it('returns white at full wash and the colour itself at none', () => {
    expect(washOut('#3366cc', 1)).toBe('#ffffff')
    expect(washOut('#3366cc', 0)).toBe('#3366cc')
  })

  it('always emits a valid 6-digit hex, including for malformed input', () => {
    for (const node of NODES) {
      expect(washOut(node.color)).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(washOut('not-a-colour')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('CertificateFlavorWheel', () => {
  it('renders nothing when the cupper picked nothing', () => {
    // No empty ring on the certificate — the block simply does not appear.
    expect(CertificateFlavorWheel({ paths: [] })).toBeNull()
  })

  it('draws every wheel node, with the picked ones in full colour', () => {
    const el: any = CertificateFlavorWheel({ paths: [['Nutty/Cocoa', 'Cocoa', 'Chocolate']] })
    const paths = el.props.children as any[]
    expect(paths).toHaveLength(NODES.length)

    const byKey = new Map(paths.map((p: any) => [p.key, p.props.fill]))
    const chocolate = NODES.find((n) => n.path.join('>') === 'Nutty/Cocoa>Cocoa>Chocolate')!
    expect(byKey.get('Nutty/Cocoa>Cocoa>Chocolate')).toBe(chocolate.color)

    // An unpicked node is washed, not dropped and not left at full colour.
    const floral = NODES.find((n) => n.path.join('>') === 'Floral')!
    expect(byKey.get('Floral')).toBe(washOut(floral.color))
    expect(byKey.get('Floral')).not.toBe(floral.color)
  })
})
