# CVA Flavour Wheel Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the specialty flavour wheel so it runs at 60 fps on desktop and 50+ fps on a mid-range phone, with a camera-fly drill model, desktop edge pan and a mobile thumbstick, losing no existing feature.

**Architecture:** The SVG scene is rendered once and never transforms; a single HTML `#camera` div carries one CSS `translate(...) scale(...)` written from a `requestAnimationFrame` loop that integrates a spring toward a camera target held in a ref. Input handlers only write the target. Hit testing is polar maths over a sorted angle index. No filters anywhere in the wheel; dimming is precomputed muted fills plus opacity. Labels are measured once and shown only when their arc is at least 14 screen px.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Tailwind + one scoped CSS block in `globals.css`, vitest + testing-library (jsdom), Puppeteer (from `~/.claude/skills/chrome-devtools/scripts/node_modules`) for the perf harness.

**Spec:** `docs/superpowers/specs/2026-09-02-cva-wheel-rebuild-design.md`

## Global Constraints

- No emojis in the UI. No mock data. Files stay under ~2000 lines (~2200 max).
- Work on branch `feat/cva-wheel-rebuild` in a worktree (create it with the `superpowers:using-git-worktrees` skill at execution start). **Do not touch** the main tree's uncommitted files (`src/app/cupping/page.tsx` and the CVA Panel Task-4 edits). Merge to `main` only after Task 12's verification; Vercel auto-deploys `main`.
- **No Supabase schema change** in this plan. Persistence (`onToggle` → `DescribeOverlay` → `useCvaSession` → `cupping_scores.scores`) is untouched.
- **No new rendering dependency** (no d3, framer-motion, react-spring, pixi). The spring is hand-rolled.
- Architecture rules 1–8 of the spec are copied verbatim into the header comment of `FlavorWheel.tsx` (Task 9). Inside the wheel root: no `transform`/`transition`/`animation` on any SVG element, no `filter`/`backdrop-filter`/`box-shadow`/`drop-shadow`, no layout reads (`getBoundingClientRect`, `getBBox`, `getComputedTextLength`) on any per-frame or per-pointer-move path.
- Zoom caps: `MAX_SCALE_DESKTOP = 1.5`, `MAX_SCALE_MOBILE = 3`, `MIN_SCALE = 1`. Mobile = the existing `COMPACT_MQ` rule `'(max-width: 1023px), (pointer: coarse)'`.
- `prefers-reduced-motion: reduce` → camera moves are instant, edge pan disabled, thumbstick still works.
- Geometry stays in `src/lib/cva/flavor-wheel-data.ts` (`VIEW=440, CX=CY=220, R0=58, R1=106, R2=158, R3=212`, `NODES`, `arcPathD`) — it is shared with the certificate and is not modified.
- Baseline is recorded in Task 1 Step 0 and quoted in every commit. There is no `npm run typecheck`; use `npx tsc --noEmit`. Run one file with `npx vitest run <path>`.
- Commit messages: `type(scope): message`, scope `cva`.

## File map

| File | Responsibility |
|---|---|
| `src/components/cupping/cva/wheel/palette.ts` (+`.test.ts`) | **create** — build-time colours: muted fill per node, label colour by contrast, helpers. |
| `src/components/cupping/cva/wheel/hit-test.ts` (+`.test.ts`) | **create** — sorted angle index per ring, `nodeAtScene`, region classification. |
| `src/components/cupping/cva/wheel/camera.ts` (+`.test.ts`) | **create** — pure camera maths: spring, transforms, anchored zoom, clamps, fly-to, edge pan. |
| `src/components/cupping/cva/wheel/labels.ts` (+`.test.ts`) | **create** — label geometry, one-time measurement cache, visibility and font-size rules. |
| `src/components/cupping/cva/wheel/gestures.ts` (+`.test.ts`) | **create** — pure touch state machine (long-press, pinch, two-finger pan, double-tap, swipe-down). |
| `src/components/cupping/cva/wheel/WheelScene.tsx` (+`.test.tsx`) | **create** — the static SVG (arcs + labels), memoised. |
| `src/components/cupping/cva/wheel/Thumbstick.tsx` (+`.test.tsx`) | **create** — the mobile stick. |
| `src/components/cupping/cva/wheel/DebugHud.tsx` | **create** — `?debug=1` frame-time overlay. |
| `src/components/cupping/cva/wheel/FlavorWheel.tsx` (+`.test.tsx`) | **rewrite** — root: listener, rAF loop, keyboard, chrome. |
| `src/components/cupping/cva/wheel/zoom-machine.ts` (+`.test.ts`) | **delete**. |
| `src/components/cupping/cva/wheel/DescribeOverlay.tsx` (+`.test.tsx`) | **modify** — no backdrop blur, no shade logic, collapsible mobile tray. |
| `src/app/globals.css:180-247` | **replace** the `.cva-wheel-*` block with the `.wheel-*` block. |
| `src/app/embed/wheel-harness/page.tsx` + `harness.tsx` | **create** — dev-only perf harness route (`notFound()` in production). |
| `scripts/perf/trace-wheel.mjs`, `scripts/perf/analyze-trace.mjs` | **create** — Puppeteer trace driver + analyser (from the Phase 0 scratchpad). |
| `PROGRESS.md` | **create** — architecture decision + before/after numbers. |

---

### Task 1: Palette — muted fills and label colours, computed once

**Files:**
- Create: `src/components/cupping/cva/wheel/palette.ts`
- Test: `src/components/cupping/cva/wheel/palette.test.ts`

**Interfaces:**
- Consumes: `NODES`, `WheelNode` from `@/lib/cva/flavor-wheel-data`.
- Produces: `SURFACE = '#2E2E29'`; `hexToRgb(hex): [r,g,b]`; `rgbToHex([r,g,b]): string`; `relativeLuminance(hex): number`; `contrastRatio(a, b): number`; `mutedColor(hex, surface?): string`; `labelColor(fillHex): '#f3f0e8' | '#1c1c1c'`; `PALETTE: ReadonlyMap<string, { fill: string; muted: string; label: string }>` keyed by `node.path.join('>')`.

- [ ] **Step 0: Record the baseline** (once, before any code)

Run in the worktree: `npx tsc --noEmit; npx vitest run 2>&1 | tail -5`. Write the file/test counts into this plan's Global Constraints line ("Baseline, measured YYYY-MM-DD on `<sha>`: …").

- [ ] **Step 1: Write the failing test**

```ts
// src/components/cupping/cva/wheel/palette.test.ts
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
    expect(labelColor('#f2e8d2')).toBe('#1c1c1c')
    expect(labelColor('#2b2030')).toBe('#f3f0e8')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/palette.test.ts`
Expected: FAIL — cannot resolve `./palette`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/cupping/cva/wheel/palette.ts
// Build-time colour work for the wheel. Everything here runs ONCE at module
// load; nothing in the render or frame path does colour maths.
import { NODES } from '@/lib/cva/flavor-wheel-data'

/** The warm-dark ground the wheel sits on (spec: Visual treatment). */
export const SURFACE = '#2E2E29'
const LABEL_LIGHT = '#f3f0e8'
const LABEL_DARK = '#1c1c1c'

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG 2.x relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colours, 1 … 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The dimmed variant of a family colour: desaturate to ~22% of the original
 * saturation, then pull 55% of the way toward the surface. Colour stays
 * identifiable (the blur it replaces destroyed that) at a fraction of the cost.
 */
export function mutedColor(hex: string, surface: string = SURFACE): string {
  const [r, g, b] = hexToRgb(hex)
  const grey = 0.299 * r + 0.587 * g + 0.114 * b
  const keep = 0.22
  const ds: [number, number, number] = [grey + (r - grey) * keep, grey + (g - grey) * keep, grey + (b - grey) * keep]
  const [sr, sg, sb] = hexToRgb(surface)
  const t = 0.55
  return rgbToHex([ds[0] + (sr - ds[0]) * t, ds[1] + (sg - ds[1]) * t, ds[2] + (sb - ds[2]) * t])
}

/** Label colour that reaches ≥ 4.5:1 against the wedge fill (light text wins ties). */
export function labelColor(fillHex: string): typeof LABEL_LIGHT | typeof LABEL_DARK {
  return contrastRatio(LABEL_LIGHT, fillHex) >= contrastRatio(LABEL_DARK, fillHex) ? LABEL_LIGHT : LABEL_DARK
}

export interface PaletteEntry { fill: string; muted: string; label: string }

/** One entry per wheel node, keyed by `path.join('>')`. */
export const PALETTE: ReadonlyMap<string, PaletteEntry> = new Map(
  NODES.map((n) => [n.path.join('>'), { fill: n.color, muted: mutedColor(n.color), label: labelColor(n.color) }]),
)
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/palette.test.ts`
Expected: PASS (5 tests). If the 4.5:1 assertion fails for a mid-luminance node, both candidates fall short; fix by darkening `LABEL_DARK` to `#101010` or lightening `LABEL_LIGHT` to `#ffffff` — do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/palette.ts src/components/cupping/cva/wheel/palette.test.ts
git commit -m "feat(cva): wheel palette — precomputed muted fills and contrast-checked label colours"
```

---

### Task 2: Hit testing — polar maths over a sorted angle index

**Files:**
- Create: `src/components/cupping/cva/wheel/hit-test.ts`
- Test: `src/components/cupping/cva/wheel/hit-test.test.ts`

**Interfaces:**
- Consumes: `NODES`, `WheelNode`, `CX, CY, R0, R1, R2, R3` from `@/lib/cva/flavor-wheel-data`.
- Produces: `type Region = { kind: 'hub' } | { kind: 'outside' } | { kind: 'node'; node: WheelNode }`; `regionAtScene(x, y): Region`; `nodeAtScene(x, y): WheelNode | null`; `normalizeAngle(theta): number` (into `[-π/2, 3π/2)`, the wheel's start angle); `RING_INDEX` (exported for tests).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/cupping/cva/wheel/hit-test.test.ts
import { describe, it, expect } from 'vitest'
import { NODES, CX, CY, R0, R3, nodeAt } from '@/lib/cva/flavor-wheel-data'
import { nodeAtScene, regionAtScene, normalizeAngle } from './hit-test'

describe('hit-test', () => {
  it('normalises any angle into the wheel range starting at −π/2', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(normalizeAngle(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI)
  })

  it('hub and outside are classified, never as a node', () => {
    expect(regionAtScene(CX, CY).kind).toBe('hub')
    expect(regionAtScene(CX + R0 - 1, CY).kind).toBe('hub')
    expect(regionAtScene(CX + R3 + 1, CY).kind).toBe('outside')
    expect(nodeAtScene(CX, CY)).toBeNull()
  })

  it('agrees with the brute-force linear search for 5,000 random points', () => {
    let seed = 42
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * 440, y = rnd() * 440
      const a = nodeAtScene(x, y), b = nodeAt(x, y)
      expect(a?.path.join('>') ?? null, `(${x.toFixed(1)},${y.toFixed(1)})`).toBe(b?.path.join('>') ?? null)
    }
  })

  it('hits every node at its own centroid, including both sides of the seam', () => {
    for (const n of NODES) {
      const mid = (n.a0 + n.a1) / 2, r = (n.r0 + n.r1) / 2
      expect(nodeAtScene(CX + Math.cos(mid) * r, CY + Math.sin(mid) * r)?.path).toEqual(n.path)
    }
    // straight up is the seam: first family on one side, last on the other
    const first = NODES.find((n) => n.ring === 1)!, last = [...NODES].reverse().find((n) => n.ring === 1)!
    expect(nodeAtScene(CX + 0.01, CY - 80)?.name).toBe(first.name)
    expect(nodeAtScene(CX - 0.01, CY - 80)?.name).toBe(last.name)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/hit-test.test.ts`
Expected: FAIL — cannot resolve `./hit-test`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/cupping/cva/wheel/hit-test.ts
// Pointer → wheel node with no DOM involvement: radius picks the ring, a
// binary search over that ring's sorted start angles picks the node. O(log n),
// identical for mouse and touch, and safe to call on every pointer move.
import { NODES, CX, CY, R0, R3, type WheelNode } from '@/lib/cva/flavor-wheel-data'

const TAU = Math.PI * 2
const START = -Math.PI / 2

export type Region = { kind: 'hub' } | { kind: 'outside' } | { kind: 'node'; node: WheelNode }

/** Wrap into [START, START + 2π). */
export function normalizeAngle(theta: number): number {
  let t = theta
  while (t < START) t += TAU
  while (t >= START + TAU) t -= TAU
  return t
}

interface RingIndex { r0: number; r1: number; starts: number[]; nodes: WheelNode[] }

/**
 * One index per radial band. Ring 2.5 nodes (childless mids spanning rings
 * 2–3) are listed in BOTH the ring-2 and ring-3 bands so a radius test on
 * either band finds them.
 */
export const RING_INDEX: readonly RingIndex[] = (() => {
  const bands: Array<{ r0: number; r1: number; pick: (n: WheelNode) => boolean }> = [
    { r0: R0, r1: NODES.find((n) => n.ring === 1)!.r1, pick: (n) => n.ring === 1 },
    { r0: NODES.find((n) => n.ring === 2)!.r0, r1: NODES.find((n) => n.ring === 2)!.r1, pick: (n) => n.ring === 2 || n.ring === 2.5 },
    { r0: NODES.find((n) => n.ring === 3)!.r0, r1: R3, pick: (n) => n.ring === 3 || n.ring === 2.5 },
  ]
  return bands.map(({ r0, r1, pick }) => {
    const nodes = NODES.filter(pick).sort((a, b) => a.a0 - b.a0)
    return { r0, r1, starts: nodes.map((n) => n.a0), nodes }
  })
})()

function lowerBound(starts: number[], theta: number): number {
  // last index whose start <= theta
  let lo = 0, hi = starts.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= theta) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

export function regionAtScene(x: number, y: number): Region {
  const dx = x - CX, dy = y - CY
  const r = Math.hypot(dx, dy)
  if (r <= R0) return { kind: 'hub' }
  if (r >= R3) return { kind: 'outside' }
  const theta = normalizeAngle(Math.atan2(dy, dx))
  for (const band of RING_INDEX) {
    if (r < band.r0 || r >= band.r1) continue
    const i = lowerBound(band.starts, theta)
    if (i < 0) return { kind: 'outside' }
    const n = band.nodes[i]
    if (theta < n.a1) return { kind: 'node', node: n }
    return { kind: 'outside' }   // hairline gap between wedges
  }
  return { kind: 'outside' }
}

