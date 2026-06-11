import { describe, it, expect } from 'vitest'
import { WHEEL, NODES, TOTAL_LEAVES, leafCount, nodeAt, CX, CY, R0, R1, R2, R3 } from './flavor-wheel-data'

describe('wheel taxonomy', () => {
  it('has 9 families, 28 mid-ring nodes, 73 leaves = 110 nodes, 85 angular leaves', () => {
    expect(WHEEL).toHaveLength(9)
    expect(NODES.filter((n) => n.ring === 1)).toHaveLength(9)
    expect(NODES.filter((n) => n.ring === 2 || n.ring === 2.5)).toHaveLength(28)
    expect(NODES.filter((n) => n.ring === 3)).toHaveLength(73)
    expect(NODES).toHaveLength(110)
    expect(TOTAL_LEAVES).toBe(85)
  })

  it('family angular spans are contiguous and sum to a full circle', () => {
    const fams = NODES.filter((n) => n.ring === 1)
    const span = fams.reduce((s, f) => s + (f.a1 - f.a0), 0)
    expect(span).toBeCloseTo(Math.PI * 2, 10)
    for (let i = 1; i < fams.length; i++) expect(fams[i].a0).toBeCloseTo(fams[i - 1].a1, 10)
  })

  it('childless mid nodes (ring 2.5) span rings 2–3', () => {
    const oliveOil = NODES.find((n) => n.path.join('>') === 'Green/Vegetative>Olive Oil')!
    expect(oliveOil.ring).toBe(2.5)
    expect(oliveOil.r0).toBe(R1)
    expect(oliveOil.r1).toBe(R3)
    expect(leafCount({ n: 'x', c: '#000' })).toBe(1)
  })

  it('nodeAt hit-tests by angle and radius', () => {
    const berry = NODES.find((n) => n.path.join('>') === 'Fruity>Berry')!
    const mid = (berry.a0 + berry.a1) / 2
    const r = (berry.r0 + berry.r1) / 2
    expect(nodeAt(CX + Math.cos(mid) * r, CY + Math.sin(mid) * r)).toBe(berry)
    expect(nodeAt(CX, CY)).toBeNull()                       // hub
    expect(nodeAt(CX, CY - (R3 + 5))).toBeNull()            // outside rim
    expect(nodeAt(CX + Math.cos(mid) * (R0 + 1), CY + Math.sin(mid) * (R0 + 1))?.ring).toBe(1)
  })

  it('nodeAt at a ring-3 family boundary: upper bound is exclusive, next family owns the seam', () => {
    const fruityLeaves = NODES.filter((n) => n.family === 'Fruity' && n.ring === 3)
    const lastLeaf = fruityLeaves[fruityLeaves.length - 1]   // Citrus Fruit > Lime
    const rMid = (R2 + R3) / 2
    const inside = lastLeaf.a1 - 1e-6
    expect(nodeAt(CX + Math.cos(inside) * rMid, CY + Math.sin(inside) * rMid)).toBe(lastLeaf)
    const justPast = lastLeaf.a1 + 1e-9
    expect(nodeAt(CX + Math.cos(justPast) * rMid, CY + Math.sin(justPast) * rMid)?.family).toBe('Sour/Fermented')
  })
})

import { CATA_BOXES, cataForPick, cataForPicks } from './flavor-wheel-data'

