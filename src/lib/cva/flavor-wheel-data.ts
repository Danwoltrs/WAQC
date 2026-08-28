// SCA/WCR Coffee Taster's Flavor Wheel — full taxonomy, geometry, and official
// CATA-box derivation (SCA-103 §6.3). Pure data + pure functions; no React.

import type { WheelPick } from '@/types/cva'

export interface WheelNodeDef { n: string; c: string; k?: WheelNodeDef[] }

export const WHEEL: readonly WheelNodeDef[] = [
  { n: 'Floral', c: '#e0479e', k: [
    { n: 'Black Tea', c: '#9d6a8e' },
    { n: 'Floral', c: '#e961a5', k: [{ n: 'Chamomile', c: '#f0b432' }, { n: 'Rose', c: '#ef7ca2' }, { n: 'Jasmine', c: '#f2e8d2' }] }] },
  { n: 'Fruity', c: '#d6273e', k: [
    { n: 'Berry', c: '#d6325c', k: [{ n: 'Blackberry', c: '#2b2030' }, { n: 'Raspberry', c: '#e0218a' }, { n: 'Blueberry', c: '#7177c8' }, { n: 'Strawberry', c: '#e23c47' }] },
    { n: 'Dried Fruit', c: '#a64a6e', k: [{ n: 'Raisin', c: '#8d4585' }, { n: 'Prune', c: '#6f4b75' }] },
    { n: 'Other Fruit', c: '#e86450', k: [{ n: 'Coconut', c: '#d8a886' }, { n: 'Cherry', c: '#d2243f' }, { n: 'Pomegranate', c: '#e85f77' }, { n: 'Pineapple', c: '#f2a93b' }, { n: 'Grape', c: '#a3bb45' }, { n: 'Apple', c: '#7fb24a' }, { n: 'Peach', c: '#f0955d' }, { n: 'Pear', c: '#c4cf4f' }] },
    { n: 'Citrus Fruit', c: '#f1a52f', k: [{ n: 'Grapefruit', c: '#f07568' }, { n: 'Orange', c: '#ef8c2d' }, { n: 'Lemon', c: '#f4d22e' }, { n: 'Lime', c: '#a9c93f' }] }] },
  { n: 'Sour/Fermented', c: '#e3c52e', k: [
    { n: 'Sour', c: '#e7d93c', k: [{ n: 'Sour Aromatics', c: '#d9d33e' }, { n: 'Acetic Acid', c: '#c4cf3a' }, { n: 'Butyric Acid', c: '#b8c542' }, { n: 'Isovaleric Acid', c: '#aebd3f' }, { n: 'Citric Acid', c: '#d3d23a' }, { n: 'Malic Acid', c: '#c9d04a' }] },
    { n: 'Alcohol/Fermented', c: '#b9a33b', k: [{ n: 'Winey', c: '#8c2f51' }, { n: 'Whiskey', c: '#a26430' }, { n: 'Fermented', c: '#b08e3a' }, { n: 'Overripe', c: '#9c8136' }] }] },
  { n: 'Green/Vegetative', c: '#187a33', k: [
    { n: 'Olive Oil', c: '#a3a73a' },
    { n: 'Raw', c: '#6f8f3c' },
    { n: 'Green/Vegetative', c: '#2c9e48', k: [{ n: 'Under-ripe', c: '#9ebf6a' }, { n: 'Peapod', c: '#7fb45a' }, { n: 'Fresh', c: '#3fae5b' }, { n: 'Dark Green', c: '#1d6e35' }, { n: 'Vegetative', c: '#2f8f44' }, { n: 'Hay-like', c: '#b9c46a' }, { n: 'Herb-like', c: '#86ad4f' }] },
    { n: 'Beany', c: '#7e9a63' }] },
  { n: 'Other', c: '#2d8fc4', k: [
    { n: 'Papery/Musty', c: '#aebdc4', k: [{ n: 'Stale', c: '#c8b69a' }, { n: 'Cardboard', c: '#b39b7e' }, { n: 'Papery', c: '#e4ded2' }, { n: 'Woody', c: '#6e5132' }, { n: 'Moldy/Damp', c: '#8a9a84' }, { n: 'Musty/Dusty', c: '#b3a68c' }, { n: 'Musty/Earthy', c: '#7a6a4f' }, { n: 'Animalic', c: '#8c7a5c' }, { n: 'Meaty Brothy', c: '#b07a64' }, { n: 'Phenolic', c: '#857a8c' }] },
    { n: 'Chemical', c: '#62b6d9', k: [{ n: 'Bitter', c: '#7fc3bf' }, { n: 'Salty', c: '#dfe6e9' }, { n: 'Medicinal', c: '#74a8c4' }, { n: 'Petroleum', c: '#1f7ea8' }, { n: 'Skunky', c: '#4b7b8c' }, { n: 'Rubber', c: '#23303f' }] }] },
  { n: 'Roasted', c: '#c4452c', k: [
    { n: 'Pipe Tobacco', c: '#8a5a35' },
    { n: 'Tobacco', c: '#a8743f' },
    { n: 'Burnt', c: '#9c5b32', k: [{ n: 'Acrid', c: '#a8987a' }, { n: 'Ashy', c: '#9aa08e' }, { n: 'Smoky', c: '#b08a52' }, { n: 'Brown, Roast', c: '#6e4a26' }] },
    { n: 'Cereal', c: '#d9a440', k: [{ n: 'Grain', c: '#d9b87a' }, { n: 'Malt', c: '#e0a45c' }] }] },
  { n: 'Spices', c: '#a32638', k: [
    { n: 'Pungent', c: '#6e3c5a' },
    { n: 'Pepper', c: '#c42b3a' },
    { n: 'Brown Spice', c: '#b04a45', k: [{ n: 'Anise', c: '#c4a83a' }, { n: 'Nutmeg', c: '#8a2e2a' }, { n: 'Cinnamon', c: '#d98a3d' }, { n: 'Clove', c: '#b98a2e' }] }] },
  { n: 'Nutty/Cocoa', c: '#9c7a5e', k: [
    { n: 'Nutty', c: '#b08a5c', k: [{ n: 'Peanuts', c: '#e3c12e' }, { n: 'Hazelnut', c: '#9c6a3a' }, { n: 'Almond', c: '#e8c9b4' }] },
    { n: 'Cocoa', c: '#a3672f', k: [{ n: 'Chocolate', c: '#6e3a26' }, { n: 'Dark Chocolate', c: '#3f241a' }] }] },
  { n: 'Sweet', c: '#ef8231', k: [
    { n: 'Brown Sugar', c: '#d87f93', k: [{ n: 'Molasses', c: '#2a1f1a' }, { n: 'Maple Syrup', c: '#b46a32' }, { n: 'Caramelized', c: '#e8a43b' }, { n: 'Honey', c: '#ef9c2d' }] },
    { n: 'Vanilla', c: '#d98a9a' },
    { n: 'Vanillin', c: '#e8b4c4' },
    { n: 'Overall Sweet', c: '#e85d8a' },
    { n: 'Sweet Aromatics', c: '#c45d74' }] },
]