export function nodeAtScene(x: number, y: number): WheelNode | null {
  const reg = regionAtScene(x, y)
  return reg.kind === 'node' ? reg.node : null
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/hit-test.test.ts`
Expected: PASS (4 tests). The brute-force comparison uses `nodeAt` from the data file, which is the definition of correctness here.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/hit-test.ts src/components/cupping/cva/wheel/hit-test.test.ts
git commit -m "feat(cva): wheel hit-test — polar maths over a per-ring sorted angle index"
```

---

### Task 3: Camera — spring, transforms, anchored zoom, clamps, fly-to, edge pan

**Files:**
- Create: `src/components/cupping/cva/wheel/camera.ts`
- Test: `src/components/cupping/cva/wheel/camera.test.ts`

**Interfaces:**
- Consumes: `CX, CY, R0, R3, VIEW`, `WheelNode` from `@/lib/cva/flavor-wheel-data`.
- Produces:
  - `interface Camera { x: number; y: number; scale: number }` (scene units; `scale 1` = whole wheel fits `min(w,h)`)
  - `interface Viewport { width: number; height: number }` (root size in CSS px)
  - `MIN_SCALE = 1`, `MAX_SCALE_DESKTOP = 1.5`, `MAX_SCALE_MOBILE = 3`, `RESPONSIVENESS = 9`, `MAX_PAN_SPEED = 900`, `EDGE_BAND = 0.14`, `RUBBER_PX = 60`, `EDGE_PAN_MIN_SCALE = 1.05`
  - `restCamera(): Camera` → `{ x: CX, y: CY, scale: 1 }`
  - `pxPerUnit(vp): number` → `min(w,h) / VIEW`
  - `cameraTransform(cam, vp): string` → the CSS transform for `#camera`
  - `screenToWorld(px, py, cam, vp): { x, y }`, `worldToScreen(x, y, cam, vp): { x, y }`
  - `zoomAt(cam, vp, px, py, factor, maxScale): Camera` (anchored)
  - `clampCamera(cam, vp, slackPx = 0): Camera`
  - `springStep(current, target, dtSeconds): Camera` and `isSettled(current, target): boolean`
  - `flyToNode(node, vp, maxScale): Camera`
  - `edgePanVelocity(px, py, vp, scale, reduced: boolean): { vx, vy }` (scene units/s)
  - `easeInOutCubic(p): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/cupping/cva/wheel/camera.test.ts
import { describe, it, expect } from 'vitest'
import { CX, CY, NODES, R3 } from '@/lib/cva/flavor-wheel-data'
import {
  restCamera, pxPerUnit, cameraTransform, screenToWorld, worldToScreen, zoomAt, clampCamera,
  springStep, isSettled, flyToNode, edgePanVelocity, MAX_SCALE_DESKTOP, MAX_SCALE_MOBILE, MAX_PAN_SPEED,
} from './camera'

const vp = { width: 1000, height: 800 }

describe('camera transforms', () => {
  it('rest camera puts the wheel centre at the viewport centre with an identity-scale transform', () => {
    expect(cameraTransform(restCamera(), vp)).toBe('translate(0px, 0px) scale(1)')
    const c = worldToScreen(CX, CY, restCamera(), vp)
    expect(c.x).toBeCloseTo(500); expect(c.y).toBeCloseTo(400)
  })

  it('screenToWorld inverts worldToScreen at any camera', () => {
    const cam = { x: 300, y: 150, scale: 2.2 }
    for (const [x, y] of [[0, 0], [123, 456], [999, 1]]) {
      const s = worldToScreen(x, y, cam, vp)
      const w = screenToWorld(s.x, s.y, cam, vp)
      expect(w.x).toBeCloseTo(x, 6); expect(w.y).toBeCloseTo(y, 6)
    }
  })

  it('anchored zoom keeps the scene point under the pointer fixed', () => {
    const cam = restCamera()
    const px = 720, py = 260
    const before = screenToWorld(px, py, cam, vp)
    const next = zoomAt(cam, vp, px, py, 1.3, MAX_SCALE_MOBILE)
    const after = screenToWorld(px, py, next, vp)
    expect(after.x).toBeCloseTo(before.x, 6); expect(after.y).toBeCloseTo(before.y, 6)
    expect(next.scale).toBeCloseTo(1.3)
  })

  it('zoom is clamped to [1, max] and never drifts below the whole-wheel view', () => {
    expect(zoomAt(restCamera(), vp, 500, 400, 0.5, MAX_SCALE_DESKTOP).scale).toBe(1)
    expect(zoomAt(restCamera(), vp, 500, 400, 10, MAX_SCALE_DESKTOP).scale).toBe(MAX_SCALE_DESKTOP)
    expect(zoomAt(restCamera(), vp, 500, 400, 10, MAX_SCALE_MOBILE).scale).toBe(MAX_SCALE_MOBILE)
  })
})

describe('clampCamera', () => {
  it('at scale 1 the camera is pinned to the wheel centre', () => {
    const c = clampCamera({ x: 900, y: -50, scale: 1 }, vp)
    expect(c.x).toBe(CX); expect(c.y).toBe(CY)
  })

  it('zoomed in, the viewport may not leave the wheel disc by more than the slack', () => {
    const f = pxPerUnit(vp)
    const cam = { x: 10_000, y: CY, scale: 3 }
    const c = clampCamera(cam, vp, 60)
    const halfW = vp.width / 2 / (f * 3)
    expect(c.x).toBeCloseTo(CX + R3 - halfW + 60 / (f * 3), 6)
    const hard = clampCamera(cam, vp, 0)
    expect(hard.x).toBeCloseTo(CX + R3 - halfW, 6)
  })
})

describe('spring', () => {
  it('is frame-rate independent: 60 steps of 1/60 land where 6 steps of 1/6 land (within 1%)', () => {
    const tgt = { x: 300, y: 300, scale: 2 }
    let a = restCamera(); for (let i = 0; i < 60; i++) a = springStep(a, tgt, 1 / 60)
    let b = restCamera(); for (let i = 0; i < 6; i++) b = springStep(b, tgt, 1 / 6)
    expect(Math.abs(a.x - b.x)).toBeLessThan(1)
    expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.02)
  })

  it('settles and snaps', () => {
    const tgt = { x: 250, y: 200, scale: 1.4 }
    let c = restCamera()
    for (let i = 0; i < 400 && !isSettled(c, tgt); i++) c = springStep(c, tgt, 1 / 60)
    expect(isSettled(c, tgt)).toBe(true)
    expect(springStep(c, tgt, 1 / 60)).toEqual(tgt)   // snapped exactly once settled
  })
})

describe('flyToNode', () => {
  it('centres on the sector centroid and lands at the desktop cap', () => {
    const fruity = NODES.find((n) => n.name === 'Fruity')!
    const c = flyToNode(fruity, vp, MAX_SCALE_DESKTOP)
    const mid = (fruity.a0 + fruity.a1) / 2
    const raw = { x: CX + Math.cos(mid) * (fruity.r0 + R3) / 2, y: CY + Math.sin(mid) * (fruity.r0 + R3) / 2, scale: MAX_SCALE_DESKTOP }
    const clamped = clampCamera(raw, vp)          // the viewport may not leave the disc
    expect(c.x).toBeCloseTo(clamped.x, 6); expect(c.y).toBeCloseTo(clamped.y, 6)
    expect(c.scale).toBe(MAX_SCALE_DESKTOP)
  })

  it('on a phone frames a narrow family at ~80% of the viewport, within the mobile cap', () => {
    const phone = { width: 390, height: 600 }
    const nutty = NODES.find((n) => n.name === 'Nutty/Cocoa')!
    const c = flyToNode(nutty, phone, MAX_SCALE_MOBILE)
    expect(c.scale).toBeGreaterThan(1); expect(c.scale).toBeLessThanOrEqual(MAX_SCALE_MOBILE)
  })
})

describe('edgePanVelocity', () => {
  it('is zero inside the band, at scale ≤ 1.05, and under reduced motion', () => {
    expect(edgePanVelocity(500, 400, vp, 2, false)).toEqual({ vx: 0, vy: 0 })
    expect(edgePanVelocity(5, 400, vp, 1, false)).toEqual({ vx: 0, vy: 0 })
    expect(edgePanVelocity(5, 400, vp, 2, true)).toEqual({ vx: 0, vy: 0 })
  })

  it('ramps toward the edge, divides by scale, and clamps the corner magnitude', () => {
    const edge = edgePanVelocity(0, 400, vp, 2, false)
    expect(edge.vx).toBeCloseTo(-MAX_PAN_SPEED / 2, 3); expect(edge.vy).toBe(0)
    const half = edgePanVelocity(vp.width * 0.14 * 0.5, 400, vp, 2, false)
    expect(Math.abs(half.vx)).toBeLessThan(Math.abs(edge.vx)); expect(half.vx).toBeLessThan(0)
    const corner = edgePanVelocity(0, 0, vp, 2, false)
    expect(Math.hypot(corner.vx, corner.vy)).toBeCloseTo(MAX_PAN_SPEED / 2, 3)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/camera.test.ts`
Expected: FAIL — cannot resolve `./camera`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/cupping/cva/wheel/camera.ts
// Pure camera maths for the wheel. No DOM, no React. The component keeps
// `current` and `target` in a ref and calls springStep once per rAF.
import { CX, CY, R3, VIEW, type WheelNode } from '@/lib/cva/flavor-wheel-data'

export interface Camera { x: number; y: number; scale: number }
export interface Viewport { width: number; height: number }

export const MIN_SCALE = 1
export const MAX_SCALE_DESKTOP = 1.5   // Daniel 2026-09-02
export const MAX_SCALE_MOBILE = 3      // Daniel 2026-09-02
export const RESPONSIVENESS = 9        // spring: k = 1 − e^(−dt·R)
export const MAX_PAN_SPEED = 900       // scene units / s at scale 1
export const EDGE_BAND = 0.14          // outer 14% of each viewport side
export const EDGE_PAN_MIN_SCALE = 1.05
export const RUBBER_PX = 60
const EPS_POS = 0.02, EPS_SCALE = 0.0005

export const restCamera = (): Camera => ({ x: CX, y: CY, scale: 1 })

/** CSS px per scene unit at scale 1: the wheel always fits the shorter side. */
export const pxPerUnit = (vp: Viewport): number => Math.min(vp.width, vp.height) / VIEW

/**
 * The ONE transform in the wheel. #camera has transform-origin 50% 50% and is
 * the size of the root, with the svg centred inside it, so scaling about the
 * centre then translating by −(cam − C)·f·s puts scene point `cam` at the
 * viewport centre.
 */
export function cameraTransform(cam: Camera, vp: Viewport): string {
  const k = pxPerUnit(vp) * cam.scale
  const tx = -(cam.x - CX) * k, ty = -(cam.y - CY) * k
  return `translate(${round(tx)}px, ${round(ty)}px) scale(${round(cam.scale)})`
}
const round = (v: number) => Math.round(v * 1000) / 1000

export function screenToWorld(px: number, py: number, cam: Camera, vp: Viewport): { x: number; y: number } {
  const k = pxPerUnit(vp) * cam.scale
  return { x: cam.x + (px - vp.width / 2) / k, y: cam.y + (py - vp.height / 2) / k }
}

export function worldToScreen(x: number, y: number, cam: Camera, vp: Viewport): { x: number; y: number } {
  const k = pxPerUnit(vp) * cam.scale
  return { x: vp.width / 2 + (x - cam.x) * k, y: vp.height / 2 + (y - cam.y) * k }
}

const clampScale = (s: number, max: number) => Math.max(MIN_SCALE, Math.min(max, s))

/** Zoom by `factor` keeping the scene point under (px, py) fixed (spec: Zoom anchoring). */
export function zoomAt(cam: Camera, vp: Viewport, px: number, py: number, factor: number, maxScale: number): Camera {
  const before = screenToWorld(px, py, cam, vp)
  const scaled = { ...cam, scale: clampScale(cam.scale * factor, maxScale) }
  const after = screenToWorld(px, py, scaled, vp)
  return { x: scaled.x + before.x - after.x, y: scaled.y + before.y - after.y, scale: scaled.scale }
}

/**
 * Keep the viewport on the wheel disc. If the viewport is larger than the disc
 * on an axis, the camera is pinned to the centre on that axis; otherwise it may
 * roam until the viewport edge meets the disc edge, plus `slackPx` of rubber band.
 */
export function clampCamera(cam: Camera, vp: Viewport, slackPx = 0): Camera {
  const k = pxPerUnit(vp) * cam.scale
  const slack = slackPx / k
  const axis = (c: number, centre: number, halfPx: number) => {
    const half = halfPx / k
    const room = R3 - half
    if (room <= 0) return centre
    return Math.max(centre - room - slack, Math.min(centre + room + slack, c))
  }
  return { x: axis(cam.x, CX, vp.width / 2), y: axis(cam.y, CY, vp.height / 2), scale: cam.scale }
}

/** Critically damped, frame-rate independent step toward `target`. Snaps once settled. */
export function springStep(cur: Camera, tgt: Camera, dt: number): Camera {
  if (isSettled(cur, tgt)) return { ...tgt }
  const k = 1 - Math.exp(-Math.min(dt, 0.1) * RESPONSIVENESS)
  return { x: cur.x + (tgt.x - cur.x) * k, y: cur.y + (tgt.y - cur.y) * k, scale: cur.scale + (tgt.scale - cur.scale) * k }
}

export const isSettled = (cur: Camera, tgt: Camera): boolean =>
  Math.abs(cur.x - tgt.x) < EPS_POS && Math.abs(cur.y - tgt.y) < EPS_POS && Math.abs(cur.scale - tgt.scale) < EPS_SCALE

/**
 * Camera that frames a family/group: centred on the sector centroid (mid angle,
 * mid radius between the node's inner edge and the rim), scaled so the sector's
 * chord × depth fills ~80% of the viewport, clamped to [1, maxScale]. On desktop
 * the 1.5 cap always wins; on a phone this is what makes a narrow family fill
 * the screen.
 */
export function flyToNode(node: WheelNode, vp: Viewport, maxScale: number): Camera {
  const mid = (node.a0 + node.a1) / 2
  const rMid = (node.r0 + R3) / 2
  const f = pxPerUnit(vp)
  const chord = 2 * R3 * Math.sin(Math.min(Math.PI, node.a1 - node.a0) / 2)
  const depth = R3 - node.r0
  const wanted = 0.8 * Math.min(vp.width / (chord * f), vp.height / (depth * f))
  const scale = clampScale(wanted, maxScale)
  return clampCamera({ x: CX + Math.cos(mid) * rMid, y: CY + Math.sin(mid) * rMid, scale }, vp)
}

export const easeInOutCubic = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)

/**
 * Desktop edge-proximity pan (spec: Desktop interactions). Penetration into the
 * outer band ramps the speed; dividing by scale keeps the apparent speed
 * constant; corners are clamped so diagonals are not 1.41× faster.
 */
export function edgePanVelocity(px: number, py: number, vp: Viewport, scale: number, reduced: boolean): { vx: number; vy: number } {
  if (reduced || scale <= EDGE_PAN_MIN_SCALE) return { vx: 0, vy: 0 }
  const band = (pos: number, size: number): number => {
    const b = size * EDGE_BAND
    if (pos < b) return -easeInOutCubic(1 - pos / b)
    if (pos > size - b) return easeInOutCubic(1 - (size - pos) / b)
    return 0
  }
  const max = MAX_PAN_SPEED / scale
  let vx = band(px, vp.width) * max, vy = band(py, vp.height) * max
  const mag = Math.hypot(vx, vy)
  if (mag > max) { vx *= max / mag; vy *= max / mag }
  return { vx, vy }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/camera.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/camera.ts src/components/cupping/cva/wheel/camera.test.ts
git commit -m "feat(cva): wheel camera maths — spring, anchored zoom, clamps, fly-to, edge pan"
```

---

### Task 4: Labels — geometry once, measurement once, visibility by arc length

**Files:**
- Create: `src/components/cupping/cva/wheel/labels.ts`
- Test: `src/components/cupping/cva/wheel/labels.test.ts`

**Interfaces:**
- Consumes: `NODES`, `CX, CY, R0, R1, R2, R3`, `WheelNode` from `@/lib/cva/flavor-wheel-data`; `PALETTE` from `./palette`; `pxPerUnit`, `Viewport` from `./camera`.
- Produces:
  - `type LabelGeo = { kind: 'radial'; x; y; deg; anchor: 'start'|'end'; base: number; weight: number; fill: string; lines: string[] } | { kind: 'arc'; pathD: string; pid: string; base: number; fill: string; text: string }` — `base` is the font size in scene units at scale 1 (the old `size`).
  - `LABELS: readonly LabelGeo[]` (index-aligned with `NODES`), `splitLabel(str, maxChars): string[]` (moved verbatim from the old `FlavorWheel.tsx`).
  - `MIN_LABEL_PX = 11`, `MAX_LABEL_PX = 15`, `MIN_ARC_PX = 14`.
  - `arcLengthPx(node, vp, scale): number`, `visibleLabelKeys(vp, scale, focusFamily: string | null): Set<string>` (keys = `path.join('>')`), `ringFontSizes(vp, scale): { r1: number; r2: number; r3: number }` (scene-unit font sizes that render between 11 and 15 px).
  - `measureLabels(font: string): Map<string, number>` — one-time canvas measurement of every line's width in px at 10 px, cached in `LABEL_WIDTHS`; `estimateWidth(text): number` fallback (0.55 em per char); `labelFits(node, vp, scale): boolean` (radial: widest line ≤ ring depth − padding; arc: text length ≤ arc length).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/cupping/cva/wheel/labels.test.ts
import { describe, it, expect } from 'vitest'
import { NODES, R2, R3 } from '@/lib/cva/flavor-wheel-data'
import { LABELS, splitLabel, arcLengthPx, visibleLabelKeys, ringFontSizes, labelFits, estimateWidth, MIN_ARC_PX, MIN_LABEL_PX, MAX_LABEL_PX } from './labels'

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
    expect(visibleLabelKeys(phone, 1, null).has(leaf.path.join('>'))).toBe(false)
    expect(arcLengthPx(leaf, phone, 3)).toBeGreaterThanOrEqual(MIN_ARC_PX)
    expect(visibleLabelKeys(phone, 3, null).has(leaf.path.join('>'))).toBe(true)
  })

  it('a focused family hides every other family's labels', () => {
    const keys = visibleLabelKeys(desktop, 1.5, 'Fruity')
    for (const k of keys) expect(k.startsWith('Fruity')).toBe(true)
    expect(keys.size).toBeGreaterThan(3)
  })

  it('ring font sizes render between 11 and 15 px at any scale', () => {
    for (const [vp, s] of [[phone, 1], [phone, 3], [desktop, 1], [desktop, 1.5]] as const) {
      const k = Math.min(vp.width, vp.height) / 440 * s
      const fs = ringFontSizes(vp, s)
      for (const v of [fs.r1, fs.r2, fs.r3]) {
        expect(v * k).toBeGreaterThanOrEqual(MIN_LABEL_PX - 1e-6)
        expect(v * k).toBeLessThanOrEqual(MAX_LABEL_PX + 1e-6)
      }
    }
  })

  it('fit uses the estimate when nothing was measured, and a long radial label fails in a shallow ring', () => {
    expect(estimateWidth('Isovaleric Acid')).toBeGreaterThan(estimateWidth('Lime'))
    const iso = NODES.find((n) => n.name === 'Isovaleric Acid')!
    expect(labelFits(iso, phone, 3)).toBe(true)     // ring depth 54 units × 0.886 × 3 = 143 px
    expect(labelFits(iso, phone, 1)).toBe(false)    // 48 px of depth cannot hold it at 11 px
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/labels.test.ts`
Expected: FAIL — cannot resolve `./labels`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/cupping/cva/wheel/labels.ts
// Label geometry (computed once), one-time text measurement, and the two
// rules the frame loop applies only on settle: which labels are visible and
// how big each ring's text is. Nothing here touches the DOM per frame.
import { NODES, CX, CY, R0, R1, R2, R3, type WheelNode } from '@/lib/cva/flavor-wheel-data'
import { PALETTE } from './palette'
import { pxPerUnit, type Viewport } from './camera'

export const MIN_LABEL_PX = 11
export const MAX_LABEL_PX = 15
export const MIN_ARC_PX = 14
const ARC_FAMS = new Set(['Green/Vegetative', 'Sour/Fermented'])

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

export type LabelGeo =
  | { kind: 'radial'; x: number; y: number; deg: number; anchor: 'start' | 'end'; base: number; weight: number; fill: string; lines: string[] }
  | { kind: 'arc'; pathD: string; pid: string; base: number; fill: string; text: string }

function labelGeoFor(nd: WheelNode, idx: number): LabelGeo {
  const mid = (nd.a0 + nd.a1) / 2
  const fill = PALETTE.get(nd.path.join('>'))!.label
  if (nd.ring === 1 && ARC_FAMS.has(nd.name)) {
    const down = Math.sin(mid) > 0
    const r = down ? 86 : 79
    const P = (a: number) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r]
    const [xs, ys] = P(down ? nd.a1 : nd.a0)
    const [xe, ye] = P(down ? nd.a0 : nd.a1)
    return { kind: 'arc', pid: `wheel-lp-${idx}`, pathD: `M${xs},${ys}A${r},${r} 0 0 ${down ? 0 : 1} ${xe},${ye}`, base: 7, fill, text: nd.name.toUpperCase() }
  }
  const conf =
    nd.ring === 1 ? { r: R0 + 8, base: 7, weight: 800, max: 10, text: nd.name.toUpperCase() }
    : nd.ring === 2 ? { r: R1 + 6, base: 5.6, weight: 700, max: 11, text: nd.name }
    : nd.ring === 2.5 ? { r: R1 + 6, base: 5.4, weight: 700, max: 22, text: nd.name }
    : { r: R2 + 4, base: 4.9, weight: 600, max: 22, text: nd.name }
  let deg = (mid * 180) / Math.PI
  let anchor: 'start' | 'end' = 'start'
  if (deg > 90 && deg < 270) { deg += 180; anchor = 'end' }
  return { kind: 'radial', x: CX + Math.cos(mid) * conf.r, y: CY + Math.sin(mid) * conf.r, deg, anchor, base: conf.base, weight: conf.weight, fill, lines: splitLabel(conf.text, conf.max) }
}