describe('cataForPick — SCA-103 §6.3.4 derivation', () => {
  it('has exactly the 24 official boxes', () => {
    expect(CATA_BOXES.size).toBe(24)
    expect(CATA_BOXES.has('Vanilla/Vanillin')).toBe(true)
    expect(CATA_BOXES.has('Other')).toBe(true)
  })

  it('precise leaf checks its ancestors and becomes the free descriptor', () => {
    expect(cataForPick(['Fruity', 'Berry', 'Blueberry'])).toEqual({ boxes: ['Fruity', 'Berry'], free: 'Blueberry' })
  })

  it('aliases: Alcohol/Fermented→Fermented, Spices→Spice, Vanilla(+in)→Vanilla/Vanillin, Pipe Tobacco→Tobacco', () => {
    expect(cataForPick(['Sour/Fermented', 'Alcohol/Fermented', 'Winey'])).toEqual({
      boxes: ['Sour/Fermented', 'Fermented'], free: 'Winey',
    })
    expect(cataForPick(['Spices', 'Brown Spice', 'Clove'])).toEqual({ boxes: ['Spice'], free: 'Clove' })
    expect(cataForPick(['Sweet', 'Vanilla'])).toEqual({ boxes: ['Sweet', 'Vanilla/Vanillin'], free: null })
    expect(cataForPick(['Sweet', 'Vanillin'])).toEqual({ boxes: ['Sweet', 'Vanilla/Vanillin'], free: null })
    expect(cataForPick(['Roasted', 'Pipe Tobacco'])).toEqual({ boxes: ['Roasted', 'Tobacco'], free: null })
  })

  it('box-named leaves (Woody, Musty/Earthy, Fermented) check their own box, no free descriptor', () => {
    expect(cataForPick(['Other', 'Papery/Musty', 'Woody'])).toEqual({ boxes: ['Other', 'Woody'], free: null })
    expect(cataForPick(['Other', 'Papery/Musty', 'Musty/Earthy'])).toEqual({ boxes: ['Other', 'Musty/Earthy'], free: null })
    expect(cataForPick(['Sour/Fermented', 'Alcohol/Fermented', 'Fermented'])).toEqual({
      boxes: ['Sour/Fermented', 'Fermented'], free: null,
    })
  })

  it('non-box mid nodes contribute nothing: Other Fruit leaf derives only the family', () => {
    expect(cataForPick(['Fruity', 'Other Fruit', 'Peach'])).toEqual({ boxes: ['Fruity'], free: 'Peach' })
  })

  it('ring-1 pick checks only its family box, no free descriptor', () => {
    expect(cataForPick(['Floral'])).toEqual({ boxes: ['Floral'], free: null })
  })

  it('cataForPicks dedupes boxes across picks and collects frees', () => {
    const r = cataForPicks([
      { path: ['Fruity', 'Berry', 'Blueberry'] },
      { path: ['Fruity', 'Berry', 'Strawberry'] },
      { path: ['Fruity', 'Citrus Fruit', 'Lemon'] },
    ])
    expect(r.boxes).toEqual(['Fruity', 'Berry', 'Citrus Fruit'])
    expect(r.frees).toEqual(['Blueberry', 'Strawberry', 'Lemon'])
  })
})

import { addPickCapped, toggleCapped, OLF_CAP } from './flavor-wheel-data'

describe('caps', () => {
  const pick = (leaf: string) => ({ path: ['Fruity', 'Berry', leaf] })

  it('toggles an existing pick off', () => {
    const r = addPickCapped([pick('Blueberry')], pick('Blueberry'))
    expect(r.picks).toEqual([])
    expect(r.toggledOff).toBe(true)
    expect(r.removed).toBeNull()
  })

  it('appends under the cap', () => {
    const r = addPickCapped([pick('Blueberry')], pick('Strawberry'))
    expect(r.picks.map((p) => p.path[2])).toEqual(['Blueberry', 'Strawberry'])
    expect(r.removed).toBeNull()
  })

  it('replaces the oldest at the cap and reports it', () => {
    const five = ['A', 'B', 'C', 'D', 'E'].map(pick)
    const r = addPickCapped(five, pick('F'), OLF_CAP)
    expect(r.picks).toHaveLength(5)
    expect(r.picks.map((p) => p.path[2])).toEqual(['B', 'C', 'D', 'E', 'F'])
    expect(r.removed).toEqual(pick('A'))
  })

  it('toggleCapped: toggle off, append, replace-oldest at cap', () => {
    expect(toggleCapped(['Sweet'], 'Sweet', 2)).toEqual([])
    expect(toggleCapped(['Sweet'], 'Bitter', 2)).toEqual(['Sweet', 'Bitter'])
    expect(toggleCapped(['Sweet', 'Bitter'], 'Umami', 2)).toEqual(['Bitter', 'Umami'])
  })
})