/* ---------- geometry ---------- */

export const VIEW = 440
export const CX = 220
export const CY = 220
export const R0 = 58   // hub
export const R1 = 106  // family ring outer edge
export const R2 = 158  // subcategory ring outer edge
export const R3 = 212  // leaf ring outer edge
const TAU = Math.PI * 2

export interface WheelNode {
  name: string
  color: string
  path: string[]
  a0: number
  a1: number
  r0: number
  r1: number
  /** 1 = family, 2 = subcategory, 2.5 = childless mid (spans rings 2–3), 3 = leaf */
  ring: 1 | 2 | 2.5 | 3
  family: string
}

export function leafCount(nd: WheelNodeDef): number {
  return nd.k ? nd.k.reduce((s, c) => s + leafCount(c), 0) : 1
}

export const TOTAL_LEAVES = WHEEL.reduce((s, c) => s + leafCount(c), 0)

export const NODES: readonly WheelNode[] = (() => {
  const out: WheelNode[] = []
  const u = TAU / TOTAL_LEAVES
  let a = -Math.PI / 2
  for (const cat of WHEEL) {
    const a0 = a
    const a1 = a + leafCount(cat) * u
    out.push({ name: cat.n, color: cat.c, path: [cat.n], a0, a1, r0: R0, r1: R1, ring: 1, family: cat.n })
    let b = a0
    for (const mid of cat.k ?? []) {
      const b1 = b + leafCount(mid) * u
      if (mid.k) {
        out.push({ name: mid.n, color: mid.c, path: [cat.n, mid.n], a0: b, a1: b1, r0: R1, r1: R2, ring: 2, family: cat.n })
        let c0 = b
        for (const leaf of mid.k) {
          out.push({ name: leaf.n, color: leaf.c, path: [cat.n, mid.n, leaf.n], a0: c0, a1: c0 + u, r0: R2, r1: R3, ring: 3, family: cat.n })
          c0 += u
        }
      } else {
        out.push({ name: mid.n, color: mid.c, path: [cat.n, mid.n], a0: b, a1: b1, r0: R1, r1: R3, ring: 2.5, family: cat.n })
      }
      b = b1
    }
    a = a1
  }
  return out
})()

/**
 * SVG path for one annular sector (a wheel wedge), in viewBox coordinates.
 *
 * Lives here with the rest of the geometry because two very different
 * renderers draw the same wheel from it: the interactive FlavorWheel in the
 * browser, and the certificate's PDF wheel. Keeping one implementation is what
 * guarantees the printed wheel is the same wheel the cupper clicked.
 */