export const LABELS: readonly LabelGeo[] = NODES.map(labelGeoFor)

/* ---------- measurement, once ---------- */

/** Width in px of each label line at 10 px, keyed by the line text. Filled by measureLabels. */
export const LABEL_WIDTHS = new Map<string, number>()

export const estimateWidth = (text: string): number => text.length * 5.5   // 0.55 em at 10 px

/** Measure every label line once with a 2D canvas; a jsdom/no-canvas environment leaves the map empty. */
export function measureLabels(font = '600 10px Inter, system-ui, sans-serif'): Map<string, number> {
  if (LABEL_WIDTHS.size) return LABEL_WIDTHS
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return LABEL_WIDTHS
    ctx.font = font
    for (const l of LABELS) for (const t of l.kind === 'arc' ? [l.text] : l.lines) if (!LABEL_WIDTHS.has(t)) LABEL_WIDTHS.set(t, ctx.measureText(t).width)
  } catch { /* measurement is an optimisation, never a failure */ }
  return LABEL_WIDTHS
}
const widthAt10 = (t: string) => LABEL_WIDTHS.get(t) ?? estimateWidth(t)

/* ---------- rules applied on settle ---------- */

export const arcLengthPx = (node: WheelNode, vp: Viewport, scale: number): number =>
  (node.a1 - node.a0) * ((node.r0 + node.r1) / 2) * pxPerUnit(vp) * scale

const clampPx = (px: number) => Math.max(MIN_LABEL_PX, Math.min(MAX_LABEL_PX, px))

/** Scene-unit font size per ring so that text renders between 11 and 15 px. */
export function ringFontSizes(vp: Viewport, scale: number): { r1: number; r2: number; r3: number } {
  const k = pxPerUnit(vp) * scale
  return { r1: clampPx(7 * k) / k, r2: clampPx(5.6 * k) / k, r3: clampPx(4.9 * k) / k }
}

/** Does the label fit its wedge at this camera? Radial labels need ring depth; arc labels need arc length. */
export function labelFits(node: WheelNode, vp: Viewport, scale: number): boolean {
  const k = pxPerUnit(vp) * scale
  const geo = LABELS[NODES.indexOf(node)]
  const fs = ringFontSizes(vp, scale)
  const px = (node.ring === 1 ? fs.r1 : node.ring === 3 ? fs.r3 : fs.r2) * k
  if (geo.kind === 'arc') return widthAt10(geo.text) * (px / 10) <= (node.a1 - node.a0) * 82 * k - 8
  const widest = Math.max(...geo.lines.map(widthAt10)) * (px / 10)
  return widest <= (node.r1 - node.r0) * k - 10
}

/**
 * Which labels render. A label needs ≥ 14 screen px of arc, must fit, and its
 * family must be the focused one (or nothing is focused). Everything else is
 * display:none — not opacity 0, which still costs layout and paint.
 */
export function visibleLabelKeys(vp: Viewport, scale: number, focusFamily: string | null): Set<string> {
  const out = new Set<string>()
  for (const n of NODES) {
    if (focusFamily && n.family !== focusFamily) continue
    if (arcLengthPx(n, vp, scale) < MIN_ARC_PX) continue
    if (!labelFits(n, vp, scale)) continue
    out.add(n.path.join('>'))
  }
  return out
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/labels.test.ts`
Expected: PASS (7 tests). If "at 1x on a phone leaf labels are hidden" fails because a leaf's arc is just over 14 px, the leaf chosen by `find` is the widest-angle leaf; all leaves share one angular unit, so it cannot — re-check `arcLengthPx` uses the mid radius.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/labels.ts src/components/cupping/cva/wheel/labels.test.ts
git commit -m "feat(cva): wheel labels — geometry once, canvas measurement once, arc-length visibility"
```

---

### Task 5: Gestures — a pure touch state machine

**Files:**
- Create: `src/components/cupping/cva/wheel/gestures.ts`
- Test: `src/components/cupping/cva/wheel/gestures.test.ts`

**Interfaces:**
- Consumes: nothing from the app.
- Produces:
  - `LONG_PRESS_MS = 260`, `LONG_PRESS_SLOP_PX = 10`, `DOUBLE_TAP_MS = 300`, `DOUBLE_TAP_SLOP_PX = 24`, `SWIPE_DOWN_BAND_PX = 48`, `SWIPE_DOWN_MIN_PX = 80`
  - `type Pt = { id: number; x: number; y: number }`
  - `type GestureEvent = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number; t: number }`
  - `type GestureAction = { kind: 'tap'; x; y } | { kind: 'double-tap'; x; y } | { kind: 'long-press'; x; y } | { kind: 'pinch'; cx; cy; factor } | { kind: 'pan'; dx; dy } | { kind: 'swipe-down' } | { kind: 'press-progress'; x; y; p: number } | { kind: 'press-cancel' }`
  - `class GestureMachine { constructor(now: () => number); feed(e: GestureEvent): GestureAction[]; tick(t: number): GestureAction[]; reset(): void }` — `tick` is called by the rAF loop while a press is pending, so the long-press fires and its progress ring animates without a timer.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/cupping/cva/wheel/gestures.test.ts
import { describe, it, expect } from 'vitest'
import { GestureMachine, LONG_PRESS_MS, DOUBLE_TAP_MS } from './gestures'

const ev = (type: 'down' | 'move' | 'up' | 'cancel', id: number, x: number, y: number, t: number) => ({ type, id, x, y, t })

describe('GestureMachine', () => {
  it('a quick press and release is a tap', () => {
    const m = new GestureMachine(() => 0)
    expect(m.feed(ev('down', 1, 100, 100, 0))).toEqual([])
    const out = m.feed(ev('up', 1, 102, 101, 80))
    expect(out).toEqual([{ kind: 'tap', x: 102, y: 101 }])
  })

  it('two taps within 300 ms and 24 px are a double-tap, not two taps', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 100, 100, 0)); m.feed(ev('up', 1, 100, 100, 50))
    m.feed(ev('down', 2, 105, 103, 200))
    const out = m.feed(ev('up', 2, 105, 103, 250))
    expect(out).toEqual([{ kind: 'double-tap', x: 105, y: 103 }])
  })

  it('holding still fires long-press at 260 ms with progress ticks before it, and no tap after', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 50, 60, 0))
    expect(m.tick(130)).toEqual([{ kind: 'press-progress', x: 50, y: 60, p: 0.5 }])
    expect(m.tick(LONG_PRESS_MS)).toEqual([{ kind: 'long-press', x: 50, y: 60 }])
    expect(m.feed(ev('up', 1, 50, 60, 400))).toEqual([])
  })

  it('moving more than 10 px cancels the press into a pan', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 50, 60, 0))
    m.tick(100)
    const out = m.feed(ev('move', 1, 70, 60, 120))
    expect(out[0]).toEqual({ kind: 'press-cancel' })
    expect(out[1]).toEqual({ kind: 'pan', dx: 20, dy: 0 })
    expect(m.tick(LONG_PRESS_MS + 10)).toEqual([])
  })

  it('two fingers pinch around their midpoint and pan by the midpoint delta', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 100, 100, 0)); m.feed(ev('down', 2, 200, 100, 5))
    const out = m.feed(ev('move', 2, 300, 100, 30))   // distance 100 → 200
    expect(out.find((a) => a.kind === 'pinch')).toEqual({ kind: 'pinch', cx: 200, cy: 100, factor: 2 })
    expect(out.find((a) => a.kind === 'pan')).toEqual({ kind: 'pan', dx: 50, dy: 0 })
    expect(m.feed(ev('up', 1, 100, 100, 60))).toEqual([])   // lifting after a pinch is never a tap
    expect(m.feed(ev('up', 2, 300, 100, 70))).toEqual([])
  })

  it('a swipe down that starts in the top band closes', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 200, 20, 0))
    m.feed(ev('move', 1, 200, 60, 40))
    const out = m.feed(ev('up', 1, 205, 140, 120))
    expect(out).toEqual([{ kind: 'swipe-down' }])
  })

  it('cancel clears everything', () => {
    const m = new GestureMachine(() => 0)
    m.feed(ev('down', 1, 10, 10, 0))
    expect(m.feed(ev('cancel', 1, 10, 10, 10))).toEqual([{ kind: 'press-cancel' }])
    expect(m.tick(LONG_PRESS_MS)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/gestures.test.ts`
Expected: FAIL — cannot resolve `./gestures`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/cupping/cva/wheel/gestures.ts
// Touch gestures as a pure state machine. The component feeds pointer events
// in and calls tick() from its rAF loop while a press is pending; the machine
// never owns a timer, so it is deterministic and unit-testable.
export const LONG_PRESS_MS = 260
export const LONG_PRESS_SLOP_PX = 10
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_SLOP_PX = 24
export const SWIPE_DOWN_BAND_PX = 48
export const SWIPE_DOWN_MIN_PX = 80

export type Pt = { id: number; x: number; y: number }
export type GestureEvent = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number; t: number }
export type GestureAction =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'double-tap'; x: number; y: number }
  | { kind: 'long-press'; x: number; y: number }
  | { kind: 'pinch'; cx: number; cy: number; factor: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'swipe-down' }
  | { kind: 'press-progress'; x: number; y: number; p: number }
  | { kind: 'press-cancel' }

export class GestureMachine {
  private pts = new Map<number, Pt>()
  private start: { x: number; y: number; t: number } | null = null
  private pressPending = false
  private fired = false        // long-press already emitted for this touch
  private moved = false        // slop exceeded → this touch cannot end as a tap
  private multi = false        // a second finger joined at some point
  private lastTap: { x: number; y: number; t: number } | null = null
  private lastPinchDist = 0
  private lastMid: { x: number; y: number } | null = null

  constructor(private now: () => number) {}

  reset(): void {
    this.pts.clear(); this.start = null; this.pressPending = false; this.fired = false
    this.moved = false; this.multi = false; this.lastPinchDist = 0; this.lastMid = null
  }

  private mid(): { x: number; y: number; d: number } {
    const [a, b] = [...this.pts.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  feed(e: GestureEvent): GestureAction[] {
    const out: GestureAction[] = []
    if (e.type === 'down') {
      this.pts.set(e.id, { id: e.id, x: e.x, y: e.y })
      if (this.pts.size === 1) {
        this.start = { x: e.x, y: e.y, t: e.t }
        this.pressPending = true; this.fired = false; this.moved = false; this.multi = false
      } else if (this.pts.size === 2) {
        this.multi = true
        if (this.pressPending) { this.pressPending = false; out.push({ kind: 'press-cancel' }) }
        const m = this.mid(); this.lastPinchDist = m.d; this.lastMid = { x: m.x, y: m.y }
      }
      return out
    }
    if (e.type === 'move') {
      const p = this.pts.get(e.id)
      if (!p) return out
      p.x = e.x; p.y = e.y
      if (this.pts.size >= 2 && this.lastMid) {
        const m = this.mid()
        if (this.lastPinchDist > 0 && m.d > 0) out.push({ kind: 'pinch', cx: m.x, cy: m.y, factor: m.d / this.lastPinchDist })
        out.push({ kind: 'pan', dx: m.x - this.lastMid.x, dy: m.y - this.lastMid.y })
        this.lastPinchDist = m.d; this.lastMid = { x: m.x, y: m.y }
        return out
      }
      if (this.start && !this.moved && Math.hypot(e.x - this.start.x, e.y - this.start.y) > LONG_PRESS_SLOP_PX) {
        this.moved = true
        if (this.pressPending) { this.pressPending = false; out.push({ kind: 'press-cancel' }) }
        this.lastMid = { x: this.start.x, y: this.start.y }
      }
      if (this.moved && this.lastMid && !this.fired) {
        out.push({ kind: 'pan', dx: e.x - this.lastMid.x, dy: e.y - this.lastMid.y })
        this.lastMid = { x: e.x, y: e.y }
      }
      return out
    }
    // up / cancel
    const wasPending = this.pressPending
    this.pressPending = false
    this.pts.delete(e.id)
    if (e.type === 'cancel') { if (wasPending) out.push({ kind: 'press-cancel' }); if (this.pts.size === 0) this.reset(); return out }
    if (this.pts.size > 0) return out          // other finger still down
    const s = this.start
    this.start = null
    if (!s || this.multi || this.fired) { this.multi = false; return out }
    if (this.moved) {
      if (s.y <= SWIPE_DOWN_BAND_PX && e.y - s.y >= SWIPE_DOWN_MIN_PX && Math.abs(e.x - s.x) < e.y - s.y) out.push({ kind: 'swipe-down' })
      return out
    }
    const lt = this.lastTap
    if (lt && e.t - lt.t <= DOUBLE_TAP_MS && Math.hypot(e.x - lt.x, e.y - lt.y) <= DOUBLE_TAP_SLOP_PX) {
      this.lastTap = null
      out.push({ kind: 'double-tap', x: e.x, y: e.y })
    } else {
      this.lastTap = { x: e.x, y: e.y, t: e.t }
      out.push({ kind: 'tap', x: e.x, y: e.y })
    }
    return out
  }

  /** Called every frame while a press is pending. Emits progress, then the long-press. */
  tick(t: number): GestureAction[] {
    if (!this.pressPending || !this.start) return []
    const p = Math.min(1, (t - this.start.t) / LONG_PRESS_MS)
    if (p >= 1) {
      this.pressPending = false; this.fired = true
      return [{ kind: 'long-press', x: this.start.x, y: this.start.y }]
    }
    return [{ kind: 'press-progress', x: this.start.x, y: this.start.y, p }]
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/gestures.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/gestures.ts src/components/cupping/cva/wheel/gestures.test.ts
git commit -m "feat(cva): wheel gestures — timer-free touch state machine (long-press, pinch, pan, double-tap, swipe-down)"
```

---

### Task 6: WheelScene — the static SVG, rendered once

**Files:**
- Create: `src/components/cupping/cva/wheel/WheelScene.tsx`
- Test: `src/components/cupping/cva/wheel/WheelScene.test.tsx`

**Interfaces:**
- Consumes: `NODES`, `VIEW`, `arcPathD` from `@/lib/cva/flavor-wheel-data`; `PALETTE` from `./palette`; `LABELS` from `./labels`.
- Produces:
  - `interface WheelSceneProps { pickedKeys: ReadonlySet<string>; focusFamily: string | null; focusKey: string | null; hoverKey: string | null; onActivate: (node: WheelNode) => void; svgRef: React.Ref<SVGSVGElement> }`
  - `export const WheelScene = memo(...)` — renders `<svg class="wheel-scene" data-focus={focusFamily ?? ''}>` with `<g class="wheel-arcs">` (one `<g class="wheel-fam" data-fam>` per family, each holding `<g class="wheel-wedge" role="button" tabIndex={-1} aria-label data-key>` → `<path d fill>`) and `<g class="wheel-labels">` (one `<g class="wheel-lw" data-key data-ring>` per node with the `<text>`; `<defs>` holds the two arc guide paths).
  - Class contract used by CSS and by `FlavorWheel`'s direct-DOM writes: `.is-picked`, `.is-hover`, `.is-focus` on `.wheel-wedge`; `.is-muted` on `.wheel-fam`; label visibility via `style.display` written by `FlavorWheel` on settle; ring font sizes via `--wheel-fs-1/2/3` CSS variables on the `<svg>`.
  - `WEDGE_GAP = 0.0028` (radians, the hairline between wedges).
  - Static DOM writes from `FlavorWheel` target elements by `data-key` (a `Map<string, {wedge: SVGGElement; label: SVGGElement}>` built once from the svg after mount — see Task 9).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/cupping/cva/wheel/WheelScene.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { WheelScene } from './WheelScene'

const base = { pickedKeys: new Set<string>(), focusFamily: null, focusKey: null, hoverKey: null, onActivate: () => {}, svgRef: createRef<SVGSVGElement>() }

describe('WheelScene', () => {
  it('renders one accessible wedge per node and one label per node', () => {
    const { container } = render(<WheelScene {...base} />)
    expect(container.querySelectorAll('.wheel-wedge[role=button]')).toHaveLength(NODES.length)
    expect(container.querySelectorAll('.wheel-lw')).toHaveLength(NODES.length)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' })).toBeTruthy()
  })

  it('contains no filters, no transforms and no transitions inside the svg', () => {
    const { container } = render(<WheelScene {...base} />)
    const svg = container.querySelector('svg')!
    expect(svg.querySelectorAll('filter, [filter]')).toHaveLength(0)
    for (const el of svg.querySelectorAll<SVGElement>('g, path')) {
      expect(el.getAttribute('transform'), el.className.baseVal).toBeNull()
      expect(el.style.transform).toBe('')
    }
    // labels keep their rotate() — that is static geometry, never animated
    expect(svg.querySelectorAll('text[transform]').length).toBeGreaterThan(0)
  })

  it('arcs and labels never take pointer events', () => {
    const { container } = render(<WheelScene {...base} />)
    expect(container.querySelector('.wheel-arcs')!.getAttribute('pointer-events')).toBe('none')
    expect(container.querySelector('.wheel-labels')!.getAttribute('pointer-events')).toBe('none')
  })

  it('reflects picked, focus, hover and muted state as classes only', () => {
    const { container } = render(
      <WheelScene {...base} pickedKeys={new Set(['Fruity>Berry>Blueberry'])} focusFamily="Fruity" focusKey="Fruity>Berry" hoverKey="Fruity>Berry>Raspberry" />,
    )
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
    expect(screen.getByRole('button', { name: 'Fruity / Berry' }).classList.contains('is-focus')).toBe(true)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Raspberry' }).classList.contains('is-hover')).toBe(true)
    const fams = container.querySelectorAll('.wheel-fam')
    expect(fams).toHaveLength(9)
    expect(container.querySelectorAll('.wheel-fam.is-muted')).toHaveLength(8)
    expect(container.querySelector('.wheel-fam[data-fam="Fruity"]')!.classList.contains('is-muted')).toBe(false)
  })

  it('activating a wedge (assistive tech / keyboard path) calls onActivate with the node', () => {
    const onActivate = vi.fn()
    render(<WheelScene {...base} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    expect(onActivate).toHaveBeenCalledWith(NODES.find((n) => n.name === 'Sweet'))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/WheelScene.test.tsx`
Expected: FAIL — cannot resolve `./WheelScene`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/cupping/cva/wheel/WheelScene.tsx
'use client'

// The wheel's static SVG. Rendered once; its geometry never changes. The only
// things that change are CLASSES (picked / hover / focus / muted) — set through
// props on a selection change — and, from FlavorWheel's settle handler, the
// display of each label and three font-size variables. No element in here ever
// carries a transform, a transition or a filter: any of those makes Blink lay
// out the whole subtree every animated frame (Phase 0, 2026-09-02).
//
// Wedges keep role="button" + aria-label for assistive tech and the keyboard
// path; their onClick fires only from those, because pointer-events is none on
// the whole arcs group and real pointer input is resolved by FlavorWheel's
// single root listener with polar maths.

import { memo, type Ref } from 'react'
import { NODES, VIEW, WHEEL, CX, CY, arcPathD, type WheelNode } from '@/lib/cva/flavor-wheel-data'
import { PALETTE } from './palette'
import { LABELS } from './labels'

export const WEDGE_GAP = 0.0028

export interface WheelSceneProps {
  pickedKeys: ReadonlySet<string>
  focusFamily: string | null
  focusKey: string | null
  hoverKey: string | null
  onActivate: (node: WheelNode) => void
  svgRef: Ref<SVGSVGElement>
}

interface Rec { node: WheelNode; key: string; aria: string; d: string; idx: number; dotX: number; dotY: number }
const RECS: Rec[] = NODES.map((n, idx) => {
  const mid = (n.a0 + n.a1) / 2, rDot = n.r1 - 5
  return {
    node: n, key: n.path.join('>'), aria: n.path.join(' / '), idx,
    d: arcPathD(n.r0, n.r1, n.a0 + WEDGE_GAP, n.a1 - WEDGE_GAP),
    dotX: CX + Math.cos(mid) * rDot, dotY: CY + Math.sin(mid) * rDot,
  }
})
const BY_FAMILY: Array<{ name: string; recs: Rec[] }> = WHEEL.map((f) => ({ name: f.n, recs: RECS.filter((r) => r.node.family === f.n) }))

function Label({ r }: { r: Rec }) {
  const g = LABELS[r.idx]
  const ring = r.node.ring === 1 ? 1 : r.node.ring === 3 ? 3 : 2
  if (g.kind === 'arc') {
    return (
      <g className="wheel-lw" data-key={r.key} data-ring={ring}>
        <text className="wheel-label" fontWeight={800} fill={g.fill}>
          <textPath href={`#${g.pid}`} startOffset="50%" textAnchor="middle">{g.text}</textPath>
        </text>
      </g>
    )
  }
  return (
    <g className="wheel-lw" data-key={r.key} data-ring={ring}>
      <text
        className="wheel-label" x={g.x} y={g.y} fontWeight={g.weight} fill={g.fill}
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

export const WheelScene = memo(function WheelScene({ pickedKeys, focusFamily, focusKey, hoverKey, onActivate, svgRef }: WheelSceneProps) {
  return (
    <svg ref={svgRef} className="wheel-scene" viewBox={`0 0 ${VIEW} ${VIEW}`} data-focus={focusFamily ?? ''} aria-label="Flavour wheel">
      <defs>
        {LABELS.map((g) => g.kind === 'arc' ? <path key={g.pid} id={g.pid} d={g.pathD} fill="none" stroke="none" /> : null)}
      </defs>
      <g className="wheel-arcs" pointerEvents="none">
        {BY_FAMILY.map((f) => (
          <g key={f.name} className={`wheel-fam${focusFamily && focusFamily !== f.name ? ' is-muted' : ''}`} data-fam={f.name}>
            {f.recs.map((r) => {
              const cls = ['wheel-wedge']
              if (pickedKeys.has(r.key)) cls.push('is-picked')
              if (hoverKey === r.key) cls.push('is-hover')
              if (focusKey === r.key) cls.push('is-focus')
              const pal = PALETTE.get(r.key)!
              return (
                <g key={r.key} className={cls.join(' ')} role="button" tabIndex={-1} aria-label={r.aria} data-key={r.key}
                   onClick={(e) => { e.stopPropagation(); onActivate(r.node) }}>
                  <path d={r.d} fill={pal.fill} style={{ ['--wheel-muted' as string]: pal.muted }} />
                  <circle className="wheel-dot" cx={r.dotX} cy={r.dotY} r={2.2} />
                </g>
              )
            })}
          </g>
        ))}
      </g>
      <g className="wheel-labels" pointerEvents="none" aria-hidden>
        {RECS.map((r) => <Label key={r.key} r={r} />)}
      </g>
    </svg>
  )
})
```

Note on the selected state: the 2 px surface-colour ring is the path's `stroke` under `.is-picked` (Task 8 CSS). The small filled dot at the wedge's outer edge is the static `<circle class="wheel-dot">` above, present for every wedge and `display:none` unless its wedge `.is-picked`. A pick is still only a class change; no conditional elements are ever added or removed.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/WheelScene.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/WheelScene.tsx src/components/cupping/cva/wheel/WheelScene.test.tsx
git commit -m "feat(cva): WheelScene — static SVG rendered once, classes only, no transforms or filters"
```

---

### Task 7: Thumbstick — the mobile pan control

**Files:**
- Create: `src/components/cupping/cva/wheel/Thumbstick.tsx`
- Test: `src/components/cupping/cva/wheel/Thumbstick.test.tsx`

**Interfaces:**
- Consumes: nothing from the wheel; pure React + DOM.
- Produces:
  - `STICK_WELL = 112`, `STICK_KNOB = 48`, `STICK_DEADZONE = 0.14`, `STICK_IDLE_MS = 2500`, `STICK_SIDE_KEY = 'waqc.wheel.stickSide'`
  - `stickVector(dx, dy, radius): { x: number; y: number; m: number }` — pure: deadzone, normalised direction, `m` = magnitude after deadzone **squared** (spec: fine control near centre).
  - `readStickSide(): 'left' | 'right'` / `writeStickSide(side)` (localStorage, try/catch).
  - `interface ThumbstickProps { onVector: (v: { x: number; y: number; m: number }) => void; knobColorRef: React.MutableRefObject<string>; onAnyTouch?: () => void }` — `onVector` is called on every knob move and with `m = 0` on release; `FlavorWheel` keeps the latest vector in a ref and applies it in its rAF loop. `knobColorRef.current` is read by the stick's own tiny rAF-free approach: `FlavorWheel` writes the knob colour directly through `data-knob` on the well element it finds by `.wheel-stick-knob` (see Task 9); the ref exists so tests can assert the contract.
  - `export function Thumbstick(props)` — renders `<div class="wheel-stick" data-side="right|left" data-idle="0|1">` with `<div class="wheel-stick-knob">`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/cupping/cva/wheel/Thumbstick.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { createRef } from 'react'
import { Thumbstick, stickVector, readStickSide, writeStickSide, STICK_SIDE_KEY, STICK_DEADZONE } from './Thumbstick'

/** jsdom's PointerEvent support is patchy: build a MouseEvent of the pointer type and pin the pointer fields on it. */
function pev(el: Element, type: string, init: { clientX: number; clientY: number; pointerId?: number }) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX, clientY: init.clientY, button: 0 })
  Object.defineProperty(ev, 'pointerType', { value: 'touch' })
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 })
  act(() => { el.dispatchEvent(ev) })
}

describe('stickVector', () => {
  it('returns zero inside the deadzone', () => {
    expect(stickVector(3, -3, 56)).toEqual({ x: 0, y: 0, m: 0 })
    expect(stickVector(56 * STICK_DEADZONE * 0.99, 0, 56).m).toBe(0)
  })
  it('squares the magnitude and keeps the raw direction', () => {
    const half = stickVector(28, 0, 56)     // halfway out
    const full = stickVector(56, 0, 56)
    expect(full.m).toBeCloseTo(1, 6); expect(full.x).toBeCloseTo(1, 6); expect(full.y).toBe(0)
    expect(half.m).toBeGreaterThan(0); expect(half.m).toBeLessThan(0.5)   // (0.42)^2 ≈ 0.17 after deadzone
    const diag = stickVector(40, 40, 56)
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 6)
    expect(diag.x).toBeCloseTo(diag.y, 6)
  })
  it('clamps beyond the rim', () => {
    expect(stickVector(500, 0, 56).m).toBeCloseTo(1, 6)
  })
})

describe('side persistence', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to right, remembers left', () => {
    expect(readStickSide()).toBe('right')
    writeStickSide('left')
    expect(localStorage.getItem(STICK_SIDE_KEY)).toBe('left')
    expect(readStickSide()).toBe('left')
  })
})

