# CVA Phase 2 — Describe the Cup + SCA Flavor Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the full SCA-103 descriptive assessment to the CVA journey — the interactive 110-node flavor wheel (locked v8 interaction), per-section 0–15 intensity tap-tracks, main tastes, mouthfeel CATA, and free notes — persisting through the existing per-sample assessment autosave.

**Architecture:** Pure data + pure logic first (`flavor-wheel-data.ts`, `zoom-machine.ts`), then leaf components (IntensityTrack, MainTastes, MouthfeelCata, FlavorWheel), then the DescribeOverlay host, then wiring into `useCvaSession` / `SectionScreen` / `CvaJourney`. No API or DB changes — `describe` rides the existing `CvaAssessment` blob.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Tailwind + scoped `.cva-*` CSS in `globals.css`, hand-rolled SVG (no D3), Vitest + Testing Library (jsdom).

**Authoritative references (read before coding):**
- Spec: `docs/superpowers/specs/2026-06-11-cva-flavor-wheel-describe-design.md`
- Locked wheel prototype (interaction + constants are normative): `docs/superpowers/specs/prototypes/cva-flavor-wheel-prototype.html`
- Overlay layout reference (minus voicebox): `docs/superpowers/specs/prototypes/cva-cupping-prototype.html`

**Verification commands (this repo):** `npx tsc --noEmit` and `npx vitest run` (or `npm run test:run`). NEVER `npm test` (watch mode). `npm run build` fails locally on offline Google Fonts — do not use it as a gate.

**Workflow:** trunk-based — commit directly to `main` after each task. 156 tests pass before this plan starts; the count only goes up.

---

## File structure

| File | Responsibility |
|---|---|
| Create `src/lib/cva/flavor-wheel-data.ts` | Taxonomy (110 nodes + colors), geometry layout, hit-test, CATA derivation, caps. Pure data + pure functions. |
| Create `src/lib/cva/flavor-wheel-data.test.ts` | Unit tests for the above. |
| Create `src/components/cupping/cva/wheel/zoom-machine.ts` | Pure dwell/zoom state machine (`planDwell`) + normative constants. |
| Create `src/components/cupping/cva/wheel/zoom-machine.test.ts` | Unit tests for every transition. |
| Create `src/components/cupping/cva/IntensityTrack.tsx` (+`.test.tsx`) | 16-cell 0–15 tap-track + numeric field. |
| Create `src/components/cupping/cva/wheel/MainTastes.tsx`, `MouthfeelCata.tsx` (+`SmallCata.test.tsx`) | The two small CATA pickers. |
| Create `src/components/cupping/cva/wheel/FlavorWheel.tsx` (+`.test.tsx`) | The SVG wheel, all v8 interaction. Controlled: `picks` + `onToggle`. |
| Create `src/components/cupping/cva/wheel/DescribeOverlay.tsx` (+`.test.tsx`) | Full-screen overlay: 3 group tabs, wheel / mouthfeel panel, tastes, notes, chips, caps toast. |
| Modify `src/types/cva.ts` (+ create `src/types/cva.test.ts`) | `WheelPick`, `CvaDescribe` v2, `normalizeAssessment`, `describeIsEmpty`. |
| Modify `src/hooks/useCvaSession.ts` | `setDescribe` setter; normalize on hydrate. |
| Modify `src/components/cupping/cva/SectionScreen.tsx` | Intensity track + `descriptorSlot`. |
| Modify `src/components/cupping/cva/CvaJourney.tsx` | Mount overlay, group routing, reveal soft-gate. |
| Modify `src/app/globals.css` | `.cva-wheel-*` style block (transitions, frost, pop). |

---

### Task 1: Types — `WheelPick`, `CvaDescribe` v2, normalizer, `describeIsEmpty`

**Files:**
- Modify: `src/types/cva.ts`
- Test: `src/types/cva.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/types/cva.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createEmptyAssessment, normalizeAssessment, describeIsEmpty, type CvaAssessment } from './cva'

describe('CvaDescribe v2', () => {
  it('empty assessment has picks arrays and five-key notes', () => {
    const a = createEmptyAssessment()
    expect(a.describe.aroma).toEqual({ picks: [], cata: [] })
    expect(a.describe.flavor_aftertaste).toEqual({ picks: [], cata: [], main_tastes: [] })
    expect(a.describe.mouthfeel).toEqual({ cata: [] })
    expect(a.describe.notes).toEqual({})
    expect(a.describe.intensities.fragrance).toBe(0)
  })

  it('normalizeAssessment upgrades a legacy v1 describe blob (no picks, two-key notes)', () => {
    const legacy = createEmptyAssessment() as unknown as Record<string, unknown>
    legacy.describe = {
      intensities: { fragrance: 7, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
      aroma: { cata: ['Floral'] },
      flavor_aftertaste: { cata: [], main_tastes: ['Sweet'] },
      mouthfeel: { cata: ['Oily'] },
      notes: { acidity: 'citric' },
      voice: {},
    }
    const n = normalizeAssessment(legacy as unknown as CvaAssessment)
    expect(n.describe.aroma).toEqual({ picks: [], cata: ['Floral'] })
    expect(n.describe.flavor_aftertaste.picks).toEqual([])
    expect(n.describe.flavor_aftertaste.main_tastes).toEqual(['Sweet'])
    expect(n.describe.notes.acidity).toBe('citric')
    expect(n.describe.intensities.fragrance).toBe(7)
  })

  it('normalizeAssessment tolerates a missing describe entirely', () => {
    const a = createEmptyAssessment() as unknown as Record<string, unknown>
    delete a.describe
    const n = normalizeAssessment(a as unknown as CvaAssessment)
    expect(n.describe.aroma.picks).toEqual([])
  })

  it('describeIsEmpty: true for empty, false with a pick or any intensity', () => {
    const a = createEmptyAssessment()
    expect(describeIsEmpty(a.describe)).toBe(true)
    const withPick = createEmptyAssessment()
    withPick.describe.aroma.picks.push({ path: ['Fruity', 'Berry', 'Blueberry'] })
    expect(describeIsEmpty(withPick.describe)).toBe(false)
    const withIntensity = createEmptyAssessment()
    withIntensity.describe.intensities.acidity = 9
    expect(describeIsEmpty(withIntensity.describe)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/types/cva.test.ts`
Expected: FAIL — `normalizeAssessment` / `describeIsEmpty` not exported; `picks` missing from empty shape.

- [ ] **Step 3: Implement the type changes**

In `src/types/cva.ts`, replace the existing `CvaDescribe` interface (lines 11–18) with:

```ts
export interface WheelPick {
  /** Full wheel path, most general first, e.g. ["Fruity","Berry","Blueberry"]. Length 1–3. */
  path: string[]
}

export type DescribeGroup = 'aroma' | 'flavor_aftertaste' | 'mouthfeel'

export interface CvaDescribe {
  intensities: Record<Exclude<CvaSectionKey, 'overall'>, number>  // 7 sections, 0–15
  aroma:             { picks: WheelPick[]; cata: string[] }        // picks ≤5; cata DERIVED from picks
  flavor_aftertaste: { picks: WheelPick[]; cata: string[]; main_tastes: string[] }  // ≤5 / derived / ≤2
  mouthfeel:         { cata: string[] }                            // ≤2 of the 5 official options
  /** Freely elicited off-taxonomy notes — ALL sections per SCA-103 §6.3.4. */
  notes: {
    fragrance_aroma?: string
    flavor_aftertaste?: string
    mouthfeel?: string
    acidity?: string
    sweetness?: string
  }
  voice: Record<string, string>                                    // group → transcript (Phase 3)
}
```

In `createEmptyAssessment()`, replace the `describe:` block with:

```ts
    describe: {
      intensities: { fragrance: 0, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
      aroma: { picks: [], cata: [] },
      flavor_aftertaste: { picks: [], cata: [], main_tastes: [] },
      mouthfeel: { cata: [] },
      notes: {},
      voice: {},
    },
```

Append at the end of the file:

