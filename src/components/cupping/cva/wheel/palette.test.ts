import { describe, it, expect } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { PALETTE, SURFACE, contrastRatio, mutedColor, labelColor, relativeLuminance, hexToRgb, rgbToHex } from './palette'

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

  it('muted variants are less saturated and closer to the surface than the original', () => {
    const src = '#d6273e'
    const m = mutedColor(src)
    const sat = (hex: string) => { const [r, g, b] = hexToRgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx }
    expect(sat(m)).toBeLessThan(sat(src) * 0.5)
    const dist = (a: string, b: string) => { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }
    expect(dist(m, SURFACE)).toBeLessThan(dist(src, SURFACE))
    expect(m).not.toBe(SURFACE)  // still colour-identifiable
  })

  it('labelColor is dark on light fills and light on dark fills', () => {
    expect(labelColor('#f2e8d2')).toBe('#000000')
    expect(labelColor('#2b2030')).toBe('#ffffff')
  })
})