describe('<Thumbstick>', () => {
  beforeEach(() => localStorage.clear())

  it('dragging the knob emits vectors and releasing emits zero', () => {
    const onVector = vi.fn()
    const { container } = render(<Thumbstick onVector={onVector} knobColorRef={createRef<string>() as any} />)
    const knob = container.querySelector('.wheel-stick-knob')!
    vi.spyOn(container.querySelector('.wheel-stick')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 112, height: 112, right: 112, bottom: 112, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    pev(knob, 'pointerdown', { pointerId: 1, clientX: 56, clientY: 56 })
    pev(knob, 'pointermove', { pointerId: 1, clientX: 112, clientY: 56 })
    expect(onVector).toHaveBeenLastCalledWith({ x: 1, y: 0, m: 1 })
    pev(knob, 'pointerup', { pointerId: 1, clientX: 112, clientY: 56 })
    expect(onVector).toHaveBeenLastCalledWith({ x: 0, y: 0, m: 0 })
  })

  it('dragging the well past the midline tosses it to the other side and persists it', () => {
    const { container } = render(<Thumbstick onVector={() => {}} knobColorRef={createRef<string>() as any} />)
    const well = container.querySelector('.wheel-stick')!
    expect(well.getAttribute('data-side')).toBe('right')
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    pev(well, 'pointerdown', { pointerId: 2, clientX: 340, clientY: 700 })
    pev(well, 'pointermove', { pointerId: 2, clientX: 120, clientY: 700 })
    pev(well, 'pointerup', { pointerId: 2, clientX: 120, clientY: 700 })
    expect(well.getAttribute('data-side')).toBe('left')
    expect(localStorage.getItem(STICK_SIDE_KEY)).toBe('left')
  })

  it('fades to idle after 2.5 s without touch and wakes on any touch', () => {
    vi.useFakeTimers()
    const { container } = render(<Thumbstick onVector={() => {}} knobColorRef={createRef<string>() as any} />)
    const well = container.querySelector('.wheel-stick')!
    act(() => { vi.advanceTimersByTime(2600) })
    expect(well.getAttribute('data-idle')).toBe('1')
    pev(document.body, 'pointerdown', { pointerId: 3, clientX: 10, clientY: 10 })
    expect(well.getAttribute('data-idle')).toBe('0')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/cupping/cva/wheel/Thumbstick.test.tsx`
Expected: FAIL — cannot resolve `./Thumbstick`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/cupping/cva/wheel/Thumbstick.tsx
'use client'

// Game-style analog stick for one-thumb panning on touch devices (spec: Mobile
// interactions). It never moves the camera itself: it reports a vector, and
// FlavorWheel's rAF loop turns that into camera velocity. Drag the KNOB to pan;
// drag the WELL to relocate it — on release it springs to whichever side of
// the screen midline it was let go on, remembered per device.

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPE } from 'react'

export const STICK_WELL = 112
export const STICK_KNOB = 48
export const STICK_DEADZONE = 0.14
export const STICK_IDLE_MS = 2500
export const STICK_SIDE_KEY = 'waqc.wheel.stickSide'

export function stickVector(dx: number, dy: number, radius: number): { x: number; y: number; m: number } {
  const d = Math.hypot(dx, dy)
  const n = Math.min(1, d / radius)
  if (n <= STICK_DEADZONE || d === 0) return { x: 0, y: 0, m: 0 }
  const after = (n - STICK_DEADZONE) / (1 - STICK_DEADZONE)
  return { x: dx / d, y: dy / d, m: after * after }
}

export function readStickSide(): 'left' | 'right' {
  try { return localStorage.getItem(STICK_SIDE_KEY) === 'left' ? 'left' : 'right' } catch { return 'right' }
}
export function writeStickSide(side: 'left' | 'right'): void {
  try { localStorage.setItem(STICK_SIDE_KEY, side) } catch { /* private mode etc. */ }
}

export interface ThumbstickProps {
  onVector: (v: { x: number; y: number; m: number }) => void
  /** Current family colour under the viewport centre; FlavorWheel keeps it fresh. */
  knobColorRef: MutableRefObject<string>
  onAnyTouch?: () => void
}

export function Thumbstick({ onVector, knobColorRef, onAnyTouch }: ThumbstickProps) {
  const wellRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [idle, setIdle] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const knobPointer = useRef<number | null>(null)
  const wellPointer = useRef<{ id: number; sx: number; sy: number } | null>(null)

  useEffect(() => { setSide(readStickSide()) }, [])

  const armIdle = useCallback(() => {
    setIdle(false)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), STICK_IDLE_MS)
  }, [])
  useEffect(() => {
    armIdle()
    const wake = () => { armIdle(); onAnyTouch?.() }
    document.addEventListener('pointerdown', wake, { passive: true })
    return () => { document.removeEventListener('pointerdown', wake); if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [armIdle, onAnyTouch])

  const centre = () => {
    const r = wellRef.current!.getBoundingClientRect()   // on pointerdown only — never per frame
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: r.width / 2 }
  }
  const origin = useRef({ x: 0, y: 0, radius: STICK_WELL / 2 })

  const onKnobDown = (e: RPE) => {
    e.stopPropagation()
    knobPointer.current = e.pointerId
    origin.current = centre()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onKnobMove = (e: RPE) => {
    if (knobPointer.current !== e.pointerId) return
    const o = origin.current
    const dx = e.clientX - o.x, dy = e.clientY - o.y
    const lim = o.radius - STICK_KNOB / 2
    const d = Math.hypot(dx, dy) || 1
    const k = Math.min(1, lim / d)
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`
    onVector(stickVector(dx, dy, lim))
  }
  const onKnobUp = (e: RPE) => {
    if (knobPointer.current !== e.pointerId) return
    knobPointer.current = null
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    onVector({ x: 0, y: 0, m: 0 })
  }

  const onWellDown = (e: RPE) => {
    wellPointer.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onWellMove = (e: RPE) => {
    const w = wellPointer.current
    if (!w || w.id !== e.pointerId) return
    setDragOffset({ x: e.clientX - w.sx, y: e.clientY - w.sy })
  }
  const onWellUp = (e: RPE) => {
    const w = wellPointer.current
    if (!w || w.id !== e.pointerId) return
    wellPointer.current = null
    const next: 'left' | 'right' = e.clientX < window.innerWidth / 2 ? 'left' : 'right'
    setDragOffset(null)
    setSide(next); writeStickSide(next)
  }

  return (
    <div
      ref={wellRef}
      className="wheel-stick"
      data-side={side}
      data-idle={idle ? '1' : '0'}
      style={dragOffset ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, transition: 'none' } : undefined}
      onPointerDown={onWellDown} onPointerMove={onWellMove} onPointerUp={onWellUp} onPointerCancel={onWellUp}
      aria-label="Pan the wheel with your thumb"
      role="presentation"
    >
      <div
        ref={knobRef}
        className="wheel-stick-knob"
        style={{ background: knobColorRef.current || undefined }}
        onPointerDown={onKnobDown} onPointerMove={onKnobMove} onPointerUp={onKnobUp} onPointerCancel={onKnobUp}
      />
    </div>
  )
}
```

The knob's transform is an HTML element, not SVG — composited, not a layout. The well's relocation transform is set only while dragging and cleared on release; the `data-side` attribute positions it via CSS (Task 8), and the 260 ms spring to the chosen side is a CSS transition on `left`/`right` there.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/cupping/cva/wheel/Thumbstick.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/Thumbstick.tsx src/components/cupping/cva/wheel/Thumbstick.test.tsx
git commit -m "feat(cva): Thumbstick — deadzone, squared response, tossable side with persistence, idle fade"
```

---

### Task 8: Debug HUD and the wheel's CSS block

**Files:**
- Create: `src/components/cupping/cva/wheel/DebugHud.tsx`
- Modify: `src/app/globals.css:180-247` — delete the whole `.cva-wheel-*` block (from the comment `/* full-screen hero — no card/module chrome …` down to and including `@keyframes cva-pulse{…}`) and put the block below in its place.

**Interfaces:**
- Produces: `export function DebugHud({ statsRef }: { statsRef: React.MutableRefObject<FrameStats> })` and `export interface FrameStats { p95: number; last: number; layouts: number; frames: number }`; `export function pushFrame(stats: FrameStats, ring: number[], ms: number): void` (rolling 60-sample p95). `FlavorWheel` (Task 9) owns the ring buffer and calls `pushFrame` once per rAF; the HUD re-reads the ref on a 250 ms interval so it never renders per frame.
- CSS class contract (used by Tasks 6, 7, 9, 10): `.wheel-root`, `.wheel-camera`, `.wheel-scene`, `.wheel-arcs`, `.wheel-fam.is-muted`, `.wheel-wedge.is-picked/.is-hover/.is-focus`, `.wheel-dot`, `.wheel-labels`, `.wheel-lw[data-ring]`, `.wheel-label`, `.wheel-overlay`, `.wheel-back`, `.wheel-home`, `.wheel-press-ring`, `.wheel-stick[data-side][data-idle]`, `.wheel-stick-knob`, `.wheel-hud`, `.wheel-tray[data-open]`.

- [ ] **Step 1: Write the HUD**

```tsx
// src/components/cupping/cva/wheel/DebugHud.tsx
'use client'

// Dev-only frame-time overlay, shown when the page URL has ?debug=1. The wheel
// pushes one sample per rAF into a ref; this component samples that ref four
// times a second so the HUD itself costs nothing per frame.

import { useEffect, useState, type MutableRefObject } from 'react'

export interface FrameStats { p95: number; last: number; layouts: number; frames: number }

export function pushFrame(stats: FrameStats, ring: number[], ms: number): void {
  ring.push(ms)
  if (ring.length > 60) ring.shift()
  const sorted = [...ring].sort((a, b) => a - b)
  stats.p95 = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]
  stats.last = ms
  stats.frames++
}

export function DebugHud({ statsRef }: { statsRef: MutableRefObject<FrameStats> }) {
  const [snap, setSnap] = useState<FrameStats>({ p95: 0, last: 0, layouts: 0, frames: 0 })
  useEffect(() => {
    const id = setInterval(() => setSnap({ ...statsRef.current }), 250)
    return () => clearInterval(id)
  }, [statsRef])
  const bad = snap.p95 > 8
  return (
    <div className="wheel-hud" data-bad={bad ? '1' : '0'} aria-hidden>
      <div>p95 {snap.p95.toFixed(1)} ms</div>
      <div>last {snap.last.toFixed(1)} ms</div>
      <div>frames {snap.frames}</div>
    </div>
  )
}
```

`layouts` is reserved for the `PerformanceObserver('long-animation-frame')` count that Task 9 wires when the API exists (Chrome 123+); it stays 0 elsewhere.

- [ ] **Step 2: Replace the CSS block**

Delete `src/app/globals.css` lines 180–247 (verify with `sed -n '180,247p' src/app/globals.css` that they start with the "full-screen hero" comment and end with `@keyframes cva-pulse`), then insert:

```css
/* ===================================================================== */
/* Flavour wheel (rebuilt 2026-09-02). Rules: ONE transform, on .wheel-camera.
   Nothing inside the svg ever transforms, transitions or filters — Blink lays
   out the whole subtree on every animated frame if it does. Dimming is a
   precomputed muted fill + opacity. See the FlavorWheel.tsx header.            */
/* ===================================================================== */
.wheel-root{position:absolute;inset:0;overflow:hidden;background:#2E2E29;touch-action:none;user-select:none;-webkit-user-select:none;outline:none;}
.wheel-camera{position:absolute;inset:0;transform-origin:50% 50%;}
.wheel-scene{position:absolute;left:50%;top:50%;width:var(--wheel-size);height:var(--wheel-size);margin-left:calc(var(--wheel-size) / -2);margin-top:calc(var(--wheel-size) / -2);overflow:visible;display:block;}
.wheel-arcs path{stroke:#2E2E29;stroke-width:.9;}
/* dimming: precomputed muted fill (set per path as --wheel-muted by WheelScene) + opacity */
.wheel-fam{transition:opacity .2s linear;}
.wheel-fam.is-muted{opacity:.42;}
.wheel-fam.is-muted path{fill:var(--wheel-muted);}
/* hover is paint-only: brighter stroke in the wedge's own colour */
.wheel-wedge.is-hover path{stroke:#ffffff;stroke-width:1.1;}
/* focus (keyboard): 2px stroke in the wedge's own colour, drawn on top by the scene order */
.wheel-wedge.is-focus path{stroke:currentColor;stroke-width:2;}
/* selected: full fill, 2px ring in the surface colour, dot at the outer edge */
.wheel-wedge.is-picked path{stroke:#2E2E29;stroke-width:2;fill:var(--wheel-fill,inherit);}
.wheel-fam.is-muted .wheel-wedge.is-picked path{fill:var(--wheel-fill,inherit);opacity:1;}
.wheel-dot{display:none;fill:#f3f0e8;}
.wheel-wedge.is-picked .wheel-dot{display:block;}
/* labels: font size per ring is a variable FlavorWheel writes on settle; display is written per label on settle */
.wheel-label{user-select:none;font-family:inherit;}
.wheel-lw[data-ring="1"] .wheel-label{font-size:var(--wheel-fs-1,7px);}
.wheel-lw[data-ring="2"] .wheel-label{font-size:var(--wheel-fs-2,5.6px);}
.wheel-lw[data-ring="3"] .wheel-label{font-size:var(--wheel-fs-3,4.9px);}
/* overlay chrome — never transforms */
.wheel-overlay{position:absolute;inset:0;pointer-events:none;}
.wheel-overlay > *{pointer-events:auto;}
.wheel-back{position:absolute;top:12px;left:12px;z-index:6;display:flex;align-items:center;gap:7px;background:var(--cva-card-solid);border:.5px solid var(--border);border-radius:999px;padding:7px 14px 7px 10px;font-size:12px;font-weight:700;cursor:pointer;}
.wheel-home{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;display:flex;align-items:center;gap:6px;background:var(--cva-card-solid);border:.5px solid var(--border);border-radius:999px;padding:5px 11px;font-size:10.5px;font-weight:700;letter-spacing:.4px;cursor:pointer;}
.wheel-home[hidden]{display:none;}
.wheel-counter{position:absolute;top:12px;right:12px;z-index:6;border-radius:8px;background:var(--cva-accent-soft);padding:4px 8px;font-size:11px;font-weight:700;}
.wheel-counter[data-pulse="1"]{animation:wheel-pulse .45s ease-out;}
@keyframes wheel-pulse{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
/* long-press progress ring: an HTML element drawn with a conic gradient, never the svg */
.wheel-press-ring{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;pointer-events:none;background:conic-gradient(rgba(255,255,255,.85) calc(var(--p,0) * 1turn),rgba(255,255,255,.12) 0);-webkit-mask:radial-gradient(circle,transparent 17px,#000 18px);mask:radial-gradient(circle,transparent 17px,#000 18px);}
.wheel-press-ring[hidden]{display:none;}
/* thumbstick */
.wheel-stick{position:absolute;bottom:calc(24px + env(safe-area-inset-bottom,0px));width:112px;height:112px;border-radius:50%;background:rgba(0,0,0,.12);border:1px solid rgba(255,255,255,.3);display:grid;place-items:center;transition:opacity .25s linear,left .26s cubic-bezier(.34,1.56,.64,1),right .26s cubic-bezier(.34,1.56,.64,1);z-index:7;touch-action:none;}
.wheel-stick[data-side="right"]{right:calc(24px + env(safe-area-inset-right,0px));left:auto;}
.wheel-stick[data-side="left"]{left:calc(24px + env(safe-area-inset-left,0px));right:auto;}
.wheel-stick[data-idle="1"]{opacity:.35;}
.wheel-stick-knob{width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.5);transition:transform .18s cubic-bezier(.34,1.56,.64,1);touch-action:none;}
.wheel-stick-knob:active{transition:none;}
/* debug HUD */
.wheel-hud{position:absolute;left:12px;bottom:12px;z-index:9;font:600 11px/1.4 ui-monospace,monospace;color:#f3f0e8;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:8px;pointer-events:none;}
.wheel-hud[data-bad="1"]{color:#ff8a80;}
/* the descriptors tray (DescribeOverlay): plain background, no backdrop blur; collapsible on small screens */
.wheel-tray{background:var(--cva-card-solid);border:.5px solid var(--border);border-radius:20px;}
@media (max-width:1023px),(pointer:coarse){
  .wheel-tray[data-open="0"] > .wheel-tray-body{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .wheel-fam,.wheel-stick,.wheel-stick-knob{transition:none;}
  .wheel-counter[data-pulse="1"]{animation:none;}
}
```

Notes for the executor: `--wheel-size` (the svg's square side = `min(root width, root height)` in px) and `--wheel-fs-1/2/3` are written by `FlavorWheel` (Task 9); `--wheel-fill` is set per path by `WheelScene` alongside `--wheel-muted` — **add** `['--wheel-fill' as string]: pal.fill` to the path style in `WheelScene.tsx` in this task (one-line change, re-run its test). `currentColor` for the focus stroke: `WheelScene` sets `style={{ color: pal.fill }}` on the wedge `<g>` — add that too.

- [ ] **Step 3: Type-check and run the scene test**

Run: `npx tsc --noEmit && npx vitest run src/components/cupping/cva/wheel/WheelScene.test.tsx`
Expected: 0 errors; PASS. (The old `.cva-wheel-*` classes are still referenced by the old `FlavorWheel.tsx` until Task 9 replaces it; that is CSS-only breakage of the old component, which Task 9 deletes. Do not run the app between Tasks 8 and 9.)

- [ ] **Step 4: Commit**

```bash
git add src/components/cupping/cva/wheel/DebugHud.tsx src/components/cupping/cva/wheel/WheelScene.tsx src/app/globals.css
git commit -m "feat(cva): wheel CSS block (one transform, no filters) and the ?debug=1 frame HUD"
```

---

### Task 9: FlavorWheel — the root: one listener, one rAF loop, one transform

**Files:**
- Rewrite: `src/components/cupping/cva/wheel/FlavorWheel.tsx` (replace the whole file)
- Rewrite: `src/components/cupping/cva/wheel/FlavorWheel.test.tsx` (replace the whole file)
- Delete: `src/components/cupping/cva/wheel/zoom-machine.ts`, `src/components/cupping/cva/wheel/zoom-machine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8; `WheelPick` from `@/types/cva`; `OLF_CAP`, `pickKey`, `NODES`, `CX, CY` from `@/lib/cva/flavor-wheel-data`.
- Produces: `export const FlavorWheel: React.MemoExoticComponent<(props: FlavorWheelProps) => JSX.Element>` with
  `interface FlavorWheelProps { picks: WheelPick[]; onToggle: (pick: WheelPick) => void; active?: boolean; onSwipeClose?: () => void; onShade?: (s: boolean) => void /* accepted and ignored until Task 10 removes it */ }`
  and `export const COMPACT_MQ = '(max-width: 1023px), (pointer: coarse)'` (moved here from zoom-machine).
- Root DOM contract (for CSS, tests and DescribeOverlay): `<div class="wheel-root" data-testid="flavor-wheel-stage" data-focus="<family|''>" data-zoomed="0|1" tabindex="0">`.
- Behaviour rules (also the tests):
  1. Click/tap a family or group whose family is **not** focused → fly to it (`data-focus` = its family). Click one whose family **is** focused → toggle it as a pick (inner-ring picks are valid `WheelPick`s of length 1–2, as before).
  2. Click/tap a leaf whose family is focused → toggle; otherwise → fly to its family.
  3. Hub tap, or a tap outside the rim while zoomed, or Escape while focused → zoom out one level (`data-focus` cleared, camera to rest). Escape at rest is not consumed.
  4. Hover is direct-DOM (`is-hover` class toggled on the wedge element), never React state.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/cupping/cva/wheel/FlavorWheel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FlavorWheel } from './FlavorWheel'
import { NODES, CX, CY } from '@/lib/cva/flavor-wheel-data'

function mockMedia(reduced = true) {
  // rAF is not faked by vi.useFakeTimers(); route it through the faked setTimeout so flush() drives the loop.
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16)) as any
  window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as any
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: q.includes('reduced-motion') ? reduced : false, media: q, addEventListener() {}, removeEventListener() {} }),
  })
}
/** The root measures itself in its mount effect, so the size mocks must exist BEFORE render: install them on the prototype. */
function mockRoot() {
  const rect = { left: 0, top: 0, width: 440, height: 440, right: 440, bottom: 440, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { get: () => 440, configurable: true })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { get: () => 440, configurable: true })
}
/** Screen point for a node's centroid at the REST camera on a 440×440 root (scene = screen). */
function centroid(key: string) {
  const nd = NODES.find((n) => n.path.join('>') === key)!
  const mid = (nd.a0 + nd.a1) / 2, r = (nd.r0 + nd.r1) / 2
  return { clientX: CX + Math.cos(mid) * r, clientY: CY + Math.sin(mid) * r }
}
/** jsdom's PointerEvent support is patchy: build a MouseEvent of the pointer type and pin the pointer fields on it. */
export function pev(el: Element, type: string, init: { clientX: number; clientY: number; pointerType?: string; pointerId?: number }) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX, clientY: init.clientY, button: 0 })
  Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'mouse' })
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 })
  Object.defineProperty(ev, 'isPrimary', { value: true })
  act(() => { el.dispatchEvent(ev) })
}
function tap(root: HTMLElement, at: { clientX: number; clientY: number }, pointerType = 'mouse') {
  pev(root, 'pointerdown', { ...at, pointerType })
  pev(root, 'pointerup', { ...at, pointerType })
}
const flush = () => act(() => { vi.advanceTimersByTime(50) })

beforeEach(() => { mockMedia(true); mockRoot(); vi.useFakeTimers() })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('FlavorWheel — assistive-tech path (role=button clicks)', () => {
  it('renders all 110 wedges; family click focuses, leaf click in the focused family toggles', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    expect(screen.getAllByRole('button').filter((b) => b.tagName.toLowerCase() === 'g')).toHaveLength(110)
    const root = screen.getByTestId('flavor-wheel-stage')
    expect(root.getAttribute('data-focus')).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Fruity', 'Berry', 'Blueberry'] })
  })

  it('a group inside the focused family is itself pickable (inner-ring picks are valid)', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sweet / Brown Sugar' }))
    expect(onToggle).toHaveBeenCalledWith({ path: ['Sweet', 'Brown Sugar'] })
  })

  it('a leaf of another family re-aims instead of toggling', () => {
    const onToggle = vi.fn()
    render(<FlavorWheel picks={[]} onToggle={onToggle} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Fruity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roasted / Cereal / Malt' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(root.getAttribute('data-focus')).toBe('Roasted')
  })

  it('picked wedges carry is-picked', () => {
    render(<FlavorWheel picks={[{ path: ['Fruity', 'Berry', 'Blueberry'] }]} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fruity / Berry / Blueberry' }).classList.contains('is-picked')).toBe(true)
  })
})

describe('FlavorWheel — pointer path (single root listener, polar hit-test)', () => {
  it('a mouse tap on a family centroid at rest focuses it; a hub tap zooms out', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Fruity')); flush()
    expect(root.getAttribute('data-focus')).toBe('Fruity')
    expect(root.getAttribute('data-zoomed')).toBe('1')
    tap(root, { clientX: CX, clientY: CY }); flush()
    expect(root.getAttribute('data-focus')).toBe('')
    expect(root.getAttribute('data-zoomed')).toBe('0')
  })

  it('a touch tap goes through the gesture machine and focuses too', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Spices'), 'touch'); flush()
    expect(root.getAttribute('data-focus')).toBe('Spices')
  })

  it('hover toggles is-hover directly on the wedge without a React re-render of the scene', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    const at = centroid('Nutty/Cocoa')
    pev(root, 'pointermove', at)
    expect(screen.getByRole('button', { name: 'Nutty/Cocoa' }).classList.contains('is-hover')).toBe(true)
    pev(root, 'pointermove', { clientX: CX, clientY: CY })
    expect(screen.getByRole('button', { name: 'Nutty/Cocoa' }).classList.contains('is-hover')).toBe(false)
  })

  it('the camera element carries the only transform', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    flush()
    tap(root, centroid('Fruity')); flush()
    const cam = root.querySelector<HTMLElement>('.wheel-camera')!
    expect(cam.style.transform).toMatch(/^translate\(.+px, .+px\) scale\(1\.\d+\)$/)   // framed at ~80%, ≤ 1.5 on desktop
    expect(root.querySelectorAll('svg [style*="transform"], svg [transform]:not(text)')).toHaveLength(0)
  })
})

describe('FlavorWheel — keyboard and lifecycle', () => {
  it('Escape zooms out one level and is consumed only while focused', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    const consumed = fireEvent.keyDown(document, { key: 'Escape' })
    expect(consumed).toBe(false)       // preventDefault called
    expect(root.getAttribute('data-focus')).toBe('')
    const passed = fireEvent.keyDown(document, { key: 'Escape' })
    expect(passed).toBe(true)          // at rest: not consumed
  })

  it('arrow keys move a visible focus ring; Enter activates', () => {
    render(<FlavorWheel picks={[]} onToggle={() => {}} />)
    const root = screen.getByTestId('flavor-wheel-stage')
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    const focused = root.querySelectorAll('.wheel-wedge.is-focus')
    expect(focused).toHaveLength(1)
    const name = focused[0].getAttribute('aria-label')!
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(root.getAttribute('data-focus')).toBe(name.split(' / ')[0])
  })

  it('active=false resets focus and the camera', () => {
    const { rerender } = render(<FlavorWheel picks={[]} onToggle={() => {}} active />)
    const root = screen.getByTestId('flavor-wheel-stage')
    fireEvent.click(screen.getByRole('button', { name: 'Sweet' }))
    expect(root.getAttribute('data-focus')).toBe('Sweet')
    rerender(<FlavorWheel picks={[]} onToggle={() => {}} active={false} />)
    flush()
    expect(root.getAttribute('data-focus')).toBe('')
    expect(root.querySelector<HTMLElement>('.wheel-camera')!.style.transform).toBe('translate(0px, 0px) scale(1)')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/cupping/cva/wheel/FlavorWheel.test.tsx`
Expected: FAIL (old component: no `data-focus`, no `.wheel-camera`).

- [ ] **Step 3: Delete the zoom machine and write the component**

```bash
git rm -q src/components/cupping/cva/wheel/zoom-machine.ts src/components/cupping/cva/wheel/zoom-machine.test.ts
```

```tsx
// src/components/cupping/cva/wheel/FlavorWheel.tsx
'use client'

/**
 * The SCA flavour wheel — root component. Rebuilt 2026-09-02 after Phase 0
 * measured the old version at 31–54% dropped frames. These rules are the
 * reason it is fast; keep them (spec: docs/superpowers/specs/2026-09-02-cva-wheel-rebuild-design.md):
 *
 * 1. Input → camera ref → single rAF → one transform. Handlers only write
 *    `cam.target`. One requestAnimationFrame loop integrates the spring and
 *    writes ONE transform. React re-renders only on a selection change (pick,
 *    family focus, keyboard focus) — never on pointer move, never per frame.
 * 2. Exactly one element transforms: the HTML .wheel-camera div, via CSS.
 *    Nothing inside the <svg> ever has a transform, transition or animation
 *    (Blink lays out the whole subtree per frame if it does).
 * 3. Geometry is computed once at module load (WheelScene, labels, hit index).
 * 4. No filters, ever, inside .wheel-root. Dimming = muted fill + opacity.
 * 5. Zero text measurement at runtime: labels are measured once per mount.
 * 6. Hit testing is math (hit-test.ts). One listener on the root;
 *    pointer-events: none on every arc and label.
 * 7. The idle wheel burns nothing: the loop stops on settle; will-change is
 *    set only while moving.
 * 8. Budget enforced: ?debug=1 HUD; scripts/perf re-takes the numbers.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NODES, CX, CY, OLF_CAP, pickKey, type WheelNode } from '@/lib/cva/flavor-wheel-data'
import type { WheelPick } from '@/types/cva'
import {
  restCamera, cameraTransform, screenToWorld, zoomAt, clampCamera, springStep, isSettled, flyToNode,
  edgePanVelocity, pxPerUnit, MAX_SCALE_DESKTOP, MAX_SCALE_MOBILE, MAX_PAN_SPEED, RUBBER_PX, type Camera, type Viewport,
} from './camera'
import { regionAtScene, nodeAtScene } from './hit-test'
import { measureLabels, visibleLabelKeys, ringFontSizes } from './labels'
import { PALETTE } from './palette'
import { GestureMachine, type GestureAction } from './gestures'
import { WheelScene } from './WheelScene'
import { Thumbstick } from './Thumbstick'
import { DebugHud, pushFrame, type FrameStats } from './DebugHud'

export const COMPACT_MQ = '(max-width: 1023px), (pointer: coarse)'
const REDUCED_MQ = '(prefers-reduced-motion: reduce)'
const STICK_KEY = 'waqc.wheel.stick'
const CLICK_SLOP = 6

export interface FlavorWheelProps {
  picks: WheelPick[]
  onToggle: (pick: WheelPick) => void
  /** false while the (kept-mounted) overlay is hidden — resets to rest. */
  active?: boolean
  /** Mobile swipe-down from the top band (spec) — the overlay closes itself. */
  onSwipeClose?: () => void
  /** Legacy prop from the old tray-shade mechanism; ignored. Removed in Task 10. */
  onShade?: (shaded: boolean) => void
}

function useMedia(query: string): boolean {
  const [m, setM] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const update = () => setM(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [query])
  return m
}

const vibrate = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern) } catch { /* no haptics */ } }
const ringOf = (r: number): number => (r < 106 ? 1 : r < 158 ? 2 : 3)
const raf = (cb: FrameRequestCallback): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number)
const caf = (id: number) => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id) }

export const FlavorWheel = memo(function FlavorWheel({ picks, onToggle, active = true, onSwipeClose }: FlavorWheelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pressRingRef = useRef<HTMLDivElement>(null)
  const compact = useMedia(COMPACT_MQ)
  const reduced = useMedia(REDUCED_MQ)
  const reducedRef = useRef(reduced); reducedRef.current = reduced
  const maxScale = compact ? MAX_SCALE_MOBILE : MAX_SCALE_DESKTOP
  const maxScaleRef = useRef(maxScale); maxScaleRef.current = maxScale

  // ---- selection-level React state (the only state that re-renders) ----
  const [focusFamily, setFocusFamily] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [stickOn, setStickOn] = useState(true)
  const [pulse, setPulse] = useState(0)
  const focusFamilyRef = useRef(focusFamily); focusFamilyRef.current = focusFamily
  const onToggleRef = useRef(onToggle); onToggleRef.current = onToggle

  // ---- per-frame state, all refs ----
  const cam = useRef<{ current: Camera; target: Camera }>({ current: restCamera(), target: restCamera() })
  const vp = useRef<Viewport>({ width: 0, height: 0 })
  const els = useRef<Map<string, { wedge: SVGGElement; label: SVGGElement }>>(new Map())
  const pointer = useRef<{ x: number; y: number; inside: boolean; mouse: boolean; downX: number; downY: number; down: boolean }>({ x: 0, y: 0, inside: false, mouse: false, downX: 0, downY: 0, down: false })
  const hoverEl = useRef<SVGGElement | null>(null)
  const stick = useRef({ x: 0, y: 0, m: 0 })
  const knobColorRef = useRef('')
  const gestures = useRef(new GestureMachine(() => performance.now()))
  const pressPending = useRef(false)
  const loop = useRef<number | null>(null)
  const lastT = useRef(0)
  const lastRing = useRef(0)
  const stats = useRef<FrameStats>({ p95: 0, last: 0, layouts: 0, frames: 0 })
  const ring = useRef<number[]>([])
  const debug = typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)

  const pickedKeys = useMemo(() => new Set(picks.map(pickKey)), [picks])

  // Cap pulse: the count stayed at the cap but the set changed → a replace happened.
  const prevPicks = useRef(picks)
  useEffect(() => {
    const prev = prevPicks.current; prevPicks.current = picks
    if (prev.length === OLF_CAP && picks.length === OLF_CAP && prev.map(pickKey).join() !== picks.map(pickKey).join()) {
      setPulse((p) => p + 1); vibrate([12, 40, 12])
    }
  }, [picks])

  /* ---------- direct-DOM writes ---------- */

  const applyTransform = useCallback(() => {
    if (cameraRef.current) cameraRef.current.style.transform = cameraTransform(cam.current.current, vp.current)
  }, [])

  const onSettle = useCallback(() => {
    const c = cam.current.current, v = vp.current
    if (cameraRef.current) cameraRef.current.style.willChange = ''
    const svg = svgRef.current
    if (svg) {
      const fs = ringFontSizes(v, c.scale)
      svg.style.setProperty('--wheel-fs-1', `${fs.r1}px`)
      svg.style.setProperty('--wheel-fs-2', `${fs.r2}px`)
      svg.style.setProperty('--wheel-fs-3', `${fs.r3}px`)
    }
    const visible = visibleLabelKeys(v, c.scale, focusFamilyRef.current)
    for (const [key, e] of els.current) e.label.style.display = visible.has(key) ? '' : 'none'
    const isZoomed = c.scale > 1.05
    if (rootRef.current) rootRef.current.dataset.zoomed = isZoomed ? '1' : '0'
    setZoomed((z) => (z === isZoomed ? z : isZoomed))
    const under = nodeAtScene(c.x, c.y)
    knobColorRef.current = under ? PALETTE.get(under.path.join('>'))!.fill : ''
    const knob = rootRef.current?.querySelector<HTMLElement>('.wheel-stick-knob')
    if (knob) knob.style.background = knobColorRef.current || ''
  }, [])

  /* ---------- the loop ---------- */

  const tick = useCallback((t: number) => {
    const dt = Math.min(0.05, Math.max(0, (t - lastT.current) / 1000))
    const frameMs = lastT.current ? t - lastT.current : 0
    lastT.current = t
    const s = cam.current, v = vp.current
    let inputActive = false

    for (const a of gestures.current.tick(t)) handleAction(a)
    if (pressPending.current) inputActive = true

    const p = pointer.current
    if (p.inside && p.mouse) {
      const ev = edgePanVelocity(p.x, p.y, v, s.target.scale, reducedRef.current)
      if (ev.vx || ev.vy) {
        // edgePanVelocity is already in scene units / s (and already divided by scale)
        s.target = { ...s.target, x: s.target.x + ev.vx * dt, y: s.target.y + ev.vy * dt }
        inputActive = true
      }
    }
    if (stick.current.m > 0) {
      const sp = (MAX_PAN_SPEED * stick.current.m) / s.target.scale
      s.target = { ...s.target, x: s.target.x + stick.current.x * sp * dt, y: s.target.y + stick.current.y * sp * dt }
      inputActive = true
    }
    s.target = clampCamera(s.target, v, inputActive ? RUBBER_PX : 0)
    s.current = reducedRef.current ? { ...s.target } : springStep(s.current, s.target, dt)
    applyTransform()

    const r = ringOf(Math.hypot(s.current.x - CX, s.current.y - CY))
    if (r !== lastRing.current) { if (lastRing.current) vibrate(4); lastRing.current = r }
    if (frameMs) pushFrame(stats.current, ring.current, frameMs)

    if (isSettled(s.current, s.target) && !inputActive) {
      loop.current = null
      lastT.current = 0
      onSettle()
      return
    }
    loop.current = raf(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTransform, onSettle])

  const startLoop = useCallback(() => {
    if (loop.current != null) return
    if (cameraRef.current) cameraRef.current.style.willChange = 'transform'
    lastT.current = 0
    loop.current = raf(tick)
  }, [tick])

  const setTarget = useCallback((next: Camera) => {
    cam.current.target = clampCamera(next, vp.current, 0)
    startLoop()
  }, [startLoop])

  /* ---------- intents ---------- */

  const flyTo = useCallback((node: WheelNode) => {
    setFocusFamily(node.family)
    focusFamilyRef.current = node.family
    setTarget(flyToNode(node, vp.current, maxScaleRef.current))
  }, [setTarget])

  const zoomOut = useCallback(() => {
    setFocusFamily(null)
    focusFamilyRef.current = null
    setTarget(restCamera())
  }, [setTarget])

  /** Rules 1–2 of the task header. Shared by pointer, touch, keyboard and assistive tech. */
  const activate = useCallback((node: WheelNode) => {
    if (focusFamilyRef.current === node.family) {
      onToggleRef.current({ path: node.path })
      vibrate(8)
    } else flyTo(node)
  }, [flyTo])

  const tapAt = useCallback((px: number, py: number) => {
    const w = screenToWorld(px, py, cam.current.current, vp.current)
    const reg = regionAtScene(w.x, w.y)
    if (reg.kind === 'node') activate(reg.node)
    else if (focusFamilyRef.current || cam.current.current.scale > 1.05) zoomOut()
  }, [activate, zoomOut])

  const setPressRing = (x: number | null, y: number | null, p: number) => {
    const el = pressRingRef.current
    if (!el) return
    if (x == null || y == null) { el.hidden = true; return }
    el.hidden = false; el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.setProperty('--p', String(p))
  }

  function handleAction(a: GestureAction) {
    const s = cam.current, v = vp.current
    switch (a.kind) {
      case 'tap': tapAt(a.x, a.y); break
      case 'double-tap': zoomOut(); break
      case 'long-press': {
        pressPending.current = false; setPressRing(null, null, 0); vibrate(8)
        const w = screenToWorld(a.x, a.y, s.current, v)
        const node = nodeAtScene(w.x, w.y)
        if (node) {
          const fam = NODES.find((n) => n.ring === 1 && n.family === node.family)!
          setFocusFamily(node.family); focusFamilyRef.current = node.family
          setTarget(flyToNode(node.ring === 1 ? fam : node, v, maxScaleRef.current))
          const e = els.current.get(node.path.join('>'))
          if (e && node.ring === 3) { hoverEl.current?.classList.remove('is-hover'); e.wedge.classList.add('is-hover'); hoverEl.current = e.wedge }
        } else zoomOut()
        break
      }
      case 'press-progress': pressPending.current = true; setPressRing(a.x, a.y, a.p); startLoop(); break
      case 'press-cancel': pressPending.current = false; setPressRing(null, null, 0); break
      case 'pinch': setTarget(zoomAt(s.target, v, a.cx, a.cy, a.factor, maxScaleRef.current)); break
      case 'pan': {
        const k = pxPerUnit(v) * s.target.scale
        setTarget({ ...s.target, x: s.target.x - a.dx / k, y: s.target.y - a.dy / k })
        break
      }
      case 'swipe-down': onSwipeClose?.(); break
    }
  }

  /* ---------- layout (once per resize) ---------- */

  const measure = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const w = root.clientWidth || root.getBoundingClientRect().width
    const h = root.clientHeight || root.getBoundingClientRect().height
    vp.current = { width: w, height: h }
    root.style.setProperty('--wheel-size', `${Math.min(w, h)}px`)
    cam.current.target = clampCamera(cam.current.target, vp.current, 0)
    cam.current.current = clampCamera(cam.current.current, vp.current, 0)
    applyTransform()
    onSettle()
  }, [applyTransform, onSettle])

  useEffect(() => {
    // element map, once
    const svg = svgRef.current
    if (svg) {
      const map = new Map<string, { wedge: SVGGElement; label: SVGGElement }>()
      svg.querySelectorAll<SVGGElement>('.wheel-wedge[data-key]').forEach((w) => map.set(w.dataset.key!, { wedge: w, label: w as SVGGElement }))
      svg.querySelectorAll<SVGGElement>('.wheel-lw[data-key]').forEach((l) => { const e = map.get(l.dataset.key!); if (e) e.label = l })
      els.current = map
    }
    const done = () => { measureLabels(); measure() }
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) (document as any).fonts.ready.then(done, done)
    else done()
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure])

  // Focus change → labels of other families hide (settle rule), and the scene re-renders once.
  useEffect(() => { onSettle() }, [focusFamily, onSettle])

  useEffect(() => {
    try { setStickOn(localStorage.getItem(STICK_KEY) !== 'off') } catch { /* keep default */ }
  }, [])

  useEffect(() => {
    if (active) return
    setFocusFamily(null); focusFamilyRef.current = null; setFocusKey(null)
    if (loop.current != null) { caf(loop.current); loop.current = null }
    cam.current = { current: restCamera(), target: restCamera() }
    applyTransform(); onSettle()
  }, [active, applyTransform, onSettle])

  useEffect(() => () => { if (loop.current != null) caf(loop.current) }, [])

  // Esc: consumed only while something is focused/zoomed, so the overlay's own Esc-to-close still works at rest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (focusFamilyRef.current || cam.current.target.scale > 1.05) { e.preventDefault(); zoomOut() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [zoomOut])

  // Wheel must be non-passive to preventDefault page scroll.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = root.getBoundingClientRect()   // wheel events are rare (not per frame); keep it simple
      const px = e.clientX - r.left, py = e.clientY - r.top
      const s = cam.current
      if (!e.ctrlKey && e.deltaX !== 0) {
        const k = pxPerUnit(vp.current) * s.target.scale
        setTarget({ ...s.target, x: s.target.x + e.deltaX / k, y: s.target.y + e.deltaY / k })
        return
      }
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))
      setTarget(zoomAt(s.target, vp.current, px, py, factor, maxScaleRef.current))
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [setTarget])

  /* ---------- the single root listener ---------- */

  const localXY = (e: React.PointerEvent) => {
    const r = rootRef.current!.getBoundingClientRect()   // NOT per frame: pointer events only
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  // Note: getBoundingClientRect here runs per pointer EVENT, outside the animation frame, on a
  // root that never changes layout during motion — Chrome serves it from the clean layout tree.
  // The Phase 0 forced layouts came from reading the TRANSFORMING svg during a transition.

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = localXY(e)
    rootRef.current?.focus({ preventScroll: true })
    if (e.pointerType === 'touch') {
      for (const a of gestures.current.feed({ type: 'down', id: e.pointerId, x, y, t: performance.now() })) handleAction(a)
      startLoop()
      return
    }
    pointer.current = { ...pointer.current, downX: x, downY: y, down: true, mouse: true }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = localXY(e)
    if (e.pointerType === 'touch') {
      for (const a of gestures.current.feed({ type: 'move', id: e.pointerId, x, y, t: performance.now() })) handleAction(a)
      return
    }
    const p = pointer.current
    p.x = x; p.y = y; p.inside = true; p.mouse = true
    // hover: direct DOM only
    const w = screenToWorld(x, y, cam.current.current, vp.current)
    const node = nodeAtScene(w.x, w.y)
    const el = node ? els.current.get(node.path.join('>'))?.wedge ?? null : null
    if (el !== hoverEl.current) {
      hoverEl.current?.classList.remove('is-hover')
      el?.classList.add('is-hover')
      hoverEl.current = el
      if (rootRef.current) rootRef.current.style.cursor = node && (node.ring === 3 || node.ring === 2.5) && node.family === focusFamilyRef.current ? 'pointer' : 'default'
    }
    if (cam.current.target.scale > 1.05 && !reducedRef.current) startLoop()   // edge pan runs in the loop
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const { x, y } = localXY(e)
    if (e.pointerType === 'touch') {
      for (const a of gestures.current.feed({ type: 'up', id: e.pointerId, x, y, t: performance.now() })) handleAction(a)
      return
    }
    const p = pointer.current
    if (p.down && Math.hypot(x - p.downX, y - p.downY) <= CLICK_SLOP) tapAt(x, y)
    p.down = false
  }
  const onPointerCancel = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') for (const a of gestures.current.feed({ type: 'cancel', id: e.pointerId, x: 0, y: 0, t: performance.now() })) handleAction(a)
    pointer.current.down = false
  }
  const onPointerLeave = () => {
    pointer.current.inside = false; pointer.current.down = false
    hoverEl.current?.classList.remove('is-hover'); hoverEl.current = null
  }

  /* ---------- keyboard ---------- */

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = focusKey ? NODES.find((n) => n.path.join('>') === focusKey) ?? null : null
    const sameRing = (n: WheelNode) => (n.ring === 2.5 ? 2 : n.ring) === (cur ? (cur.ring === 2.5 ? 2 : cur.ring) : 1)
    const ringNodes = NODES.filter(sameRing).sort((a, b) => a.a0 - b.a0)
    const idx = cur ? ringNodes.findIndex((n) => n === cur) : -1
    const midOf = (n: WheelNode) => (n.a0 + n.a1) / 2
    const nearestInRing = (ring: number) => {
      const cands = NODES.filter((n) => (n.ring === 2.5 ? 2 : n.ring) === ring || (ring === 3 && n.ring === 2.5))
      const m = cur ? midOf(cur) : -Math.PI / 2
      return cands.reduce((best, n) => (Math.abs(midOf(n) - m) < Math.abs(midOf(best) - m) ? n : best), cands[0])
    }
    let next: WheelNode | null = null
    switch (e.key) {
      case 'ArrowRight': next = ringNodes[(idx + 1 + ringNodes.length) % ringNodes.length]; break
      case 'ArrowLeft': next = ringNodes[(idx - 1 + ringNodes.length) % ringNodes.length]; break
      case 'ArrowUp': next = cur ? nearestInRing(Math.max(1, (cur.ring === 2.5 ? 2 : cur.ring) - 1)) : ringNodes[0]; break
      case 'ArrowDown': next = cur ? nearestInRing(Math.min(3, (cur.ring === 2.5 ? 2 : cur.ring) + 1)) : ringNodes[0]; break
      case 'Enter': case ' ': if (cur) { e.preventDefault(); activate(cur) } return
      default: return
    }
    e.preventDefault()
    if (next) setFocusKey(next.path.join('>'))
  }

  const toggleStick = () => {
    setStickOn((on) => { const v = !on; try { localStorage.setItem(STICK_KEY, v ? 'on' : 'off') } catch { /* ignore */ } return v })
  }

  const count = picks.length
  const backLabel = focusFamily ?? ''

  return (
    <div
      ref={rootRef}
      className="wheel-root"
      data-testid="flavor-wheel-stage"
      data-focus={focusFamily ?? ''}
      data-zoomed={zoomed ? '1' : '0'}
      tabIndex={0}
      role="application"
      aria-label="Flavour wheel. Arrow keys move, Enter picks, Escape zooms out."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      <div ref={cameraRef} className="wheel-camera">
        <WheelScene
          svgRef={svgRef}
          pickedKeys={pickedKeys}
          focusFamily={focusFamily}
          focusKey={focusKey}
          hoverKey={null}
          onActivate={activate}
        />
      </div>

      <div className="wheel-overlay">
        {focusFamily && (
          <button type="button" className="wheel-back" onClick={zoomOut}>
            <span aria-hidden>←</span> {backLabel}
          </button>
        )}
        <button type="button" className="wheel-home" hidden={!zoomed} onClick={zoomOut}>centre · zoom out</button>
        <div className="wheel-counter" data-pulse={pulse ? '1' : '0'} key={pulse} aria-live="polite">
          Picks {count}/{OLF_CAP}
        </div>
        <div ref={pressRingRef} className="wheel-press-ring" hidden aria-hidden />
        {compact && (
          <button type="button" className="wheel-back" style={{ top: 'auto', bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))', left: 12 }} onClick={toggleStick} aria-pressed={stickOn}>
            {stickOn ? 'Hide stick' : 'Show stick'}
          </button>
        )}
        {compact && stickOn && (
          <Thumbstick onVector={(v) => { stick.current = v; if (v.m > 0) startLoop() }} knobColorRef={knobColorRef} />
        )}
        {debug && <DebugHud statsRef={stats} />}
      </div>
    </div>
  )
})
```

- [ ] **Step 4: Run the wheel tests, then the whole cva folder**

Run: `npx vitest run src/components/cupping/cva/wheel/FlavorWheel.test.tsx && npx vitest run src/components/cupping/cva && npx tsc --noEmit`
Expected: FlavorWheel PASS (11 tests); the DescribeOverlay tests still PASS (they use the role=button path, which is Rule 1/2 behaviour); tsc 0 errors. If `Escape` at rest reports consumed, check that `cam.current.target.scale` really is 1 at rest (the `active` reset) — never widen the condition.

Known jsdom notes: `fireEvent.pointerDown` sets `pointerType` only when passed (done in the tests); `clientWidth` is mocked by `mockRoot`; `requestAnimationFrame` is provided by vitest's jsdom (`pretendToBeVisual`), and the `raf` fallback covers anything else.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/cupping/cva/wheel
git commit -m "feat(cva): FlavorWheel root — one listener, one rAF loop, one transform; camera-fly drill; keyboard; thumbstick wiring"
```

---

### Task 10: DescribeOverlay — no backdrop blur, no shade logic, collapsible mobile tray

**Files:**
- Modify: `src/components/cupping/cva/wheel/DescribeOverlay.tsx`
- Modify: `src/components/cupping/cva/wheel/DescribeOverlay.test.tsx` (add two tests)
- Modify: `src/components/cupping/cva/wheel/FlavorWheel.tsx` — remove the `onShade` prop from `FlavorWheelProps`.

**Interfaces:**
- Consumes: `FlavorWheel` props `{ picks, onToggle, active, onSwipeClose }`.
- Produces: the tray root is `<div class="wheel-tray" data-open="0|1" data-testid="describe-tray">` with a `<button class="wheel-tray-toggle">` (visible only under the compact media query via CSS from Task 8) and `<div class="wheel-tray-body">`. On desktop `data-open` is always `"1"`; on compact screens it starts `"0"` and toggles on tap. The overlay passes `onSwipeClose={onClose}` to the wheel.

- [ ] **Step 1: Add the failing tests**

Append to `DescribeOverlay.test.tsx` inside the existing `describe('DescribeOverlay', …)` block:

```tsx
  it('the tray has no backdrop blur and no filter', () => {
    render(<Harness />)
    const tray = screen.getByTestId('describe-tray')
    expect(tray.className).not.toMatch(/backdrop-blur/)
    expect(tray.style.backdropFilter || '').toBe('')
    expect(tray.style.filter || '').toBe('')
  })

  it('on a compact screen the tray starts collapsed and expands on tap; the counter stays visible on the wheel', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q.includes('max-width: 1023px'), media: q, addEventListener() {}, removeEventListener() {} }),
    })
    render(<Harness />)
    const tray = screen.getByTestId('describe-tray')
    expect(tray.getAttribute('data-open')).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /descriptors/i }))
    expect(tray.getAttribute('data-open')).toBe('1')
    expect(screen.getByText('Picks 0/5')).toBeTruthy()   // wheel-counter (FlavorWheel) is always there
  })
