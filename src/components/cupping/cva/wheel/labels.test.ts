import { describe, it, expect, vi } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { LABELS, splitLabel, arcLengthPx, visibleLabelKeys, ringFontSizes, labelFits, estimateWidth, MIN_ARC_PX, MIN_LABEL_PX, MAX_LABEL_PX, measureLabels, LABEL_WIDTHS } from './labels'

const desktop = { width: 1200, height: 1200 }   // f = 2.727
const phone = { width: 390, height: 600 }       // f = 0.886

describe('labels', () => {
  it('has one geometry per node, arc labels only for the two curved families', () => {
    expect(LABELS).toHaveLength(NODES.length)
    const arcs = LABELS.map((l, i) => [l.kind, NODES[i].name] as const).filter(([k]) => k === 'arc').map(([, n]) => n)
    expect(arcs.sort()).toEqual(['Green/Vegetative', 'Sour/Fermented'])
  })

  it('splitLabel wraps at the slash, then the most central space, else not at all', () => {
    expect(splitLabel('Sour/Fermented', 11)).toEqual(['Sour/', 'Fermented'])
    expect(splitLabel('Citrus Fruit', 11)).toEqual(['Citrus', 'Fruit'])
    expect(splitLabel('Sweet Aromatics', 22)).toEqual(['Sweet Aromatics'])
  })

  it('arc length scales with the camera', () => {
    const leaf = NODES.find((n) => n.ring === 3)!
    expect(arcLengthPx(leaf, desktop, 2)).toBeCloseTo(arcLengthPx(leaf, desktop, 1) * 2, 6)
  })

  it('at 1x on a phone leaf labels are hidden; at 3x they show (arc ≥ 14 px)', () => {
    const leaf = NODES.find((n) => n.ring === 3)!
    expect(arcLengthPx(leaf, phone, 1)).toBeLessThan(MIN_ARC_PX)
    expect(visibleLabelKeys(phone, 1).has(leaf.path.join('>'))).toBe(false)
    expect(arcLengthPx(leaf, phone, 3)).toBeGreaterThanOrEqual(MIN_ARC_PX)
    expect(visibleLabelKeys(phone, 3).has(leaf.path.join('>'))).toBe(true)
  })

  it('visibility is geometry alone — focusing a family no longer hides the rest (Daniel 2026-09-03)', () => {
    const keys = visibleLabelKeys(desktop, 1.5)
    const fams = new Set([...keys].map((k) => k.split('>')[0]))
    expect(fams.size).toBeGreaterThan(5)              // the whole wheel stays labelled while one family is framed
    for (const f of ['Fruity', 'Roasted', 'Sweet']) expect(fams.has(f), f).toBe(true)
    // zooming only ever ADDS labels: every label visible at rest is still visible at 1.5x
    for (const k of visibleLabelKeys(desktop, 1)) expect(keys.has(k), k).toBe(true)
  })

  it('at REST every ring renders between 11 and 15 px on any wheel', () => {
    for (const vp of [phone, desktop]) {
      const f = Math.min(vp.width, vp.height) / 440
      const fs = ringFontSizes(vp, 1)
      for (const v of [fs.r1, fs.r2, fs.r3]) {
        expect(v * f).toBeGreaterThanOrEqual(MIN_LABEL_PX - 1e-6)
        expect(v * f).toBeLessThanOrEqual(MAX_LABEL_PX + 1e-6)
      }
    }
  })

  it('zooming scales the labels with their wedges — the 15 px cap is a rest rule (Daniel 2026-09-03)', () => {
    const f = desktop.width / 440
    // the family ring sits at the cap at rest on a desktop wheel: 1.5× must render 22.5 px, not hold at 15
    expect(ringFontSizes(desktop, 1).r1 * f).toBeCloseTo(MAX_LABEL_PX, 6)
    expect(ringFontSizes(desktop, 1.5).r1 * f * 1.5).toBeCloseTo(MAX_LABEL_PX * 1.5, 6)
    // i.e. the scene-unit size does not change across the zoom
    expect(ringFontSizes(desktop, 1.5).r1).toBeCloseTo(ringFontSizes(desktop, 1).r1, 6)
    // an uncapped ring just keeps its natural size at every zoom
    expect(ringFontSizes(desktop, 1.5).r3).toBeCloseTo(4.9, 6)
  })

  it('the 11 px floor still protects small wheels; a phone leaf at 3× is its natural size', () => {
    const f = phone.width / 440
    expect(ringFontSizes(phone, 1).r1 * f).toBeCloseTo(MIN_LABEL_PX, 6)          // 7 × 0.886 = 6.2 → floored
    expect(ringFontSizes(phone, 3).r3 * f * 3).toBeCloseTo(4.9 * f * 3, 6)      // 13 px, inside [11, 45]
  })

  it('fit uses the estimate when nothing was measured, and a long radial label fails in a shallow ring', () => {
    expect(estimateWidth('Isovaleric Acid')).toBeGreaterThan(estimateWidth('Lime'))
    const iso = NODES.find((n) => n.name === 'Isovaleric Acid')!
    expect(labelFits(iso, phone, 3)).toBe(true)     // ring depth 54 units × 0.886 × 3 = 143 px
    expect(labelFits(iso, phone, 1)).toBe(false)    // 48 px of depth cannot hold it at 11 px
  })

  it('measureLabels with a stubbed canvas measures text widths and changes fit behavior', () => {
    // Stub canvas.getContext to return a mock with measureText
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (t: string) => ({ width: t.length * 7 })
    } as any)

    // Call measureLabels on an empty map
    const result = measureLabels()
    expect(result.size).toBeGreaterThan(0)

    // Check that Isovaleric Acid was measured correctly: 15 chars * 7 = 105 px
    expect(LABEL_WIDTHS.get('Isovaleric Acid')).toBe(15 * 7)

    // With measured width, labelFits should change behavior
    // 105 px at 10 px → 105 * 1.3 = 136.5 px vs ring depth 54 * 0.886 * 3 - 10 ≈ 133.5 px
    const iso = NODES.find((n) => n.name === 'Isovaleric Acid')!
    expect(labelFits(iso, phone, 3)).toBe(false)    // Now fails with measured widths

    // Clean up
    LABEL_WIDTHS.clear()
    spy.mockRestore()
  })

  it('measureLabels with null context returns empty map without throwing', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    const result = measureLabels()
    expect(result.size).toBe(0)

    spy.mockRestore()
  })
})