```ts
/**
 * Upgrade any persisted assessment to the current CvaDescribe shape.
 * Phase-1 rows were saved before the describe UI existed (empty or v1 blobs);
 * this fills missing picks arrays / notes keys without touching real data.
 */
export function normalizeAssessment(a: CvaAssessment): CvaAssessment {
  const empty = createEmptyAssessment()
  const d = (a as Partial<CvaAssessment>).describe
  if (!d) return { ...a, describe: empty.describe }
  return {
    ...a,
    describe: {
      intensities: { ...empty.describe.intensities, ...d.intensities },
      aroma: { picks: d.aroma?.picks ?? [], cata: d.aroma?.cata ?? [] },
      flavor_aftertaste: {
        picks: d.flavor_aftertaste?.picks ?? [],
        cata: d.flavor_aftertaste?.cata ?? [],
        main_tastes: d.flavor_aftertaste?.main_tastes ?? [],
      },
      mouthfeel: { cata: d.mouthfeel?.cata ?? [] },
      notes: { ...d.notes },
      voice: d.voice ?? {},
    },
  }
}

/** True when nothing descriptive has been recorded — drives the requires_descriptors soft gate. */
export function describeIsEmpty(d: CvaDescribe): boolean {
  return (
    d.aroma.picks.length === 0 &&
    d.flavor_aftertaste.picks.length === 0 &&
    Object.values(d.intensities).every((v) => !v)
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/types/cva.test.ts`
Expected: PASS (4 tests). Also run `npx tsc --noEmit` — expect 0 errors (nothing else reads `describe` internals yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/cva.ts src/types/cva.test.ts
git commit -m "feat(cva): CvaDescribe v2 — wheel picks, five-key notes, normalizer (Phase 2)"
```

---

### Task 2: Wheel data — taxonomy + geometry layout

**Files:**
- Create: `src/lib/cva/flavor-wheel-data.ts`
- Test: `src/lib/cva/flavor-wheel-data.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cva/flavor-wheel-data.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/cva/flavor-wheel-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the data module**

Create `src/lib/cva/flavor-wheel-data.ts`. The taxonomy is copied **verbatim** from the locked prototype (`docs/superpowers/specs/prototypes/cva-flavor-wheel-prototype.html`, `const WHEEL`) — colors are the approved approximations pending the color-fidelity pass:

```ts
// SCA/WCR Coffee Taster's Flavor Wheel — full taxonomy, geometry, and official
// CATA-box derivation (SCA-103 §6.3). Pure data + pure functions; no React.

import type { WheelPick } from '@/types/cva'

export interface WheelNodeDef { n: string; c: string; k?: WheelNodeDef[] }

export const WHEEL: WheelNodeDef[] = [
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

export const NODES: WheelNode[] = (() => {
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

/** Mathematical hit-test in viewBox coordinates (no DOM). Null in the hub or outside the rim. */
export function nodeAt(x: number, y: number): WheelNode | null {
  const dx = x - CX
  const dy = y - CY
  const r = Math.hypot(dx, dy)
  if (r < R0 || r > R3) return null
  let th = Math.atan2(dy, dx)
  while (th < -Math.PI / 2) th += TAU
  while (th >= TAU - Math.PI / 2) th -= TAU
  return NODES.find((nd) => th >= nd.a0 && th < nd.a1 && r >= nd.r0 && r < nd.r1) ?? null
}
```

(CATA derivation and caps come in Task 3 — same file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cva/flavor-wheel-data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cva/flavor-wheel-data.ts src/lib/cva/flavor-wheel-data.test.ts
git commit -m "feat(cva): full SCA flavor-wheel taxonomy + geometry layout (110 nodes)"
```

---

### Task 3: CATA derivation — boxes, aliases, the box-named-leaf exception

**Files:**
- Modify: `src/lib/cva/flavor-wheel-data.ts` (append)
- Modify: `src/lib/cva/flavor-wheel-data.test.ts` (append)

- [ ] **Step 1: Write the failing tests** — append to `flavor-wheel-data.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/cva/flavor-wheel-data.test.ts`
Expected: FAIL — `CATA_BOXES` not exported.

- [ ] **Step 3: Implement** — append to `flavor-wheel-data.ts`:

```ts
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
 * (directly or via alias) checks it. The leaf becomes the freely-elicited
 * descriptor ONLY if it matched no box — Fermented/Woody/Musty-Earthy are
 * leaves that ARE boxes and produce no free descriptor (spec §2 exception).
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cva/flavor-wheel-data.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cva/flavor-wheel-data.ts src/lib/cva/flavor-wheel-data.test.ts
git commit -m "feat(cva): official CATA box derivation with aliases and box-named-leaf exception"
```

---

### Task 4: Caps — `addPickCapped` (replace-oldest) + `toggleCapped`

**Files:**
- Modify: `src/lib/cva/flavor-wheel-data.ts` (append)
- Modify: `src/lib/cva/flavor-wheel-data.test.ts` (append)

- [ ] **Step 1: Write the failing tests** — append:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/cva/flavor-wheel-data.test.ts`
Expected: FAIL — `addPickCapped` not exported.

- [ ] **Step 3: Implement** — append to `flavor-wheel-data.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cva/flavor-wheel-data.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cva/flavor-wheel-data.ts src/lib/cva/flavor-wheel-data.test.ts
git commit -m "feat(cva): replace-oldest caps for wheel picks and small CATA lists"
```

---

### Task 5: Zoom machine — pure dwell/zoom state logic

**Files:**
- Create: `src/components/cupping/cva/wheel/zoom-machine.ts`
- Test: `src/components/cupping/cva/wheel/zoom-machine.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/wheel/zoom-machine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planDwell, DWELL, type ZoomState } from './zoom-machine'

const rest: ZoomState = { mode: 'rest', fam: null }
const fullFruity: ZoomState = { mode: 'full', fam: 'Fruity' }
const midFruity: ZoomState = { mode: 'mid', fam: 'Fruity' }

describe('planDwell — the v8 graded hover zoom', () => {
  it('rest: hovering any node schedules full zoom at 190ms', () => {
    expect(planDwell(rest, { region: 'node', fam: 'Fruity', ring: 2 })).toEqual({
      kind: 'schedule', key: 'full:Fruity', ms: DWELL.in, next: { mode: 'full', fam: 'Fruity' },
    })
  })

  it('rest: hub or background clears', () => {
    expect(planDwell(rest, { region: 'hub' })).toEqual({ kind: 'clear' })
    expect(planDwell(rest, { region: 'none' })).toEqual({ kind: 'clear' })
  })

  it('full: hub schedules zoom-out at 220ms; from mid the hub uses 180ms', () => {
    expect(planDwell(fullFruity, { region: 'hub' })).toEqual({
      kind: 'schedule', key: 'out', ms: DWELL.out, next: { mode: 'rest', fam: null },
    })
    expect(planDwell(midFruity, { region: 'hub' })).toEqual({
      kind: 'schedule', key: 'out', ms: DWELL.backIn, next: { mode: 'rest', fam: null },
    })
  })

  it('full: same family ring 1 schedules half-out at 200ms; outer rings clear', () => {
    expect(planDwell(fullFruity, { region: 'node', fam: 'Fruity', ring: 1 })).toEqual({
      kind: 'schedule', key: 'mid', ms: DWELL.mid, next: { mode: 'mid', fam: 'Fruity' },
    })
    expect(planDwell(fullFruity, { region: 'node', fam: 'Fruity', ring: 3 })).toEqual({ kind: 'clear' })
  })

  it('full: a different family re-aims at 240ms', () => {
    expect(planDwell(fullFruity, { region: 'node', fam: 'Roasted', ring: 2 })).toEqual({
      kind: 'schedule', key: 'full:Roasted', ms: DWELL.switch, next: { mode: 'full', fam: 'Roasted' },
    })
  })

  it('mid: same family ring 1 holds; anything else re-focuses at 180ms', () => {
    expect(planDwell(midFruity, { region: 'node', fam: 'Fruity', ring: 1 })).toEqual({ kind: 'clear' })
    expect(planDwell(midFruity, { region: 'node', fam: 'Fruity', ring: 3 })).toEqual({
      kind: 'schedule', key: 'full:Fruity', ms: DWELL.backIn, next: { mode: 'full', fam: 'Fruity' },
    })
    expect(planDwell(midFruity, { region: 'node', fam: 'Sweet', ring: 1 })).toEqual({
      kind: 'schedule', key: 'full:Sweet', ms: DWELL.backIn, next: { mode: 'full', fam: 'Sweet' },
    })
  })

  it('background clears in every zoomed mode', () => {
    expect(planDwell(fullFruity, { region: 'none' })).toEqual({ kind: 'clear' })
    expect(planDwell(midFruity, { region: 'none' })).toEqual({ kind: 'clear' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/wheel/zoom-machine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/cupping/cva/wheel/zoom-machine.ts`:

```ts
// Pure state logic for the v8 graded hover zoom. The FlavorWheel component
// samples the pointer, calls planDwell, and (re)schedules one timer.
// Constants are NORMATIVE — they mirror the locked prototype's JS.

export type ZoomMode = 'rest' | 'mid' | 'full'
export interface ZoomState { mode: ZoomMode; fam: string | null }
export interface HoverSample { region: 'hub' | 'node' | 'none'; fam?: string; ring?: number }

export const REST_S = 1.3
export const DEPTHS = { full: { s: 2.4, r: 130 }, mid: { s: 1.75, r: 80 } } as const
export const DWELL = { in: 190, backIn: 180, mid: 200, out: 220, switch: 240 } as const

export type DwellPlan =
  | { kind: 'schedule'; key: string; ms: number; next: ZoomState }
  | { kind: 'clear' }

export function planDwell(state: ZoomState, hover: HoverSample): DwellPlan {
  if (state.mode === 'rest') {
    if (hover.region === 'node' && hover.fam)
      return { kind: 'schedule', key: `full:${hover.fam}`, ms: DWELL.in, next: { mode: 'full', fam: hover.fam } }
    return { kind: 'clear' }
  }
  if (hover.region === 'hub')
    return {
      kind: 'schedule', key: 'out',
      ms: state.mode === 'mid' ? DWELL.backIn : DWELL.out,
      next: { mode: 'rest', fam: null },
    }
  if (hover.region !== 'node' || !hover.fam) return { kind: 'clear' }
  if (state.mode === 'full') {
    if (hover.fam === state.fam) {
      if (hover.ring === 1)
        return { kind: 'schedule', key: 'mid', ms: DWELL.mid, next: { mode: 'mid', fam: state.fam } }
      return { kind: 'clear' }
    }
    return { kind: 'schedule', key: `full:${hover.fam}`, ms: DWELL.switch, next: { mode: 'full', fam: hover.fam } }
  }
  // mid
  if (hover.fam === state.fam && hover.ring === 1) return { kind: 'clear' }
  return { kind: 'schedule', key: `full:${hover.fam}`, ms: DWELL.backIn, next: { mode: 'full', fam: hover.fam } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/wheel/zoom-machine.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/zoom-machine.ts src/components/cupping/cva/wheel/zoom-machine.test.ts
git commit -m "feat(cva): pure zoom/dwell state machine for the flavor wheel"
```

---

### Task 6: IntensityTrack — 16-cell 0–15 tap-track

**Files:**
- Create: `src/components/cupping/cva/IntensityTrack.tsx`
- Test: `src/components/cupping/cva/IntensityTrack.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/IntensityTrack.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IntensityTrack } from './IntensityTrack'

describe('IntensityTrack', () => {
  it('renders sixteen cells (0–15) and the zone labels', () => {
    render(<IntensityTrack value={0} accent="#556b2f" onChange={() => {}} />)
    expect(screen.getAllByRole('button', { name: /intensity \d+$/i })).toHaveLength(16)
    expect(screen.getByText('LOW')).toBeTruthy()
    expect(screen.getByText('MEDIUM')).toBeTruthy()
    expect(screen.getByText('HIGH')).toBeTruthy()
  })

  it('tapping a cell reports its value', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={0} accent="#556b2f" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /intensity 11$/i }))
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it('numeric field is two-way synced and clamps to 0–15', () => {
    const onChange = vi.fn()
    render(<IntensityTrack value={7} accent="#556b2f" onChange={onChange} />)
    const input = screen.getByLabelText(/intensity value/i) as HTMLInputElement
    expect(input.value).toBe('7')
    fireEvent.change(input, { target: { value: '15' } })
    expect(onChange).toHaveBeenCalledWith(15)
    fireEvent.change(input, { target: { value: '22' } })   // clamped
    expect(onChange).toHaveBeenCalledWith(15)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/IntensityTrack.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/cupping/cva/IntensityTrack.tsx`:

```tsx
'use client'

interface Props {
  /** 0–15 per the SCA form's 15-point scale (anchors 0 / 5 / 10 / 15). 0 = not rated. */
  value: number
  accent: string
  onChange: (v: number) => void
}

/** Tap-track intensity input — taps + a numeric field, never a slider (locked rule). */
export function IntensityTrack({ value, accent, onChange }: Props) {
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-1.5" data-testid="intensity-track">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-[3px]">
          {Array.from({ length: 16 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Intensity ${i}`}
              onClick={() => onChange(i)}
              className="h-7 flex-1 rounded-[5px] border border-border transition-transform hover:scale-y-110"
              style={{ background: i <= value && value > 0 ? accent : 'var(--cva-card-solid)', opacity: i <= value && value > 0 ? 0.35 + (i / 15) * 0.65 : 1 }}
            />
          ))}
        </div>
        <input
          aria-label="Intensity value"
          inputMode="numeric"
          value={value || ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
            if (raw === '') return onChange(0)
            onChange(Math.min(15, parseInt(raw, 10)))
          }}
          className="h-9 w-12 rounded-[10px] border border-border bg-card text-center text-sm font-bold outline-none focus:border-[var(--cva-accent)]"
        />
      </div>
      <div className="flex justify-between px-0.5 text-[9px] font-bold uppercase tracking-[1.2px] text-muted-foreground">
        <span>LOW</span>
        <span>MEDIUM</span>
        <span>HIGH</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/IntensityTrack.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/IntensityTrack.tsx src/components/cupping/cva/IntensityTrack.test.tsx