```

Also update the existing `'picking a note adds a chip…'` test: `screen.getByText('Picks 1/5')` now matches TWO elements (the wheel counter and the tray badge). Change those two assertions to `screen.getAllByText('Picks 1/5').length).toBeGreaterThan(0)` and `screen.queryAllByText('Picks 1/5')).toHaveLength(0)`; in the 6th-pick test change `getByText('Picks 5/5')` to `getAllByText('Picks 5/5')[0]`.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/components/cupping/cva/wheel/DescribeOverlay.test.tsx`
Expected: the two new tests FAIL (no `describe-tray` test id).

- [ ] **Step 3: Modify the overlay**

In `DescribeOverlay.tsx`:

1. Delete the shade mechanism: the `shade` state, `shadeTimer`, `setShade`, its cleanup effect, and the `onShade={setShade}` prop on `<FlavorWheel>`. Delete the `${shade && isOlfactory ? 'pointer-events-none opacity-0' : 'pointer-events-auto'}` branch (the tray is always `pointer-events-auto`).
2. Add compact detection and the open state near the top of the component:

```tsx
const [compact, setCompact] = useState(false)
useEffect(() => {
  if (typeof window.matchMedia !== 'function') return
  const mq = window.matchMedia(COMPACT_MQ)
  const update = () => setCompact(mq.matches)
  update()
  mq.addEventListener?.('change', update)
  return () => mq.removeEventListener?.('change', update)
}, [])
const [trayOpen, setTrayOpen] = useState(false)
const open_ = !compact || trayOpen
```