export function arcPathD(r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r1, a0)
  const [x1, y1] = p(r1, a1)
  const [x2, y2] = p(r0, a1)
  const [x3, y3] = p(r0, a0)
  return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`
}

/** Mathematical hit-test in viewBox coordinates (no DOM). Null in the hub or outside the rim. */
export function nodeAt(x: number, y: number): WheelNode | null {
  const dx = x - CX
  const dy = y - CY
  const r = Math.hypot(dx, dy)
  if (r <= R0 || r >= R3) return null
  let th = Math.atan2(dy, dx)
  while (th < -Math.PI / 2) th += TAU
  while (th >= TAU - Math.PI / 2) th -= TAU
  return NODES.find((nd) => th >= nd.a0 && th < nd.a1 && r >= nd.r0 && r < nd.r1) ?? null
}

/* ---------- official CATA derivation (SCA-103 §6.3, form p.10) ---------- */

/** The 24 checkboxes on the official Descriptive Form (fragrance/aroma + flavor/aftertaste boxes). */
export const CATA_BOXES: ReadonlySet<string> = new Set([
  'Floral',
  'Fruity', 'Berry', 'Dried Fruit', 'Citrus Fruit',
  'Sour/Fermented', 'Sour', 'Fermented',
  'Green/Vegetative',
  'Other', 'Chemical', 'Musty/Earthy', 'Woody',
  'Roasted', 'Cereal', 'Burnt', 'Tobacco',
  'Nutty/Cocoa', 'Nutty', 'Cocoa',
  'Spice',
  'Sweet', 'Vanilla/Vanillin', 'Brown Sugar',
])

/** Wheel nodes whose names differ from their official box. */
export const BOX_ALIAS: Record<string, string> = {
  'Alcohol/Fermented': 'Fermented',
  Spices: 'Spice',
  Vanilla: 'Vanilla/Vanillin',
  Vanillin: 'Vanilla/Vanillin',
  'Pipe Tobacco': 'Tobacco',
}

export const MAIN_TASTES = ['Salty', 'Sour', 'Sweet', 'Bitter', 'Umami'] as const
export const MOUTH_CATA = [
  { name: 'Rough', sub: 'Gritty, Chalky, Sandy' },
  { name: 'Oily', sub: '' },
  { name: 'Smooth', sub: 'Velvety, Silky, Syrupy' },
  { name: 'Mouth-Drying', sub: '' },
  { name: 'Metallic', sub: '' },
] as const

export const OLF_CAP = 5   // wheel picks per olfactory group (SCA-103 §6.3.1/6.3.2)
export const TASTE_CAP = 2 // main tastes (§6.3.2)
export const MOUTH_CAP = 2 // mouthfeel options (§6.3.3)

/**
 * Derive the official boxes for one pick. Every path element matching a box
 * (directly or via alias) checks it; boxes return in path order (family →
 * subcategory → leaf). The leaf becomes the freely-elicited descriptor ONLY
 * if it matched no box — Fermented/Woody/Musty-Earthy are leaves that ARE
 * boxes and produce no free descriptor (spec §2 exception).
 */
export function cataForPick(path: string[]): { boxes: string[]; free: string | null } {
  const boxes: string[] = []
  for (const name of path) {
    const mapped = BOX_ALIAS[name] ?? name
    if (CATA_BOXES.has(mapped) && !boxes.includes(mapped)) boxes.push(mapped)
  }
  const last = path[path.length - 1]
  const lastMapped = BOX_ALIAS[last] ?? last
  return { boxes, free: CATA_BOXES.has(lastMapped) ? null : last }
}

/** Derivation across a whole group's picks: deduped boxes in pick order + all free descriptors. */
export function cataForPicks(picks: WheelPick[]): { boxes: string[]; frees: string[] } {
  const boxes: string[] = []
  const frees: string[] = []
  for (const p of picks) {
    const r = cataForPick(p.path)
    for (const b of r.boxes) if (!boxes.includes(b)) boxes.push(b)
    if (r.free) frees.push(r.free)
  }
  return { boxes, frees }
}

export const pickKey = (p: WheelPick) => p.path.join('>')

/**
 * Toggle a wheel pick with the replace-oldest cap (journey prototype OLF_CAP behavior).
 * Returns the new list, the pick that was evicted (for the toast), and whether
 * this was a toggle-off of an existing pick.
 */
export function addPickCapped(
  picks: WheelPick[],
  pick: WheelPick,
  cap: number = OLF_CAP,
): { picks: WheelPick[]; removed: WheelPick | null; toggledOff: boolean } {
  const key = pickKey(pick)
  const existing = picks.findIndex((p) => pickKey(p) === key)
  if (existing >= 0) return { picks: picks.filter((_, i) => i !== existing), removed: null, toggledOff: true }
  if (picks.length >= cap) return { picks: [...picks.slice(1), pick], removed: picks[0], toggledOff: false }
  return { picks: [...picks, pick], removed: null, toggledOff: false }
}

/** Same replace-oldest semantics for the simple string CATA lists (main tastes, mouthfeel). */
export function toggleCapped(list: string[], item: string, cap: number): string[] {
  if (list.includes(item)) return list.filter((x) => x !== item)
  if (list.length >= cap) return [...list.slice(1), item]
  return [...list, item]
}