git commit -m "feat(cva): 0-15 intensity tap-track (no sliders)"
```

---

### Task 7: MainTastes + MouthfeelCata pickers

**Files:**
- Create: `src/components/cupping/cva/wheel/MainTastes.tsx`
- Create: `src/components/cupping/cva/wheel/MouthfeelCata.tsx`
- Test: `src/components/cupping/cva/wheel/SmallCata.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/wheel/SmallCata.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainTastes } from './MainTastes'
import { MouthfeelCata } from './MouthfeelCata'

describe('MainTastes', () => {
  it('renders the five official tastes', () => {
    render(<MainTastes value={[]} onChange={() => {}} />)
    for (const t of ['Salty', 'Sour', 'Sweet', 'Bitter', 'Umami'])
      expect(screen.getByRole('button', { name: t })).toBeTruthy()
  })

  it('caps at two with replace-oldest', () => {
    const onChange = vi.fn()
    render(<MainTastes value={['Sweet', 'Bitter']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Umami' }))
    expect(onChange).toHaveBeenCalledWith(['Bitter', 'Umami'])
  })
})

describe('MouthfeelCata', () => {
  it('renders the five options with their sub-qualifiers', () => {
    render(<MouthfeelCata value={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /rough/i })).toBeTruthy()
    expect(screen.getByText('Gritty, Chalky, Sandy')).toBeTruthy()
    expect(screen.getByText('Velvety, Silky, Syrupy')).toBeTruthy()
    expect(screen.getByRole('button', { name: /mouth-drying/i })).toBeTruthy()
  })

  it('toggles off and caps at two', () => {
    const onChange = vi.fn()
    const { rerender } = render(<MouthfeelCata value={['Oily']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /oily/i }))
    expect(onChange).toHaveBeenCalledWith([])
    rerender(<MouthfeelCata value={['Oily', 'Metallic']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /smooth/i }))
    expect(onChange).toHaveBeenCalledWith(['Metallic', 'Smooth'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/wheel/SmallCata.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both components**

Create `src/components/cupping/cva/wheel/MainTastes.tsx`:

```tsx
'use client'

import { MAIN_TASTES, TASTE_CAP, toggleCapped } from '@/lib/cva/flavor-wheel-data'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

/** "Main Tastes (2)" from the official form — gustatory, not on the wheel. */
export function MainTastes({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Main tastes <span className="font-semibold normal-case tracking-normal">(up to {TASTE_CAP})</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {MAIN_TASTES.map((t) => {
          const on = value.includes(t)
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleCapped(value, t, TASTE_CAP))}
              className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                on ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:border-[var(--cva-accent)]'
              }`}
              style={on ? { background: 'var(--cva-accent)' } : undefined}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

Create `src/components/cupping/cva/wheel/MouthfeelCata.tsx`:

```tsx
'use client'

import { MOUTH_CATA, MOUTH_CAP, toggleCapped } from '@/lib/cva/flavor-wheel-data'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

/** Mouthfeel CATA (SCA-103 §6.3.3) — five options, up to two, sub-qualifiers shown under the parent. */
export function MouthfeelCata({ value, onChange }: Props) {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-2.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Mouthfeel <span className="font-semibold normal-case tracking-normal">(up to {MOUTH_CAP})</span>
      </span>
      {MOUTH_CATA.map((o) => {
        const on = value.includes(o.name)
        return (
          <button
            key={o.name}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggleCapped(value, o.name, MOUTH_CAP))}
            className={`flex flex-col items-start gap-0.5 rounded-[16px] border px-5 py-3.5 text-left transition ${
              on ? 'border-[var(--cva-accent)]' : 'border-border hover:border-[var(--cva-accent)]'
            }`}
            style={on ? { background: 'var(--cva-accent-soft)' } : undefined}
          >
            <span className="text-sm font-bold">{o.name}</span>
            {o.sub && <span className="text-[11.5px] font-medium text-muted-foreground">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/wheel/SmallCata.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/MainTastes.tsx src/components/cupping/cva/wheel/MouthfeelCata.tsx src/components/cupping/cva/wheel/SmallCata.test.tsx
git commit -m "feat(cva): main tastes and mouthfeel CATA pickers"
```

---

### Task 8: FlavorWheel — geometry render, labels, tap interaction, CSS

The component is built in two tasks: this one renders the full wheel and implements the **click/tap path** (works on iPad with zero hover); Task 9 adds the pointer-hover layer (dwell zoom, lift, pop, pan). Reference for every visual decision: the locked prototype.

**Files:**
- Create: `src/components/cupping/cva/wheel/FlavorWheel.tsx`
- Modify: `src/app/globals.css` (append a `.cva-wheel-*` block after the existing `.cva-*` styles)
- Test: `src/components/cupping/cva/wheel/FlavorWheel.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/wheel/FlavorWheel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FlavorWheel, splitLabel } from './FlavorWheel'

describe('FlavorWheel — render + tap path', () => {
  it('renders all 110 selectable wedges', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    expect(screen.getAllByRole('button', { name: /.+/ }).filter((b) => b.tagName.toLowerCase() === 'g')).toHaveLength(110)
  })

  it('starts at rest; tapping a family zooms it; tapping a note then toggles the pick', () => {
    const onToggle = vi.fn()
    const { container } = render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')

    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    expect(svg.getAttribute('data-zoom-mode')).toBe('full')
    expect(onToggle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Fruity', 'Berry', 'Blueberry'] })
  })

  it('tapping a different family while focused re-aims instead of toggling', () => {
    const onToggle = vi.fn()
    const { container } = render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roasted / Cereal / Malt' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(container.querySelector('svg')!.getAttribute('data-zoom-mode')).toBe('full')
  })

  it('background click and Escape return to rest', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')!
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.click(svg)
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
  })

  it('picked wedges carry the is-picked class', () => {
    render(<FlavorWheel picks={[{ path: ['Fruity', 'Berry', 'Blueberry'] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
  })

  it('frost: only the focused family clears its outer-ring frost', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    expect(container.querySelectorAll('.cva-wheel-w3.is-clear')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    const clear = container.querySelectorAll('.cva-wheel-w3.is-clear')
    expect(clear).toHaveLength(1)
  })

  it('splitLabel wraps at the slash, then the most central space, else not at all', () => {
    expect(splitLabel('Sour/Fermented', 11)).toEqual(['Sour/', 'Fermented'])
    expect(splitLabel('Citrus Fruit', 11)).toEqual(['Citrus', 'Fruit'])
    expect(splitLabel('Sweet Aromatics', 22)).toEqual(['Sweet Aromatics'])
    expect(splitLabel('Blackberry', 22)).toEqual(['Blackberry'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/wheel/FlavorWheel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/cupping/cva/wheel/FlavorWheel.tsx`:

```tsx
'use client'

// The SCA flavor wheel — locked v8 interaction (see
// docs/superpowers/specs/prototypes/cva-flavor-wheel-prototype.html; its JS
// constants are normative). This file renders geometry + the tap path;
// the hover layer (dwell zoom / lift / pop / pan) hangs off onPointerMove.
//
// GOTCHA (cost us a demo iteration): never put CSS transform-origin on the
// <text> elements — it re-centers their rotate(deg x y) attribute around the
// viewBox center and scatters every label. Labels live in plain <g> wrappers
// (.cva-wheel-lw) that take the pop transform instead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CX, CY, R0, R1, R2, R3, VIEW, NODES, WHEEL, nodeAt, pickKey,
  type WheelNode,
} from '@/lib/cva/flavor-wheel-data'
import { DEPTHS, REST_S, planDwell, type ZoomState, type HoverSample } from './zoom-machine'
import type { WheelPick } from '@/types/cva'

interface Props {
  picks: WheelPick[]
  onToggle: (pick: WheelPick) => void
}

const GAP = 0.0028
const ARC_FAMS = new Set(['Green/Vegetative', 'Sour/Fermented'])

const FAM_SPANS = new Map(
  NODES.filter((n) => n.ring === 1).map((n) => [n.family, { a0: n.a0, a1: n.a1 }]),
)

/* ---------- static geometry helpers ---------- */

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255
}

function arcPathD(r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r1, a0)
  const [x1, y1] = p(r1, a1)
  const [x2, y2] = p(r0, a1)
  const [x3, y3] = p(r0, a0)
  return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`
}

export function splitLabel(str: string, maxChars: number): string[] {
  if (str.length <= maxChars) return [str]
  const slash = str.indexOf('/')
  if (slash > 0 && slash < str.length - 1) return [str.slice(0, slash + 1), str.slice(slash + 1)]
  let sp = -1
  for (let i = 0; i < str.length; i++)
    if (str[i] === ' ' && (sp === -1 || Math.abs(i - str.length / 2) < Math.abs(sp - str.length / 2))) sp = i
  if (sp > 0) return [str.slice(0, sp), str.slice(sp + 1)]
  return [str]
}

type LabelGeo =
  | { kind: 'radial'; x: number; y: number; deg: number; anchor: 'start' | 'end'; size: number; weight: number; fill: string; lines: string[] }
  | { kind: 'arc'; pathD: string; pid: string; size: number; fill: string; text: string }

function labelGeoFor(nd: WheelNode, idx: number): LabelGeo {
  const mid = (nd.a0 + nd.a1) / 2
  const fill = lum(nd.color) > 0.62 ? '#1c1c1c' : '#fff'
  if (nd.ring === 1 && ARC_FAMS.has(nd.name)) {
    // Curved family label (only these two — locked decision 6). Flipped upright
    // on the bottom half; font auto-fit to the arc length, min 5px.
    const down = Math.sin(mid) > 0
    const arcLen = (nd.a1 - nd.a0) * 82 - 8
    const text = nd.name.toUpperCase()
    const size = text.length * 7 * 0.62 > arcLen ? Math.max(5, arcLen / (text.length * 0.62)) : 7
    const r = down ? 86 : 79
    const P = (a: number) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r]
    const [xs, ys] = P(down ? nd.a1 : nd.a0)
    const [xe, ye] = P(down ? nd.a0 : nd.a1)
    return {
      kind: 'arc',
      pid: `cva-lp-${idx}`,
      pathD: `M${xs},${ys}A${r},${r} 0 0 ${down ? 0 : 1} ${xe},${ye}`,
      size, fill, text,
    }
  }
  const conf =
    nd.ring === 1 ? { r: R0 + 8, size: 7, weight: 800, max: 10, text: nd.name.toUpperCase() }
    : nd.ring === 2 ? { r: R1 + 6, size: 5.6, weight: 700, max: 11, text: nd.name }
    : nd.ring === 2.5 ? { r: R1 + 6, size: 5.4, weight: 700, max: 22, text: nd.name }
    : { r: R2 + 4, size: 4.9, weight: 600, max: 22, text: nd.name }
  let deg = (mid * 180) / Math.PI
  let anchor: 'start' | 'end' = 'start'
  if (deg > 90 && deg < 270) { deg += 180; anchor = 'end' }
  return {
    kind: 'radial',
    x: CX + Math.cos(mid) * conf.r,
    y: CY + Math.sin(mid) * conf.r,
    deg, anchor, size: conf.size, weight: conf.weight, fill,
    lines: splitLabel(conf.text, conf.max),
  }
}

const LABELS: LabelGeo[] = NODES.map(labelGeoFor)

/* ---------- component ---------- */

export function FlavorWheel({ picks, onToggle }: Props) {
  const [zoom, setZoom] = useState<ZoomState>({ mode: 'rest', fam: null })
  const [hotFam, setHotFam] = useState<string | null>(null)
  const [popped, setPopped] = useState<string | null>(null)
  const [panAngle, setPanAngle] = useState<number | null>(null)
  const [stageW, setStageW] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dwellRef = useRef<{ key: string | null; t: ReturnType<typeof setTimeout> | null }>({ key: null, t: null })
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const pickedSet = useMemo(() => new Set(picks.map(pickKey)), [picks])

  const clearDwell = useCallback(() => {
    if (dwellRef.current.t) clearTimeout(dwellRef.current.t)
    dwellRef.current = { key: null, t: null }
  }, [])

  const applyZoom = useCallback((next: ZoomState) => {
    clearDwell()
    setPopped(null)
    setPanAngle(null)
    setHotFam(null)
    setZoom(next)
  }, [clearDwell])

  // Stage width drives the px translate of the zoom transform.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    setStageW(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => setStageW(es[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Esc always returns to rest; preventDefault so an enclosing overlay's own
  // Esc-to-close (which checks defaultPrevented) doesn't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zoomRef.current.mode !== 'rest') {
        e.preventDefault()
        applyZoom({ mode: 'rest', fam: null })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [applyZoom])

  useEffect(() => clearDwell, [clearDwell])

  const transform = useMemo(() => {
    if (zoom.mode === 'rest' || !zoom.fam) return `scale(${REST_S})`
    const d = DEPTHS[zoom.mode]
    const span = FAM_SPANS.get(zoom.fam)!
    const mid = panAngle ?? (span.a0 + span.a1) / 2
    const f = stageW / VIEW
    const bx = Math.cos(mid) * d.r * f
    const by = Math.sin(mid) * d.r * f
    return `scale(${d.s}) translate(${-bx}px, ${-by}px)`
  }, [zoom, panAngle, stageW])

  // "center · zoom out" marker — a REAL button (spec: the prototype's was
  // decorative; in the app it must be tappable), clamped inside the stage.
  const marker = useMemo(() => {
    if (zoom.mode === 'rest' || !zoom.fam || !stageW) return null
    const d = DEPTHS[zoom.mode]
    const span = FAM_SPANS.get(zoom.fam)!
    const mid = panAngle ?? (span.a0 + span.a1) / 2
    const f = stageW / VIEW
    let hx = -Math.cos(mid) * d.r * f * d.s
    let hy = -Math.sin(mid) * d.r * f * d.s
    const len = Math.hypot(hx, hy)
    const max = stageW / 2 - 46
    if (len > max) { hx = (hx / len) * max; hy = (hy / len) * max }
    return { hx, hy }
  }, [zoom, panAngle, stageW])

  const handleWedge = (nd: WheelNode) => {
    if (zoom.mode === 'full' && nd.family === zoom.fam) onToggle({ path: nd.path })
    else applyZoom({ mode: 'full', fam: nd.family })
  }

  const branchClass = (fam: string) => {
    const cls = ['cva-wheel-branch']
    if (zoom.mode === 'rest') {
      if (hotFam) cls.push(fam === hotFam ? 'is-hot' : 'is-dim')
    } else if (fam === zoom.fam) cls.push('is-focused')
    else cls.push(zoom.mode === 'full' ? 'is-faded' : 'is-soft')
    return cls.join(' ')
  }

  // Task 9 fills these in (hover layer). Declared here so JSX wiring is final.
  const onPointerMove = (_e: React.PointerEvent<SVGSVGElement>) => {}
  const onPointerLeave = () => { clearDwell(); setHotFam(null); setPopped(null) }
  void planDwell // referenced by Task 9
  void nodeAt
  void onPointerMove

  const poppedLast = (a: WheelNode, b: WheelNode) =>
    (pickKey({ path: a.path }) === popped ? 1 : 0) - (pickKey({ path: b.path }) === popped ? 1 : 0)

  const renderWedge = (nd: WheelNode) => {
    const key = nd.path.join('>')
    return (
      <g
        key={key}
        role="button"
        aria-label={nd.path.join(' / ')}
        className={`cva-wheel-wedge${pickedSet.has(key) ? ' is-picked' : ''}${popped === key ? ' is-popped' : ''}`}
        onClick={(e) => { e.stopPropagation(); handleWedge(nd) }}
      >
        <path d={arcPathD(nd.r0, nd.r1, nd.a0 + GAP, nd.a1 - GAP)} fill={nd.color} />
      </g>
    )
  }

  const renderLabel = (nd: WheelNode, idx: number) => {
    const g = LABELS[idx]
    const key = nd.path.join('>')
    const l3 = nd.ring === 3
    const wrapCls = `cva-wheel-lw${popped === key ? ' is-popped' : ''}`
    const txtCls = `cva-wheel-label${l3 ? ` cva-l3${zoom.fam === nd.family ? ' is-visible' : ''}` : ''}`
    if (g.kind === 'arc') {
      return (
        <g key={key} className={wrapCls}>
          <path id={g.pid} d={g.pathD} fill="none" />
          <text className={txtCls} fontSize={g.size} fontWeight={800} fill={g.fill}>
            <textPath href={`#${g.pid}`} startOffset="50%" textAnchor="middle">{g.text}</textPath>
          </text>
        </g>
      )
    }
    return (
      <g key={key} className={wrapCls}>
        <text
          className={txtCls}
          x={g.x} y={g.y}
          fontSize={g.size} fontWeight={g.weight} fill={g.fill}
          textAnchor={g.anchor} dominantBaseline="middle"
          transform={`rotate(${g.deg} ${g.x} ${g.y})`}
        >
          {g.lines.length === 1 ? g.lines[0] : (
            <>
              <tspan x={g.x} dy="-0.52em">{g.lines[0]}</tspan>
              <tspan x={g.x} dy="1.06em">{g.lines[1]}</tspan>
            </>
          )}
        </text>
      </g>
    )
  }

  return (
    <div ref={stageRef} className="cva-wheel-stage" data-testid="flavor-wheel-stage">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="cva-wheel-svg"
        data-zoom-mode={zoom.mode}
        style={{ transform }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={() => { if (zoom.mode !== 'rest') applyZoom({ mode: 'rest', fam: null }) }}
      >
        {WHEEL.map((fam) => {
          const inner = NODES.filter((n) => n.family === fam.n && n.ring !== 3).sort(poppedLast)
          const outer = NODES.filter((n) => n.family === fam.n && n.ring === 3).sort(poppedLast)
          const famLabels = NODES.map((n, i) => [n, i] as const).filter(([n]) => n.family === fam.n)
          return (
            <g key={fam.n} className={branchClass(fam.n)}>
              <g>{inner.map(renderWedge)}</g>
              <g className={`cva-wheel-w3${hotFam === fam.n || zoom.fam === fam.n ? ' is-clear' : ''}`}>
                {outer.map(renderWedge)}
              </g>
              <g pointerEvents="none">{famLabels.map(([n, i]) => renderLabel(n, i))}</g>
            </g>
          )
        })}
      </svg>

      {zoom.mode === 'rest' && (
        <div className="cva-wheel-hub" aria-hidden>
          <div className="cva-wheel-hub-big">{picks.length}</div>
          <div className="cva-wheel-hub-sm">descriptors · rest on a family</div>
        </div>
      )}

      {zoom.mode !== 'rest' && (
        <button type="button" className="cva-wheel-back" onClick={() => applyZoom({ mode: 'rest', fam: null })}>
          <span aria-hidden>←</span> {zoom.fam}
        </button>
      )}

      {marker && (
        <button
          type="button"
          className="cva-wheel-home"
          style={{ left: `calc(50% + ${marker.hx}px)`, top: `calc(50% + ${marker.hy}px)` }}
          onClick={() => applyZoom({ mode: 'rest', fam: null })}
        >
          <span className="cva-wheel-pulse" aria-hidden /> center · zoom out
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Append the wheel CSS to `src/app/globals.css`**

Add after the existing `.cva-*` block (tokens `--cva-ease`, `--cva-spring`, `--cva-card-solid`, `--cva-hair` already exist there):

```css
/* ===== CVA flavor wheel (Phase 2; v8 prototype is normative) ===== */
.cva-wheel-stage{position:relative;width:100%;aspect-ratio:1;border-radius:18px;overflow:hidden;
  background:radial-gradient(110% 85% at 50% -10%, var(--cva-accent-soft), transparent 60%), var(--cva-card-solid);
  border:.5px solid var(--cva-hair);}
.cva-wheel-svg{display:block;width:100%;height:100%;transform-origin:50% 50%;transition:transform .65s var(--cva-ease);}
.cva-wheel-branch{transform-box:view-box;transform-origin:50% 50%;transition:transform .35s var(--cva-spring),opacity .3s,filter .35s;}
.cva-wheel-branch.is-hot{transform:scale(1.055);filter:drop-shadow(0 6px 14px rgba(0,0,0,.30));}
.cva-wheel-branch.is-dim{opacity:.32;}
.cva-wheel-branch.is-faded{opacity:.10;}
.cva-wheel-branch.is-soft{opacity:.55;}
.cva-wheel-branch.is-focused{filter:drop-shadow(0 4px 18px rgba(0,0,0,.28));}
.cva-wheel-w3{filter:blur(1.5px) saturate(.75) opacity(.6);transition:filter .4s var(--cva-ease);}
.cva-wheel-w3.is-clear{filter:none;}
.cva-wheel-wedge{transform-box:view-box;transform-origin:50% 50%;transition:transform .28s var(--cva-spring);cursor:pointer;}
.cva-wheel-wedge path{stroke:var(--cva-card-solid);stroke-width:.9;}
.cva-wheel-wedge.is-popped{transform:scale(1.045);}
.cva-wheel-wedge.is-popped path{filter:brightness(1.1) drop-shadow(0 3px 9px rgba(0,0,0,.4));}
.cva-wheel-wedge.is-picked path{stroke:var(--foreground);stroke-width:1.5;filter:brightness(1.1) saturate(1.15);}
.cva-wheel-lw{transform-box:view-box;transform-origin:50% 50%;transition:transform .28s var(--cva-spring);pointer-events:none;}
.cva-wheel-lw.is-popped{transform:scale(1.045);}
.cva-wheel-label{user-select:none;pointer-events:none;font-family:inherit;}
.cva-l3{opacity:0;transition:opacity .4s .15s;}
.cva-l3.is-visible{opacity:1;}
.cva-wheel-hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:128px;height:128px;border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px;pointer-events:none;}
.cva-wheel-hub-big{font-size:26px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;}
.cva-wheel-hub-sm{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;max-width:110px;color:var(--muted-foreground,rgba(127,127,127,.8));}
.cva-wheel-back{position:absolute;top:12px;left:12px;z-index:6;display:flex;align-items:center;gap:7px;
  background:var(--cva-card-solid);border:.5px solid var(--border);border-radius:999px;padding:7px 14px 7px 10px;
  font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);}
.cva-wheel-home{position:absolute;z-index:5;display:flex;align-items:center;gap:6px;transform:translate(-50%,-50%);
  background:var(--cva-card-solid);border:.5px solid var(--border);border-radius:999px;padding:5px 11px;
  font-size:10.5px;font-weight:700;letter-spacing:.4px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.16);}
.cva-wheel-pulse{width:7px;height:7px;border-radius:50%;background:var(--cva-accent);animation:cva-pulse 1.6s infinite;}
@keyframes cva-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.7);opacity:.45}}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/wheel/FlavorWheel.test.tsx`
Expected: PASS (6 tests). Also `npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/cupping/cva/wheel/FlavorWheel.tsx src/components/cupping/cva/wheel/FlavorWheel.test.tsx src/app/globals.css
git commit -m "feat(cva): flavor wheel render + tap interaction (110 nodes, frost, labels)"
```

---

### Task 9: FlavorWheel — hover layer (dwell zoom, lift, pop, pan; touch-guarded)

**Files:**
- Modify: `src/components/cupping/cva/wheel/FlavorWheel.tsx`
- Modify: `src/components/cupping/cva/wheel/FlavorWheel.test.tsx` (append)

- [ ] **Step 1: Write the failing tests** — append to `FlavorWheel.test.tsx`:

```tsx
import { act } from '@testing-library/react'
import { NODES, CX, CY } from '@/lib/cva/flavor-wheel-data'
import { DWELL } from './zoom-machine'

/** Dispatch a pointermove at a wheel node's centroid (viewBox coords map 1:1
 *  because we mock the svg rect to 440×440). act-wrapped: the handler setState-s. */
function moveTo(svg: SVGSVGElement, pathKey: string, pointerType = 'mouse') {
  const nd = NODES.find((n) => n.path.join('>') === pathKey)!
  const mid = (nd.a0 + nd.a1) / 2
  const r = (nd.r0 + nd.r1) / 2
  const ev = new MouseEvent('pointermove', {
    bubbles: true,
    clientX: CX + Math.cos(mid) * r,
    clientY: CY + Math.sin(mid) * r,
  })
  Object.defineProperty(ev, 'pointerType', { value: pointerType })
  act(() => { svg.dispatchEvent(ev) })
}

function mockRect(svg: SVGSVGElement) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 440, height: 440, right: 440, bottom: 440, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
}

describe('FlavorWheel — hover layer', () => {
  it('dwelling on a family zooms in after DWELL.in; the hub dwell zooms back out', () => {
    vi.useFakeTimers()
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)

    moveTo(svg, 'Fruity>Berry')
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')   // not yet — dwell pending
    act(() => { vi.advanceTimersByTime(DWELL.in + 5) })
    expect(svg.getAttribute('data-zoom-mode')).toBe('full')

    // pointer to the hub → breathes out after DWELL.out
    const ev = new MouseEvent('pointermove', { bubbles: true, clientX: CX, clientY: CY })
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' })
    act(() => { svg.dispatchEvent(ev) })
    act(() => { vi.advanceTimersByTime(DWELL.out + 5) })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    vi.useRealTimers()
  })

  it('hover at rest lifts the family immediately (is-hot) and unfrosts its outer ring', () => {
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)
    moveTo(svg, 'Roasted>Burnt>Smoky')
    expect(container.querySelectorAll('.cva-wheel-branch.is-hot')).toHaveLength(1)
    expect(container.querySelectorAll('.cva-wheel-w3.is-clear')).toHaveLength(1)
  })

  it('while focused, hovering a note pops it (wedge + label ride together)', () => {
    vi.useFakeTimers()
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    moveTo(svg, 'Fruity>Berry>Blueberry')
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-popped')).toBe(true)
    expect(container.querySelectorAll('.cva-wheel-lw.is-popped')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('touch pointermoves are fully ignored (no lift, no dwell zoom)', () => {
    vi.useFakeTimers()
    const { container } = render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const svg = container.querySelector('svg')! as SVGSVGElement
    mockRect(svg)
    moveTo(svg, 'Fruity>Berry', 'touch')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(svg.getAttribute('data-zoom-mode')).toBe('rest')
    expect(container.querySelectorAll('.cva-wheel-branch.is-hot')).toHaveLength(0)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/wheel/FlavorWheel.test.tsx`
Expected: the 4 new tests FAIL (stub `onPointerMove` does nothing); the 6 Task-8 tests still PASS.

- [ ] **Step 3: Implement the hover layer**

In `FlavorWheel.tsx`, replace the stub block

```tsx
  // Task 9 fills these in (hover layer). Declared here so JSX wiring is final.
  const onPointerMove = (_e: React.PointerEvent<SVGSVGElement>) => {}
  const onPointerLeave = () => { clearDwell(); setHotFam(null); setPopped(null) }
  void planDwell // referenced by Task 9
  void nodeAt
  void onPointerMove
```

with:

```tsx
  const scheduleDwell = useCallback((key: string, ms: number, next: ZoomState) => {
    if (dwellRef.current.key === key) return       // same intent already pending
    if (dwellRef.current.t) clearTimeout(dwellRef.current.t)
    dwellRef.current = {
      key,
      t: setTimeout(() => { dwellRef.current = { key: null, t: null }; applyZoom(next) }, ms),
    }
  }, [applyZoom])

  // Hover drives everything on pointer devices; touch is fully guarded —
  // unguarded, a tap would pan the view before the click lands and the
  // finger would pick the wrong note (spec §3 Touch).
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'touch') return
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * VIEW) / rect.width
    const y = ((e.clientY - rect.top) * VIEW) / rect.height
    const r = Math.hypot(x - CX, y - CY)
    const nd = nodeAt(x, y)
    const hover: HoverSample =
      r < R0 ? { region: 'hub' }
      : nd ? { region: 'node', fam: nd.family, ring: nd.ring === 2.5 ? 2 : nd.ring }
      : { region: 'none' }

    const plan = planDwell(zoom, hover)
    if (plan.kind === 'clear') clearDwell()
    else scheduleDwell(plan.key, plan.ms, plan.next)

    if (zoom.mode === 'rest') {
      setHotFam(nd?.family ?? null)
      return
    }
    // Focused: pop the hovered note and pan the screen onto it (clamped to the slice).
    if (zoom.mode === 'full' && nd && nd.family === zoom.fam) {
      const key = nd.path.join('>')
      if (popped !== key) {
        setPopped(key)
        const span = FAM_SPANS.get(zoom.fam)!
        const pad = Math.min(0.10, (span.a1 - span.a0) / 4)
        setPanAngle(Math.max(span.a0 + pad, Math.min(span.a1 - pad, (nd.a0 + nd.a1) / 2)))
      }
    } else if (popped) {
      setPopped(null)
    }
  }

  const onPointerLeave = () => { clearDwell(); setHotFam(null); setPopped(null) }
```

(`R0` is already imported; add `HoverSample` to the zoom-machine import if the editor didn't.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/wheel/FlavorWheel.test.tsx`
Expected: PASS (10 tests). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/FlavorWheel.tsx src/components/cupping/cva/wheel/FlavorWheel.test.tsx
git commit -m "feat(cva): wheel hover layer — graded dwell zoom, lift, note pop, pointer pan"
```

---

### Task 10: DescribeOverlay — tabs, panels, chips, caps toast, notes

**Files:**
- Create: `src/components/cupping/cva/wheel/DescribeOverlay.tsx`
- Test: `src/components/cupping/cva/wheel/DescribeOverlay.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/wheel/DescribeOverlay.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DescribeOverlay } from './DescribeOverlay'
import { createEmptyAssessment, type CvaDescribe, type DescribeGroup } from '@/types/cva'

/** Stateful harness — the overlay is controlled exactly like CvaJourney drives it. */
function Harness({ initialGroup = 'aroma' as DescribeGroup, onClose = () => {} }) {
  const [describe, setDescribe] = useState<CvaDescribe>(createEmptyAssessment().describe)
  const [group, setGroup] = useState<DescribeGroup>(initialGroup)
  return (
    <DescribeOverlay
      open
      group={group}
      onGroupChange={setGroup}
      describe={describe}
      onDescribe={(m) => setDescribe((d) => m(d))}
      onClose={onClose}
    />
  )
}

const pickLeaf = (family: string, leafLabel: string) => {
  fireEvent.click(screen.getByRole('button', { name: family }))
  fireEvent.click(screen.getByRole('button', { name: leafLabel }))
}

describe('DescribeOverlay', () => {
  it('renders the three group tabs; aroma group shows the wheel, no main tastes', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: /aroma/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /flavor & aftertaste/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /mouthfeel/i })).toBeTruthy()
    expect(screen.getByTestId('flavor-wheel-stage')).toBeTruthy()
    expect(screen.queryByText(/main tastes/i)).toBeNull()
  })

  it('picking a note adds a chip, derives the official boxes, and counts picks not boxes', () => {
    render(<Harness />)
    pickLeaf('Fruity', 'Fruity / Berry / Blueberry')
    expect(screen.getByText('Picks 1/5')).toBeTruthy()
    const cata = screen.getByTestId('derived-cata')
    expect(cata.textContent).toContain('Fruity')
    expect(cata.textContent).toContain('Berry')
    expect(cata.textContent).toContain('Blueberry')      // precise free descriptor
    // chip removal
    fireEvent.click(screen.getByRole('button', { name: /remove blueberry/i }))
    expect(screen.queryByText('Picks 1/5')).toBeNull()
  })

  it('6th pick replaces the oldest and shows the cap toast', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    for (const leaf of ['Blackberry', 'Raspberry', 'Blueberry', 'Strawberry'])
      fireEvent.click(screen.getByRole('button', { name: `Fruity / Berry / ${leaf}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Citrus Fruit / Lemon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Citrus Fruit / Lime' }))   // 6th
    expect(screen.getByText(/cap of 5 reached — replaced "Blackberry"/i)).toBeTruthy()
    expect(screen.getByText('Picks 5/5')).toBeTruthy()
  })

  it('flavor & aftertaste group adds main tastes; mouthfeel group swaps the wheel for the CATA panel', () => {
    render(<Harness initialGroup="flavor_aftertaste" />)
    expect(screen.getByText(/main tastes/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /mouthfeel/i }))
    expect(screen.queryByTestId('flavor-wheel-stage')).toBeNull()
    expect(screen.getByRole('button', { name: /mouth-drying/i })).toBeTruthy()
  })

  it('per-group free-note input writes the right notes key', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/freely elicited/i), { target: { value: 'dried tomato' } })
    expect((screen.getByLabelText(/freely elicited/i) as HTMLInputElement).value).toBe('dried tomato')
  })

  it('Escape closes only when the wheel is at rest', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))   // wheel now focused
    fireEvent.keyDown(document, { key: 'Escape' })                   // consumed by the wheel
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })                   // wheel at rest → closes
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/wheel/DescribeOverlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/cupping/cva/wheel/DescribeOverlay.tsx`:

```tsx
'use client'

// Full-screen "Describe the cup" overlay — 3 shared group tabs (layout from the
// journey prototype's wheelpanel, minus the Phase-3 voicebox). Full-bleed below
// 1280px (laptops/iPads — Daniel's requirement); inset rounded panel above.

import { useEffect, useRef, useState } from 'react'
import { OLF_CAP, addPickCapped, cataForPicks } from '@/lib/cva/flavor-wheel-data'
import type { CvaDescribe, DescribeGroup, WheelPick } from '@/types/cva'
import { FlavorWheel } from './FlavorWheel'
import { MainTastes } from './MainTastes'
import { MouthfeelCata } from './MouthfeelCata'

interface Props {
  open: boolean
  group: DescribeGroup
  onGroupChange: (g: DescribeGroup) => void
  describe: CvaDescribe
  onDescribe: (mutator: (d: CvaDescribe) => CvaDescribe) => void
  onClose: () => void
}

const GROUPS: { key: DescribeGroup; label: string; sub: string }[] = [
  { key: 'aroma', label: 'Aroma', sub: 'Fragrance + Aroma (orthonasal)' },
  { key: 'flavor_aftertaste', label: 'Flavor & Aftertaste', sub: 'Retronasal' },
  { key: 'mouthfeel', label: 'Mouthfeel', sub: 'Texture & weight' },
]

const NOTE_KEY: Record<DescribeGroup, keyof CvaDescribe['notes']> = {
  aroma: 'fragrance_aroma',
  flavor_aftertaste: 'flavor_aftertaste',
  mouthfeel: 'mouthfeel',
}

export function DescribeOverlay({ open, group, onGroupChange, describe, onDescribe, onClose }: Props) {
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The FlavorWheel (child) registers its Esc handler first (child effects run
  // before parent effects) and preventDefaults while zoomed — so this only
  // closes when the wheel is at rest.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  if (!open) return null

  const isOlfactory = group !== 'mouthfeel'
  const olf = group === 'aroma' ? describe.aroma : describe.flavor_aftertaste

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  const togglePick = (pick: WheelPick) => {
    if (!isOlfactory) return
    const g = group as 'aroma' | 'flavor_aftertaste'
    onDescribe((d) => {
      const cur = d[g]
      const res = addPickCapped(cur.picks, pick)
      if (res.removed) showToast(`Cap of ${OLF_CAP} reached — replaced "${res.removed.path[res.removed.path.length - 1]}"`)
      return { ...d, [g]: { ...cur, picks: res.picks, cata: cataForPicks(res.picks).boxes } }
    })
  }

  const removePick = (pick: WheelPick) => {
    const g = group as 'aroma' | 'flavor_aftertaste'
    onDescribe((d) => {
      const picks = d[g].picks.filter((p) => p.path.join('>') !== pick.path.join('>'))
      return { ...d, [g]: { ...d[g], picks, cata: cataForPicks(picks).boxes } }
    })
  }

  const derived = isOlfactory ? cataForPicks(olf.picks) : null
  const groupCount = (g: DescribeGroup) =>
    g === 'aroma' ? describe.aroma.picks.length
    : g === 'flavor_aftertaste' ? describe.flavor_aftertaste.picks.length + describe.flavor_aftertaste.main_tastes.length
    : describe.mouthfeel.cata.length

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-background xl:inset-6 xl:rounded-[20px] xl:border xl:border-border xl:shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
          <div role="tablist" className="flex gap-2">
            {GROUPS.map((g) => {
              const on = g.key === group
              const n = groupCount(g.key)
              return (
                <button
                  key={g.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => onGroupChange(g.key)}
                  className={`rounded-full border px-4 py-2 text-[13px] font-bold transition ${
                    on ? 'border-transparent text-white' : 'border-border text-muted-foreground'
                  }`}
                  style={on ? { background: 'var(--cva-accent)' } : undefined}
                >
                  {g.label}{n > 0 ? ` · ${n}` : ''}
                </button>
              )
            })}
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
            {GROUPS.find((g) => g.key === group)!.sub} · shared across sections
          </span>
          <button
            type="button"
            aria-label="Close describe"
            onClick={onClose}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-border text-sm font-bold"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 lg:flex-row">
          <div className="mx-auto w-full max-w-[min(94vw,60dvh)] lg:mx-0 lg:max-w-[min(58vw,86dvh)] lg:flex-[1.3]">
            {isOlfactory ? (
              <FlavorWheel picks={olf.picks} onToggle={togglePick} />
            ) : (
              <MouthfeelCata
                value={describe.mouthfeel.cata}
                onChange={(next) => onDescribe((d) => ({ ...d, mouthfeel: { cata: next } }))}
              />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-5">
            {group === 'flavor_aftertaste' && (
              <MainTastes
                value={describe.flavor_aftertaste.main_tastes}
                onChange={(next) =>
                  onDescribe((d) => ({ ...d, flavor_aftertaste: { ...d.flavor_aftertaste, main_tastes: next } }))
                }
              />
            )}

            {isOlfactory && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">Descriptors</span>
                  <span className="rounded-md bg-[var(--cva-accent-soft)] px-2 py-0.5 text-[11px] font-bold">
                    Picks {olf.picks.length}/{OLF_CAP}
                  </span>
                </div>
                <div className="flex min-h-9 flex-wrap gap-1.5">
                  {olf.picks.length === 0 && (
                    <span className="text-xs text-muted-foreground">Tap a family on the wheel, then tap the notes you find.</span>
                  )}
                  {olf.picks.map((p) => (
                    <button
                      key={p.path.join('>')}
                      type="button"
                      aria-label={`Remove ${p.path[p.path.length - 1]}`}
                      onClick={() => removePick(p)}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold hover:border-red-500"
                    >
                      {p.path[p.path.length - 1]}
                      <span className="text-muted-foreground">{p.path.slice(0, -1).join(' › ')}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground" data-testid="derived-cata">
                  <b className="text-foreground">Official form auto-fill</b>
                  {' · '}
                  {derived!.boxes.length ? derived!.boxes.join(', ') : '—'}
                  {derived!.frees.length > 0 && <> · precise notes: {derived!.frees.join(', ')}</>}
                </p>
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Descriptors — freely elicited (off-wheel)
              <input
                aria-label="Descriptors — freely elicited"
                value={describe.notes[NOTE_KEY[group]] ?? ''}
                onChange={(e) =>
                  onDescribe((d) => ({ ...d, notes: { ...d.notes, [NOTE_KEY[group]]: e.target.value } }))
                }
                placeholder='e.g. "dried tomato" — notes the wheel does not cover'
                className="h-11 rounded-[14px] border border-border bg-card px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--cva-accent)]"
              />
            </label>

            {toast && (
              <div className="rounded-[12px] border border-border bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                {toast}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/wheel/DescribeOverlay.test.tsx`
Expected: PASS (6 tests). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/DescribeOverlay.tsx src/components/cupping/cva/wheel/DescribeOverlay.test.tsx
git commit -m "feat(cva): describe-the-cup overlay — group tabs, chips, caps toast, free notes"
```

---

### Task 11: useCvaSession — `setDescribe` + normalize on hydrate

**Files:**
- Modify: `src/hooks/useCvaSession.ts`
- Test: `src/hooks/useCvaSession.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useCvaSession.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCvaSession } from './useCvaSession'
import { createEmptyAssessment } from '@/types/cva'

const sample = { id: 's1', tracking_number: 'BR-1/26', status: null, min_score: 84, requires_descriptors: true }

/** Legacy v1 blob a Phase-1 row could hold (no picks arrays). */
const legacyAssessment = (() => {
  const a = createEmptyAssessment() as unknown as Record<string, unknown>
  a.describe = {
    intensities: { fragrance: 0, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
    aroma: { cata: ['Floral'] },
    flavor_aftertaste: { cata: [], main_tastes: [] },
    mouthfeel: { cata: [] },
    notes: {},
    voice: {},
  }
  return a
})()

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () =>
      init?.method === 'PUT' ? {} : { samples: [sample], assessments: { s1: legacyAssessment } },
  })))
})

describe('useCvaSession describe support', () => {
  it('normalizes loaded assessments and setDescribe mutates + autosaves the blob', async () => {
    const { result } = renderHook(() => useCvaSession('sess-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))

    // hydrated legacy blob got picks arrays
    expect(result.current.assessment.describe.aroma.picks).toEqual([])
    expect(result.current.assessment.describe.aroma.cata).toEqual(['Floral'])

    act(() => {
      result.current.setDescribe((d) => ({
        ...d,
        aroma: { picks: [{ path: ['Fruity', 'Berry', 'Blueberry'] }], cata: ['Fruity', 'Berry'] },
      }))
    })
    expect(result.current.assessment.describe.aroma.picks).toHaveLength(1)

    // debounced PUT carries the describe blob
    await waitFor(() => {
      const put = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => init?.method === 'PUT')
      expect(put).toBeTruthy()
      const body = JSON.parse((put![1] as RequestInit).body as string)
      expect(body.assessment.describe.aroma.picks).toHaveLength(1)
    }, { timeout: 2000 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useCvaSession.test.ts`
Expected: FAIL — `setDescribe` is not a function.

- [ ] **Step 3: Implement**

In `src/hooks/useCvaSession.ts`:

1. Extend the type import (line 4):

```ts
import { createEmptyAssessment, normalizeAssessment, type CvaAssessment, type CvaDescribe, type CvaSectionScore } from '@/types/cva'
```

2. In the hydrate effect, normalize what the API returns — replace

```ts
        const loaded: Record<string, CvaAssessment> = data.assessments ?? {}
```

with

```ts
        const raw: Record<string, CvaAssessment> = data.assessments ?? {}
        const loaded: Record<string, CvaAssessment> = Object.fromEntries(
          Object.entries(raw).map(([id, a]) => [id, normalizeAssessment(a)]),
        )
```

3. Add the setter next to `setRoast` (after line 130):

```ts
  const setDescribe = useCallback((mutator: (d: CvaDescribe) => CvaDescribe) => {
    const id = activeRef.current
    if (!id) return
    update(id, (a) => ({ ...a, describe: mutator(a.describe) }))
  }, [update])
```

4. Add `setDescribe` to the returned object (after `setRoast`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useCvaSession.test.ts`
Expected: PASS (1 test). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCvaSession.ts src/hooks/useCvaSession.test.ts
git commit -m "feat(cva): setDescribe on the session hook + normalize legacy blobs on hydrate"
```

---

### Task 12: SectionScreen — intensity track + descriptor slot

**Files:**
- Modify: `src/components/cupping/cva/SectionScreen.tsx`
- Test: `src/components/cupping/cva/SectionScreen.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/SectionScreen.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionScreen } from './SectionScreen'
import { CVA_SECTIONS } from '@/lib/cva/sections'

const fragrance = CVA_SECTIONS[0]

describe('SectionScreen descriptive block', () => {
  it('renders the intensity track when a handler is provided and reports taps', () => {
    const onIntensityChange = vi.fn()
    render(
      <SectionScreen
        section={fragrance} index={1} total={8}
        value={undefined} onChange={() => {}}
        intensity={0} onIntensityChange={onIntensityChange}
      />,
    )
    expect(screen.getByTestId('intensity-track')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /intensity 9$/i }))
    expect(onIntensityChange).toHaveBeenCalledWith(9)
  })

  it('renders no intensity track without a handler (Overall)', () => {
    render(<SectionScreen section={CVA_SECTIONS[7]} index={8} total={8} value={undefined} onChange={() => {}} />)
    expect(screen.queryByTestId('intensity-track')).toBeNull()
  })

  it('renders the injected descriptor slot and keeps the affective note textarea', () => {
    render(
      <SectionScreen
        section={fragrance} index={1} total={8}
        value={{ note: 'clean cup' }} onChange={() => {}}
        descriptorSlot={<button type="button">Describe aromas</button>}
      />,
    )
    expect(screen.getByRole('button', { name: /describe aromas/i })).toBeTruthy()
    expect((screen.getByPlaceholderText(/affective note/i) as HTMLTextAreaElement).value).toBe('clean cup')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/SectionScreen.test.tsx`
Expected: FAIL — unknown props / missing track.

- [ ] **Step 3: Implement**

Replace `src/components/cupping/cva/SectionScreen.tsx` with:

```tsx
'use client'

import type { ReactNode } from 'react'
import type { CvaSectionDef } from '@/lib/cva/sections'
import type { CvaSectionScore } from '@/types/cva'
import { ImpressionScale } from './ImpressionScale'
import { IntensityTrack } from './IntensityTrack'

interface Props {
  section: CvaSectionDef
  /** 1-based position in the 8-section journey. */
  index: number
  total: number
  value: CvaSectionScore | undefined
  onChange: (patch: Partial<CvaSectionScore>) => void
  onCommit?: (v: number) => void
  /** Descriptive intensity 0–15 (SCA-103). Omit both to hide (Overall has none). */
  intensity?: number
  onIntensityChange?: (v: number) => void
  /** Injected by CvaJourney: a Describe button or the acidity/sweetness note field. */
  descriptorSlot?: ReactNode
}

export function SectionScreen({
  section, index, total, value, onChange, onCommit, intensity, onIntensityChange, descriptorSlot,
}: Props) {
  return (
    <div className="flex w-full max-w-[820px] flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: section.accent }}>
          Section {index} of {total}
        </span>
        <h2 className="text-[clamp(28px,5vw,46px)] font-extrabold leading-none tracking-tight">{section.label}</h2>
        <p className="max-w-[520px] text-sm font-medium text-muted-foreground">{section.hint}</p>
      </div>

      <ImpressionScale
        value={value?.impression}
        finalValue={value?.impression_final}
        accent={section.accent}
        onChange={(v) => onChange({ impression: v })}
        onChangeFinal={(v) => onChange({ impression_final: v })}
        onCommit={onCommit}
      />

      {onIntensityChange && (
        <div className="flex w-full max-w-[560px] flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
            Intensity (0–15)
          </span>
          <IntensityTrack value={intensity ?? 0} accent={section.accent} onChange={onIntensityChange} />
        </div>
      )}

      {descriptorSlot}

      <textarea
        value={value?.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Affective note (optional) — a short justification for the score."
        className="min-h-16 w-full max-w-[560px] rounded-2xl border border-border bg-card p-4 text-sm outline-none focus:border-[var(--cva-accent)]"
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/SectionScreen.test.tsx src/components/cupping/cva/ImpressionScale.test.tsx`
Expected: PASS (3 + the original 5 — the 5 locked ImpressionScale selectors must stay green).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/SectionScreen.tsx src/components/cupping/cva/SectionScreen.test.tsx
git commit -m "feat(cva): section screens gain intensity track + descriptor slot"
```

---

### Task 13: CvaJourney — overlay mount, group routing, reveal soft-gate

**Files:**
- Modify: `src/components/cupping/cva/CvaJourney.tsx`

No new test file — the gate predicate (`describeIsEmpty`) and every child are unit-tested; this task is wiring, verified by `tsc` + the existing suite + the Task 14 manual smoke.

- [ ] **Step 1: Add imports and the group map**

At the top of `CvaJourney.tsx`, extend imports:

```tsx
import { useMemo, useRef, useState } from 'react'
import { describeIsEmpty, type DescribeGroup } from '@/types/cva'
import type { CvaSectionKey } from '@/lib/cva/sections'
import { DescribeOverlay } from './wheel/DescribeOverlay'
```

Below `SCORE_ACCENT`, add:

```tsx
/** Which overlay group a section's Describe button opens (spec §1 table). */
const GROUP_FOR: Partial<Record<CvaSectionKey, DescribeGroup>> = {
  fragrance: 'aroma',
  aroma: 'aroma',
  flavor: 'flavor_aftertaste',
  aftertaste: 'flavor_aftertaste',
  mouthfeel: 'mouthfeel',
}
const NOTE_FOR: Partial<Record<CvaSectionKey, 'acidity' | 'sweetness'>> = {
  acidity: 'acidity',
  sweetness: 'sweetness',
}
```

- [ ] **Step 2: Pull `setDescribe`, add overlay + gate state**

Inside the component, extend the hook destructuring with `setDescribe`, then add state after it:

```tsx
  const { samples, ready, activeId, setActive, assessment, step, setStep, setSectionValue, setRoast, setDescribe, saving, savedAt, scoreOf } = session

  const [describeOpen, setDescribeOpen] = useState(false)
  const [describeGroup, setDescribeGroup] = useState<DescribeGroup>('aroma')
  const [gateOpen, setGateOpen] = useState(false)
  const gateAcked = useRef<Set<string>>(new Set())
```

- [ ] **Step 3: Gate every path into the score step**

Add after `const activeMeta = …`:

```tsx
  // requires_descriptors soft gate — fires on ANY first transition into the
  // score step (footer button, progress-path jump, live-score pill); soft only.
  const goToStep = (n: number) => {
    if (
      n === last &&
      step !== last &&
      activeMeta?.requires_descriptors &&
      !gateAcked.current.has(activeId) &&
      describeIsEmpty(assessment.describe)
    ) {
      setGateOpen(true)
      return
    }
    setStep(n)
  }
```

Then replace the three forward entry points (`Back` stays on `setStep`):
- `<LiveScorePill live={live} onClick={() => setStep(last)} />` → `onClick={() => goToStep(last)}`
- `<ProgressPath steps={steps} current={step} onJump={setStep} />` → `onJump={goToStep}`
- footer next button `onClick={() => setStep(Math.min(last, step + 1))}` → `onClick={() => goToStep(Math.min(last, step + 1))}`
- `<ScoreSummary … onJump={(s) => setStep(s)} />` stays `setStep` (it only jumps backward out of the score step).

- [ ] **Step 4: Build the per-section descriptor slot and wire SectionScreen**

Add above the `return`:

```tsx
  const descriptorSlotFor = (key: CvaSectionKey) => {
    const group = GROUP_FOR[key]
    if (group) {
      const count =
        group === 'aroma' ? assessment.describe.aroma.picks.length
        : group === 'flavor_aftertaste' ? assessment.describe.flavor_aftertaste.picks.length
        : assessment.describe.mouthfeel.cata.length
      return (
        <button
          type="button"
          onClick={() => { setDescribeGroup(group); setDescribeOpen(true) }}
          className="inline-flex items-center gap-2 rounded-[16px] border border-border px-6 py-3 text-sm font-bold transition hover:border-[var(--cva-accent)]"
        >
          Describe
          {count > 0 && (
            <span className="rounded-md px-1.5 py-0.5 text-[11px] font-extrabold text-white" style={{ background: 'var(--cva-accent)' }}>
              {count}
            </span>
          )}
        </button>
      )
    }
    const noteKey = NOTE_FOR[key]
    if (!noteKey) return null
    return (
      <label className="flex w-full max-w-[560px] flex-col gap-1.5 text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
        Descriptors — freely elicited
        <input
          value={assessment.describe.notes[noteKey] ?? ''}
          onChange={(e) => setDescribe((d) => ({ ...d, notes: { ...d.notes, [noteKey]: e.target.value } }))}
          placeholder="SCA gives this section no checklist — write what you taste."
          className="h-11 rounded-[14px] border border-border bg-card px-4 text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--cva-accent)]"
        />
      </label>
    )
  }
```

In the `SectionScreen` JSX (step 1–8 branch), add the new props:

```tsx
              <SectionScreen
                key={`${activeId}:${section.key}`}
                section={section}
                index={step}
                total={8}
                value={assessment.sections[section.key]}
                onChange={(patch) => setSectionValue(section.key, patch)}
                onCommit={() => { if (step < last) goToStep(step + 1) }}
                intensity={section.key === 'overall' ? undefined : assessment.describe.intensities[section.key]}
                onIntensityChange={
                  section.key === 'overall' ? undefined
                  : (v) => setDescribe((d) => ({ ...d, intensities: { ...d.intensities, [section.key]: v } }))
                }
                descriptorSlot={descriptorSlotFor(section.key)}
              />
```

- [ ] **Step 5: Mount the overlay and the gate dialog**

Before the closing `</div>` of the root element, add:

```tsx
      <DescribeOverlay
        open={describeOpen}
        group={describeGroup}
        onGroupChange={setDescribeGroup}
        describe={assessment.describe}
        onDescribe={setDescribe}
        onClose={() => setDescribeOpen(false)}
      />

      {gateOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="w-[min(92vw,420px)] rounded-[20px] border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-sm font-bold">No descriptors recorded</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This quality requires flavor notes. Reveal the score anyway?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGateOpen(false)}
                className="rounded-[12px] border border-border px-4 py-2 text-sm font-semibold"
              >
                Keep describing
              </button>
              <button
                type="button"
                onClick={() => { gateAcked.current.add(activeId); setGateOpen(false); setStep(last) }}
                className="rounded-[12px] px-4 py-2 text-sm font-bold text-white"
                style={{ background: 'var(--cva-accent)' }}
              >
                Reveal anyway
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` → 0 errors. Run: `npx vitest run` → full suite green (156 pre-existing + ~37 new).

- [ ] **Step 7: Commit**

```bash
git add src/components/cupping/cva/CvaJourney.tsx
git commit -m "feat(cva): wire describe overlay, intensities, and reveal soft-gate into the journey"
```

---

### Task 14: Full verification + color-fidelity pass + push

- [ ] **Step 1: Full local gates**

```bash
npx tsc --noEmit        # expected: 0 errors
npx vitest run          # expected: all green, no skips
```

(Do NOT use `npm run build` locally — it fails on the offline Google Fonts fetch; Vercel builds it.)

- [ ] **Step 2: Color-fidelity pass (spec open item)**

Open `docs/superpowers/specs/prototypes/cva-flavor-wheel-prototype.html` in a browser next to page 11 of `Documents/Specialty/AW_SCA-103_Descriptive-Assessment_Sept2024_Secured.pdf`. Compare family-by-family; adjust any obviously-off hex in `src/lib/cva/flavor-wheel-data.ts` (`WHEEL`). Iconic anchors that must read true: Blackberry near-black, Blueberry blue-violet, Lemon yellow, Lime green, Winey dark red, Molasses near-black, Jasmine cream (dark text via the luminance rule). No test changes needed — colors are data.

- [ ] **Step 3: Manual smoke test (laptop)**

1. `/cupping/cva` → pick a CVA sample → start. On Fragrance: rate 1–9, set intensity, hit **Describe** → overlay opens on the **Aroma** tab, full-bleed (<1280px window).
2. Wheel: rest = big center, frosted outer ring; hover Fruity → lifts + unfrosts; dwell → zooms; sweep notes → pop + screen pans; inner ring dwell → half-out; center marker → rest. Pick Blueberry → chip + "Official form auto-fill · Fruity, Berry · precise notes: Blueberry" + "Picks 1/5".
3. Pick 6 notes → toast "Cap of 5 reached — replaced …".
4. Flavor & Aftertaste tab: main tastes cap at 2. Mouthfeel tab: CATA panel, cap 2.
5. Acidity screen: intensity + freely-elicited input (separate from the affective note).
6. Reload the page → describe state restored (autosave). Switch sample tabs → independent describe state.
7. On a `requires_descriptors` quality with nothing described: footer **Reveal**, the progress-path jump, AND the live-score pill each raise the confirm; "Reveal anyway" proceeds and doesn't re-ask.
8. iPad (or DevTools touch emulation): taps only — tap family zooms, tap note picks, tap center marker/back pill exits; no hover artifacts.

- [ ] **Step 4: Push**

```bash
git push   # trunk-based: Vercel deploys main → qc.wolthers.com
```

---

## Out of scope (explicitly)

- Voice describe (Phase 3) — `describe.voice` stays empty.
- Cups & uniformity screen (Phase 4), Coffee Profile + AI highlights (Phase 5), multi-cupper calibration (Phase 6).
- Cup-button auto-routing from the samples list (separate small task, pre-existing TODO).
- Feeding `describe` into Daniel's Descriptive-Form print cards (`src/components/pdf/cva-descriptive-card.tsx`) and certificates — when that lands, remember: certificates print **at most 5 boxes per group** (pick order) and always print the precise descriptors (spec §2).
- Server-side validation of caps (optional hardening; PUT stores the blob as-is today).