with `import { FlavorWheel, COMPACT_MQ } from './FlavorWheel'`.

3. Replace the wheel stage container so the wheel fills the region edge to edge (the root is `position:absolute; inset:0` per Task 8 CSS):

```tsx
{isOlfactory ? (
  <div className="relative min-h-0 flex-1">
    <FlavorWheel picks={olf.picks} onToggle={togglePick} active={open} onSwipeClose={onClose} />
  </div>
) : ( …unchanged MouthfeelCata block… )}
```

4. Replace the tray's outer `<div className={\`flex max-h-[…] … backdrop-blur-md …\`}>` with:

```tsx
<div
  data-testid="describe-tray"
  data-open={open_ ? '1' : '0'}
  className="wheel-tray pointer-events-auto flex w-full max-w-[820px] flex-col items-center gap-3 px-4 py-2.5 sm:px-5 sm:py-3"
  style={{ maxHeight: compact ? 'min(40dvh, 320px)' : 'min(46dvh, 340px)', overflowY: 'auto' }}
>
  {compact && (
    <button
      type="button"
      className="wheel-tray-toggle w-full text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground"
      aria-expanded={open_}
      onClick={() => setTrayOpen((v) => !v)}
    >
      Descriptors · {groupCount(group)} {open_ ? '▾' : '▸'}
    </button>
  )}
  <div className="wheel-tray-body flex w-full flex-col items-center gap-3">
    …everything that was inside the old tray (MainTastes, the descriptors block, the free-text label, the toast)…
  </div>
</div>
```

