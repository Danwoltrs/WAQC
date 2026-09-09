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

import { CATA_BOXES, FORM_BOXES, cataForPick, cataForPicks } from './flavor-wheel-data'

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

import { addPickCapped, addPickBoxCapped, toggleCapped, OLF_CAP, BOX_CAP } from './flavor-wheel-data'

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

describe('FORM_BOXES — the §8.2 form layout', () => {
  it('is exactly CATA_BOXES, grouped and ordered as the printed form', () => {
    // The flat set says WHICH boxes exist; it cannot say what order they print
    // in or which sit indented under which family. A list view built from the
    // set alone would invent a layout, so the ordering is data — and asserted
    // against the set here so the two can never drift apart.
    const flat = FORM_BOXES.flatMap((g) => [g.head, ...g.subs])
    expect(new Set(flat)).toEqual(CATA_BOXES)
    expect(flat).toHaveLength(CATA_BOXES.size)
    expect(FORM_BOXES.map((g) => g.head)).toEqual([
      'Floral', 'Fruity', 'Sour/Fermented', 'Green/Vegetative', 'Other',
      'Roasted', 'Nutty/Cocoa', 'Spice', 'Sweet',
    ])
  })

  it('indents the sub-boxes the form indents, and only those', () => {
    const subs = Object.fromEntries(FORM_BOXES.map((g) => [g.head, g.subs]))
    expect(subs.Fruity).toEqual(['Berry', 'Dried Fruit', 'Citrus Fruit'])
    expect(subs.Sweet).toEqual(['Vanilla/Vanillin', 'Brown Sugar'])
    expect(subs.Floral).toEqual([])
    expect(subs['Green/Vegetative']).toEqual([])
  })

  it('every head is a wheel family, so a box can carry its family colour', () => {
    // 'Spice' is the one that differs: the wheel names that family 'Spices'.
    const families = new Set(WHEEL.map((f) => f.n))
    for (const g of FORM_BOXES) expect(families.has(g.head) || g.head === 'Spice', g.head).toBe(true)
  })
})

describe('addPickBoxCapped — §6.3.1 caps the LIST, not the picks', () => {
  const berry = (leaf: string) => ({ path: ['Fruity', 'Berry', leaf] })
  const boxesOf = (ps: { path: string[] }[]) => cataForPicks(ps).boxes

  it('lets a cupper stay precise inside one family for free', () => {
    // Four berries tick only Fruity + Berry, so none of them is near the cap —
    // the old pick-cap called this "4 of 5 used".
    let picks: { path: string[] }[] = []
    for (const leaf of ['Blackberry', 'Raspberry', 'Blueberry', 'Strawberry']) {
      const r = addPickBoxCapped(picks, berry(leaf))
      expect(r.refused, leaf).toBeNull()
      picks = r.picks
    }
    expect(picks).toHaveLength(4)
    expect(boxesOf(picks)).toEqual(['Fruity', 'Berry'])
  })

  it('refuses the pick that would push the form past five boxes, and names it', () => {
    // Each of these ticks two boxes, so the third one is the fifth and sixth.
    const a = { path: ['Fruity', 'Berry', 'Blueberry'] }
    const b = { path: ['Sweet', 'Brown Sugar', 'Honey'] }
    const c = { path: ['Nutty/Cocoa', 'Cocoa', 'Chocolate'] }
    const two = addPickBoxCapped(addPickBoxCapped([], a).picks, b)
    expect(boxesOf(two.picks)).toHaveLength(4)
    const third = addPickBoxCapped(two.picks, c)
    expect(third.picks).toEqual(two.picks)          // nothing added
    expect(third.refused).toBe('Nutty/Cocoa')       // the box that broke the cap
  })

  it('allows a pick that lands exactly on the cap', () => {
    const a = { path: ['Fruity', 'Berry', 'Blueberry'] }
    const b = { path: ['Sweet', 'Brown Sugar', 'Honey'] }
    const c = { path: ['Floral'] }                  // one box — takes it to exactly 5
    const r = addPickBoxCapped(addPickBoxCapped(addPickBoxCapped([], a).picks, b).picks, c)
    expect(r.refused).toBeNull()
    expect(boxesOf(r.picks)).toHaveLength(BOX_CAP)
  })

  it('toggling an existing pick off is never refused, even at the cap', () => {
    const a = { path: ['Fruity', 'Berry', 'Blueberry'] }
    const b = { path: ['Sweet', 'Brown Sugar', 'Honey'] }
    const at = addPickBoxCapped(addPickBoxCapped([], a).picks, b)
    const off = addPickBoxCapped(at.picks, a)
    expect(off.toggledOff).toBe(true)
    expect(off.refused).toBeNull()
    expect(off.picks).toEqual([b])
  })

  it('BOX_CAP is the standard\'s five', () => {
    expect(BOX_CAP).toBe(5)
  })
})
