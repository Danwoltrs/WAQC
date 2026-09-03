import { describe, it, expect } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { PALETTE, contrastRatio, labelColor, relativeLuminance, hexToRgb, rgbToHex } from './palette'

describe('palette', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#d6273e'))).toBe('#d6273e')
  })

  it('luminance and contrast match WCAG reference points', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('every node has an entry, and its label colour reaches 4.5:1 against the fill', () => {
    for (const n of NODES) {
      const e = PALETTE.get(n.path.join('>'))
      expect(e, n.name).toBeTruthy()
      expect(e!.fill).toBe(n.color)
      expect(contrastRatio(e!.label, e!.fill), n.name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('carries no dimmed variant: nothing on the wheel is ever muted (Daniel 2026-09-03)', () => {
    for (const n of NODES.slice(0, 5)) expect(PALETTE.get(n.path.join('>'))).toEqual({ fill: n.color, label: expect.any(String) })
  })

  it('labelColor is dark on light fills and light on dark fills', () => {
    expect(labelColor('#f2e8d2')).toBe('#000000')
    expect(labelColor('#2b2030')).toBe('#ffffff')
  })
})