and change the tray wrapper's bottom offset on compact screens so the bottom 140 px stay clear for the thumb: on the `pointer-events-none absolute inset-x-0 … flex justify-center` wrapper use `bottom-[148px] sm:bottom-6` in place of `bottom-4 sm:bottom-6`.

The two triangle glyphs are plain text characters, not emoji.

5. In `FlavorWheel.tsx` remove the `onShade` line from `FlavorWheelProps` and its doc comment.

- [ ] **Step 4: Run the overlay tests, the cva folder, and type-check**

Run: `npx vitest run src/components/cupping/cva && npx tsc --noEmit`
Expected: all PASS; 0 errors. `CvaJourney.test.tsx` mounts the overlay through `dynamic()`; if it now fails on `matchMedia`, add the same `mockMedia` helper used in `FlavorWheel.test.tsx` to its `beforeEach`.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/wheel/DescribeOverlay.tsx src/components/cupping/cva/wheel/DescribeOverlay.test.tsx src/components/cupping/cva/wheel/FlavorWheel.tsx
git commit -m "feat(cva): describe tray — plain background, collapsible on phones, thumb territory reserved; shade logic removed"
```

---

### Task 11: Perf harness, trace scripts, PROGRESS.md — take the after numbers

**Files:**
- Create: `src/app/embed/wheel-harness/page.tsx` (server component, `notFound()` in production)
- Create: `src/app/embed/wheel-harness/harness.tsx` (client component)
- Create: `scripts/perf/trace-wheel.mjs`, `scripts/perf/analyze-trace.mjs`, `scripts/perf/README.md`
- Create: `PROGRESS.md`

**Interfaces:**
- The harness mounts the real `DescribeOverlay` with local state at `/embed/wheel-harness` (public in middleware, dev-only via `notFound()`). The scripts drive it and print the same table as Phase 0.
- Puppeteer is NOT added to `package.json`; the driver resolves it from the chrome-devtools skill's `node_modules` (see the `createRequire` line) so the app's bundle and lockfile stay untouched.

- [ ] **Step 1: The harness route**

```tsx
// src/app/embed/wheel-harness/page.tsx
import { notFound } from 'next/navigation'
import { WheelHarness } from './harness'

// Dev-only: the perf scripts in scripts/perf drive this page. /embed/* is public
// in middleware, so production must 404 it.
export default function WheelHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <WheelHarness />
}
```

```tsx
// src/app/embed/wheel-harness/harness.tsx
'use client'

import { useCallback, useState } from 'react'
import { DescribeOverlay } from '@/components/cupping/cva/wheel/DescribeOverlay'
import { createEmptyAssessment, type CvaDescribe, type DescribeGroup } from '@/types/cva'

export function WheelHarness() {
  const [describe, setDescribe] = useState<CvaDescribe>(() => createEmptyAssessment().describe)
  const [group, setGroup] = useState<DescribeGroup>('aroma')
  const onDescribe = useCallback((m: (d: CvaDescribe) => CvaDescribe) => setDescribe((d) => m(d)), [])
  const noop = useCallback(() => {}, [])
  return (
    <div className="cva-root" style={{ ['--cva-accent' as string]: '#556b2f' }}>
      <DescribeOverlay open group={group} onGroupChange={setGroup} describe={describe} onDescribe={onDescribe} onClose={noop} />
    </div>
  )
}
```

- [ ] **Step 2: The trace driver** — `scripts/perf/trace-wheel.mjs`. This is the Phase 0 driver; the three scenarios are unchanged so before/after are comparable. Two changes from Phase 0: (1) the selectors `.cva-wheel-svg` → `.wheel-scene` and `.cva-wheel-stage` → `.wheel-root` everywhere in the file (the old classes no longer exist); (2) the `drill` scenario now CLICKS Fruity (the dwell-zoom no longer exists) — replace the `await sleep(900) // dwell-in…` line's preceding `mouse.move` with `await page.mouse.click(...M(...polar((f0 + f1) / 2, (R0 + R1) / 2)))` and keep the sleep.

```js
// Phase-0 trace driver for the CVA flavour wheel harness.
// usage: node trace-wheel.mjs --scenario hover|drill|mobile --out trace.json [--url URL] [--headless]
import { createRequire } from 'node:module'
const require = createRequire('/Users/danielwolthers/.claude/skills/chrome-devtools/scripts/node_modules/puppeteer/package.json')
const puppeteer = require('puppeteer')

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean))
const scenario = args.scenario || 'hover'
const url = args.url || 'http://localhost:3000/embed/wheel-harness'
const out = args.out || `trace-${scenario}.json`
const headless = args.headless === true || args.headless === 'true'

const VIEW = 440, CX = 220, CY = 220, R0 = 58, R1 = 106, R2 = 158, R3 = 212
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  headless,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=2600,1500', '--force-device-scale-factor=2'],
  defaultViewport: null,
})
const page = await browser.newPage()
const mobile = scenario === 'mobile'
if (mobile) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36')
} else {
  await page.setViewport({ width: +(args.vw || 2560), height: +(args.vh || 1400), deviceScaleFactor: 2 })
}
const cdp = await page.createCDPSession()
if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForSelector('.cva-wheel-svg', { timeout: 120000 })
await sleep(1500)

// viewBox → screen, reading the CURRENT (transformed) svg box
async function mapper() {
  const r = await page.evaluate(() => {
    const b = document.querySelector('.cva-wheel-svg').getBoundingClientRect()
    return { left: b.left, top: b.top, width: b.width, height: b.height }
  })
  return (x, y) => [r.left + (x * r.width) / VIEW, r.top + (y * r.height) / VIEW]
}
async function nodeInfo() {
  // family spans + Other Fruit leaves, from the aria labels + geometry we know
  return page.evaluate(() => {
    const out = []
    document.querySelectorAll('g[role=button]').forEach((g) => out.push(g.getAttribute('aria-label')))
    return out
  })
}
const polar = (a, r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r]

// Family angular spans in the wheel's leaf-count layout (110 leaves total).
const FAMS = [['Floral', 4], ['Fruity', 18], ['Sour/Fermented', 10], ['Green/Vegetative', 10], ['Other', 16], ['Roasted', 8], ['Spices', 6], ['Nutty/Cocoa', 5], ['Sweet', 8]]
// leaf counts above come from flavor-wheel-data (Floral: BlackTea1 + 3; Fruity: 4+2+8+4; Sour: 6+4; Green: 1+1+7+1; Other: 10+6; Roasted: 1+1+4+2; Spices: 1+1+4; Nutty: 3+2; Sweet: 4+1+1+1+1)
const TOTAL = FAMS.reduce((s, [, n]) => s + n, 0)
const U = (Math.PI * 2) / TOTAL
const spans = {}
let a = -Math.PI / 2
for (const [n, c] of FAMS) { spans[n] = [a, a + c * U]; a += c * U }
if (TOTAL !== 85) throw new Error('leaf total mismatch ' + TOTAL)

const marks = []
const mark = async (name) => { marks.push({ name, t: Date.now() }); await page.evaluate((n) => performance.mark(n), name) }

await page.tracing.start({
  path: out,
  categories: [
    'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
    'disabled-by-default-devtools.timeline.stack', 'benchmark', 'toplevel', 'blink.user_timing', 'loading', 'v8.execute',
  ],
})
await sleep(300)

if (scenario === 'hover') {
  // (a) hover across families at the family ring, dwelling long enough for the dwell-zoom
  let M = await mapper()
  await mark('hover-start')
  for (const [n] of FAMS) {
    const [a0, a1] = spans[n]
    M = await mapper()
    const [x, y] = M(...polar((a0 + a1) / 2, (R0 + R1) / 2))
    await page.mouse.move(x, y, { steps: 18 })
    await sleep(380)
  }
  // leave the wheel → springs to rest
  await page.mouse.move(40, 40, { steps: 10 })
  await sleep(700)
  await mark('hover-end')
} else if (scenario === 'drill') {
  // (b) center → Fruity → Other Fruit leaves
  let M = await mapper()
  await mark('drill-start')
  await page.mouse.move(...M(CX, CY), { steps: 8 })
  await sleep(400)
  const [f0, f1] = spans['Fruity']
  await page.mouse.move(...M(...polar((f0 + f1) / 2, (R0 + R1) / 2)), { steps: 14 })
  await sleep(900) // dwell-in (210ms) + grand zoom (550ms)
  M = await mapper()
  // Other Fruit = leaves 7..14 of Fruity (Berry 4, Dried 2, Other 8, Citrus 4)
  const o0 = f0 + 6 * U, o1 = f0 + 14 * U
  await page.mouse.move(...M(...polar(o0 + U / 2, R1 + 20)), { steps: 12 })
  await sleep(300)
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(...M(...polar(o0 + (i + 0.5) * U, (R2 + R3) / 2)), { steps: 10 })
    await sleep(140)
  }
  for (let i = 7; i >= 0; i--) {
    await page.mouse.move(...M(...polar(o0 + (i + 0.5) * U, (R2 + R3) / 2)), { steps: 10 })
    await sleep(140)
  }
  await page.mouse.move(...M(CX, CY), { steps: 12 })
  await sleep(900)
  await mark('drill-end')
} else if (scenario === 'mobile') {
  let M = await mapper()
  await mark('mobile-start')
  const [f0, f1] = spans['Fruity']
  await page.touchscreen.tap(...M(...polar((f0 + f1) / 2, (R0 + R1) / 2)))
  await sleep(1100)
  M = await mapper()
  const o0 = f0 + 6 * U
  await page.touchscreen.tap(...M(...polar(o0 + 2.5 * U, (R2 + R3) / 2)))
  await sleep(700)
  await page.touchscreen.tap(...M(...polar(o0 + 4.5 * U, (R2 + R3) / 2)))
  await sleep(700)
  // switch family by tap
  const [s0, s1] = spans['Sweet']
  await page.touchscreen.tap(...M(...polar((s0 + s1) / 2, (R0 + R1) / 2)))
  await sleep(1100)
  M = await mapper()
  await page.touchscreen.tap(...M(CX, CY - 10)) // hub → rest (svg click)
  await sleep(1000)
  await mark('mobile-end')
}

await sleep(300)
await page.tracing.stop()
const domCount = await page.evaluate(() => ({
  svgNodes: document.querySelectorAll('.cva-wheel-svg *').length,
  texts: document.querySelectorAll('.cva-wheel-svg text').length,
  paths: document.querySelectorAll('.cva-wheel-svg path').length,
  filters: document.querySelectorAll('.cva-wheel-svg [filter], .cva-wheel-svg filter').length,
  dpr: devicePixelRatio,
  stage: (() => { const b = document.querySelector('.cva-wheel-stage').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] })(),
}))
console.log(JSON.stringify({ scenario, out, marks, domCount }, null, 2))
await browser.close()
```

- [ ] **Step 3: The analyser** — `scripts/perf/analyze-trace.mjs`

```js
// Summarise a Chrome trace of the wheel harness. usage: node analyze-trace.mjs trace.json
import fs from 'node:fs'
const file = process.argv[2]
const ev = JSON.parse(fs.readFileSync(file, 'utf8')).traceEvents
const marks = ev.filter((e) => (e.cat || '').includes('blink.user_timing') && /-(start|end)$/.test(e.name))
const t0 = Math.min(...marks.filter((m) => /-start$/.test(m.name)).map((m) => m.ts))
const t1 = Math.max(...marks.filter((m) => /-end$/.test(m.name)).map((m) => m.ts))
const win = (e) => e.ts >= t0 && e.ts <= t1
// renderer main thread = CrRendererMain of the pid that owns the Layout events
const lay0 = ev.find((e) => e.name === 'Layout' && e.ph === 'X' && win(e))
const rpid = lay0.pid
const mainTid = ev.find((e) => e.name === 'thread_name' && e.pid === rpid && e.args?.name === 'CrRendererMain').tid
const onMain = (e) => e.pid === rpid && e.tid === mainTid
const X = ev.filter((e) => e.ph === 'X' && win(e))
const sum = (pred) => X.filter(pred).reduce((s, e) => s + e.dur, 0) / 1000
const cnt = (pred) => X.filter(pred).length
const ms = (v) => +v.toFixed(1)
// frames from the renderer's PipelineReporter
const pipe = ev.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.pid === rpid && win(e)).sort((a, b) => a.ts - b.ts)
const states = {}; let highLat = 0
for (const p of pipe) { const s = p.args?.frame_reporter?.state || '?'; states[s] = (states[s] || 0) + 1; if (p.args?.frame_reporter?.has_high_latency) highLat++ }
const gapsAll = [], gapsMotion = []
for (let i = 1; i < pipe.length; i++) { const g = (pipe[i].ts - pipe[i - 1].ts) / 1000; if (g <= 400) gapsAll.push(g); if (g <= 100) gapsMotion.push(g) }
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return ms(s[Math.min(s.length - 1, Math.floor(p * s.length))]) }
// main-thread frame = BeginMainFrame; its duration is the true per-frame main cost
const bmf = X.filter((e) => onMain(e) && e.name === 'ProxyMain::BeginMainFrame').map((e) => e.dur / 1000)
const bmfSorted = [...bmf].sort((a, b) => a - b)
const nFrames = Math.max(gapsMotion.length, 1)
const cat = (names, thread = onMain) => ({ total_ms: ms(sum((e) => thread(e) && names.includes(e.name))), events: cnt((e) => thread(e) && names.includes(e.name)) })
const cats = {
  Layout: cat(['Layout']),
  Style: cat(['UpdateLayoutTree']),
  PrePaint_Layerize: cat(['PrePaint', 'Layerize', 'UpdateLayerTree']),
  Paint: cat(['Paint']),
  Script: cat(['FunctionCall', 'TimerFire', 'FireAnimationFrame']),
  HitTest: cat(['HitTest']),
  GC: cat(['MajorGC', 'MinorGC']),
}
const rasterThreads = (e) => e.pid === rpid && e.tid !== mainTid
const raster = cat(['RasterTask', 'RasterizerTaskImpl::RunOnWorkerThread'], rasterThreads)
const imageDecode = cat(['Decode Image', 'ImageDecodeTask'], rasterThreads)
// forced layouts: Layout carrying a JS stack, excluding the harness's own getBoundingClientRect reads
const forced = X.filter((e) => onMain(e) && e.name === 'Layout' && e.args?.beginData?.stackTrace?.length && !String(e.args.beginData.stackTrace[0]?.url || '').startsWith('pptr:'))
const forcedFns = {}
for (const f of forced) { const k = f.args.beginData.stackTrace[0].functionName || '(anon)'; forcedFns[k] = (forcedFns[k] || 0) + 1 }
const tasks = X.filter((e) => onMain(e) && e.name === 'RunTask').map((e) => e.dur / 1000)
const long = tasks.filter((d) => d > 50)
const windowMs = (t1 - t0) / 1000
const out = {
  file, window_ms: Math.round(windowMs),
  frames: {
    pipeline_frames: pipe.length, states, high_latency: highLat,
    motion_frames: gapsMotion.length, motion_p50_ms: pct(gapsMotion, 0.5), motion_p95_ms: pct(gapsMotion, 0.95), motion_max_ms: pct(gapsMotion, 1),
    all_gaps_p95_ms: pct(gapsAll, 0.95),
    fps_in_motion: gapsMotion.length ? ms(1000 / (gapsMotion.reduce((a, b) => a + b, 0) / gapsMotion.length)) : null,
  },
  main_frame: { begin_main_frames: bmf.length, total_ms: ms(bmf.reduce((a, b) => a + b, 0)), p50_ms: pct(bmfSorted, 0.5), p95_ms: pct(bmfSorted, 0.95), max_ms: pct(bmfSorted, 1) },
  main_busy_pct: Math.round((tasks.reduce((a, b) => a + b, 0) / windowMs) * 100),
  long_tasks: { count: long.length, max_ms: long.length ? ms(Math.max(...long)) : 0 },
  forced_layouts: { count: forced.length, total_ms: ms(forced.reduce((s, e) => s + e.dur, 0) / 1000), by_function: forcedFns },
  per_motion_frame_ms: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, ms(v.total_ms / nFrames)])),
  totals: { ...cats, Raster_workers: raster, ImageDecode: imageDecode },
}
console.log(JSON.stringify(out, null, 2))
```

- [ ] **Step 4: README** — `scripts/perf/README.md`

```md
# Wheel performance check

Repeatable frame-time measurement of the flavour wheel (spec 2026-09-02, rule 8).

    npm run dev                                   # in one terminal
    node scripts/perf/trace-wheel.mjs --scenario hover  --out /tmp/hover.json
    node scripts/perf/trace-wheel.mjs --scenario drill  --out /tmp/drill.json
    node scripts/perf/trace-wheel.mjs --scenario mobile --out /tmp/mobile.json      # 390×844 @3x, 4× CPU throttle
    node scripts/perf/trace-wheel.mjs --scenario hover --vw 2560 --vh 2900 --out /tmp/hover-5k.json
    node scripts/perf/analyze-trace.mjs /tmp/hover.json

Targets: `main_frame.p95_ms` ≤ 8 (desktop) / ≤ 14 (mobile), `STATE_DROPPED` ≈ 0,
`totals.Layout.events` ≈ 0 during motion. Puppeteer is resolved from the
chrome-devtools skill's node_modules (see the createRequire line); the app has no
Puppeteer dependency.
```

- [ ] **Step 5: Run the numbers and write PROGRESS.md**

Start `npm run dev`, warm the route with `curl -s -o /dev/null http://localhost:3000/embed/wheel-harness`, run all four traces and the analyser. Then create `PROGRESS.md` at the repo root:

```md
# WAQC progress notes

## 2026-09-02 — CVA flavour wheel rebuild (architecture decision)

**Decision:** SVG scene rendered once + one CSS transform on an HTML camera div
(Option A). No filters. Camera-fly drill model; the old "sector expands" reflow was
dropped because a smooth reflow on SVG is a layout per frame by construction.
Zoom caps 1.5× desktop / 3× mobile (Daniel). Full reasoning:
`docs/superpowers/specs/2026-09-02-cva-wheel-rebuild-design.md`.

**Why not Canvas/WebGL:** Phase 0 showed the cost was two pathologies (CSS transforms
transitioning on SVG groups → full-subtree layout per frame; 30+ blur filters
re-rastering at DPR), not SVG itself. Removing them meets the budget.

| Run | Before: dropped / main p95 / Layout | After: dropped / main p95 / Layout |
|---|---|---|
| Hover sweep, 2560 px | 31% / 18.4 ms / 935 ms (433) | <fill in> |
| Hover sweep, 5K-sized | 54% / 60.9 ms / 1,745 ms (451) | <fill in> |
| Drill hub → Fruity → Other Fruit | 9% / 9.0 ms / 358 ms (459) | <fill in> |
| Mobile 390 px @3×, 4× CPU | 11% / 18.1 ms / 458 ms (120) | <fill in> |

Re-take with `scripts/perf/README.md`. Do not relitigate the renderer choice without
re-running these.
```

Replace every `<fill in>` with the measured numbers. **If any "after" run misses the budget** (p95 > 8 ms desktop / > 14 ms mobile, or Layout events during motion), stop and report the analyser output before merging — do not tune the CSS ad hoc.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: 0 errors (the `.mjs` files are outside `tsconfig` includes).

```bash
git add src/app/embed/wheel-harness scripts/perf PROGRESS.md
git commit -m "chore(cva): dev-only wheel perf harness, trace scripts, PROGRESS.md with before/after numbers"
```

---

### Task 12: Verification, parity checklist, merge

**Files:** none new. Whole-branch verification.

- [ ] **Step 1: Full suite and type-check**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -6`
Expected: 0 errors; every file passing; the total test count = baseline count − 4 (zoom-machine tests) + the new tests (palette 5, hit-test 4, camera 11, labels 7, gestures 7, WheelScene 5, Thumbstick 7, FlavorWheel 11, DescribeOverlay +2). Quote both counts.

- [ ] **Step 2: Grep the rules**

```bash
grep -rnE "filter|backdrop|box-shadow|drop-shadow" src/components/cupping/cva/wheel/ src/app/globals.css | grep -iv "\.filter(\|Array\|// " 
grep -rnE "getBoundingClientRect|getBBox|getComputedTextLength" src/components/cupping/cva/wheel/
```

Expected: the first prints nothing from the `.wheel-*` CSS block or the wheel components (the DescribeOverlay tray has no blur). The second prints only the three documented per-event reads in `FlavorWheel.tsx` (`localXY`, the wheel handler, `measure`) and the Thumbstick's pointerdown read — none inside `tick`, `onSettle` or `onPointerMove`'s hover path.

- [ ] **Step 3: Manual parity checklist** (brief Phase 3) — run the app (`npm run dev`), open a specialty lot's Describe overlay, and tick each line in the commit message:

- Three sections (Aroma / Flavor & Aftertaste / Mouthfeel) with the wheel on the two olfactory tabs and CATA on Mouthfeel
- Picks tracked per section; switching tabs shows each tab's own picks lit
- Family → group → descriptor: click Fruity (flies), click Berry (pickable as a group), click Blackberry (leaf pick)
- `Picks n/5` live on the wheel and in the tray; 6th pick replaces the oldest with the toast, counter pulses
- Free-text off-wheel descriptor persists after reload (autosave unchanged)
- "Official form auto-fill" line updates with picks
- `← Family` breadcrumb and `centre · zoom out` both return to rest; Escape once = zoom out, Escape at rest = close overlay
- Family colours identical to before (compare with the certificate wheel)
- Selected (ring + dot) vs hover (bright stroke) vs keyboard focus (2 px own-colour stroke) are distinguishable
- Desktop: edge pan engages only when zoomed; wheel zooms at the pointer; trackpad pinch zooms; `?debug=1` HUD shows p95 ≤ 8 ms during a hover sweep
- Mobile (Chrome device mode + a real phone if available): thumbstick pans, toss to the left persists across reload, hide/show toggle persists, long-press draws the ring and flies, pinch, two-finger pan, double-tap zooms out, swipe down from the top closes, tray collapsed by default
- `prefers-reduced-motion` (Chrome rendering panel emulation): flies are instant cuts, no edge pan

- [ ] **Step 4: Request review, then merge to main**

Use `superpowers:requesting-code-review` on the whole branch. Then, from the main tree (which has other uncommitted work — merge, do not rebase it):

```bash
git checkout main
git merge --no-ff feat/cva-wheel-rebuild -m "feat(cva): flavour wheel rebuild — camera model, zero-layout renderer, mobile controls"
npx tsc --noEmit && npx vitest run 2>&1 | tail -3
```

Push only when Daniel confirms (Vercel auto-deploys `main`). Then update the memory file `specialty-cva-cupping.md` and add a new memory for the rebuild with the after numbers.
