// Emits the wheel's geometry + the phone camera states using the PRODUCTION
// functions, so the mockup's framing is what the app would actually do.
import { writeFileSync } from 'node:fs'
import { NODES, WHEEL, CX, CY, VIEW, R0, R1, R3, arcPathD, cataForPick, CATA_BOXES, MAIN_TASTES, MOUTH_CATA, OLF_CAP, TASTE_CAP, MOUTH_CAP } from '@/lib/cva/flavor-wheel-data'
import { PALETTE } from '@/components/cupping/cva/wheel/palette'
import { LABELS, splitLabel } from '@/components/cupping/cva/wheel/labels'
import { WEDGE_GAP } from '@/components/cupping/cva/wheel/WheelScene'
import { visibleLabelKeys, ringFontSizes } from '@/components/cupping/cva/wheel/labels'
import { flyToNode, clampCamera, restCamera, cameraTransform, MAX_SCALE_MOBILE, REST_SCALE_MOBILE, FLY_FLOOR_MOBILE, type Viewport } from '@/components/cupping/cva/wheel/camera'

// Phone stage: 390 wide; 844 − 54 (status/safe top) − 52 (overlay bar) = 738 tall.
const W = 390, H = 738
// Bottom inset = the band the descriptors sheet covers, measured from the stage bottom.
const INSET_COLLAPSED = 52 + 34        // 52 px sheet row + 34 px home-indicator safe area
const INSET_EXPANDED = 300 + 34        // expanded sheet (≈300 px) + safe area
// Both of these now live in production (camera.ts) — the mockup no longer diverges
// from it in any way. Aliased here only so the artboards can label the numbers.
const ZOOM_FLOOR = FLY_FLOOR_MOBILE
const REST_ZOOM = REST_SCALE_MOBILE

const vp = (insetBottom: number): Viewport => ({ width: W, height: H, insetBottom })

const r3 = (v: number) => Math.round(v * 1000) / 1000

const nodes = NODES.map((n, idx) => {
  const mid = (n.a0 + n.a1) / 2, rDot = n.r1 - 5
  const pal = PALETTE.get(n.path.join('>'))!
  const g = LABELS[idx]
  return {
    cata: cataForPick(n.path),
    idx,
    key: n.path.join('>'),
    id: 'n' + idx,
    name: n.name,
    family: n.family,
    ring: n.ring === 1 ? 1 : n.ring === 3 ? 3 : 2,
    path: n.path,
    d: arcPathD(n.r0, n.r1, n.a0 + WEDGE_GAP, n.a1 - WEDGE_GAP).replace(/(\d+\.\d{3})\d+/g, '$1'),
    fill: pal.fill,
    labelFill: pal.label,
    dot: { x: r3(CX + Math.cos(mid) * rDot), y: r3(CY + Math.sin(mid) * rDot) },
    label: { kind: 'radial', x: r3(g.x), y: r3(g.y), deg: r3(g.deg), anchor: g.anchor, weight: g.weight, lines: g.lines },
  }
})

function state(cam: ReturnType<typeof restCamera>, v: Viewport) {
  const fs = ringFontSizes(v, cam.scale)
  return {
    cam,
    transform: cameraTransform(cam, v),
    scale: r3(cam.scale),
    fs: { r1: r3(fs.r1), r2: r3(fs.r2), r3: r3(fs.r3) },
    visible: [...visibleLabelKeys(v, cam.scale)],
  }
}

// `rest` is where a compact wheel now rests in production; `rest1x` is the desktop
// rest, kept only so the artboard's chip can show the before/after.
const rest = {
  col: state(clampCamera(restCamera(true), vp(INSET_COLLAPSED)), vp(INSET_COLLAPSED)),
  exp: state(clampCamera(restCamera(true), vp(INSET_EXPANDED)), vp(INSET_EXPANDED)),
}
const rest1x = {
  col: state(clampCamera(restCamera(), vp(INSET_COLLAPSED)), vp(INSET_COLLAPSED)),
  exp: state(clampCamera(restCamera(), vp(INSET_EXPANDED)), vp(INSET_EXPANDED)),
}

const families: Record<string, { col: ReturnType<typeof state>; exp: ReturnType<typeof state> }> = {}
const families22: Record<string, { col: ReturnType<typeof state>; exp: ReturnType<typeof state> }> = {}
for (const f of WHEEL) {
  const node = NODES.find((n) => n.ring === 1 && n.name === f.n)!
  families[f.n] = {
    col: state(flyToNode(node, vp(INSET_COLLAPSED), MAX_SCALE_MOBILE), vp(INSET_COLLAPSED)),
    exp: state(flyToNode(node, vp(INSET_EXPANDED), MAX_SCALE_MOBILE), vp(INSET_EXPANDED)),
  }
  families22[f.n] = {
    col: state(flyToNode(node, vp(INSET_COLLAPSED), MAX_SCALE_MOBILE, ZOOM_FLOOR), vp(INSET_COLLAPSED)),
    exp: state(flyToNode(node, vp(INSET_EXPANDED), MAX_SCALE_MOBILE, ZOOM_FLOOR), vp(INSET_EXPANDED)),
  }
}

/**
 * The 24 CATA checkboxes exactly as SCA-103 §8.2 prints them — one indented
 * group per family. This is the record the cupper is actually creating, and it
 * is what the overlay's list view shows. Written out here in FORM order (which
 * the flat CATA_BOXES set does not carry) and then checked against the
 * production set, so the two can never drift apart silently.
 */
const FORM_BOXES: { head: string; subs: string[] }[] = [
  { head: 'Floral', subs: [] },
  { head: 'Fruity', subs: ['Berry', 'Dried Fruit', 'Citrus Fruit'] },
  { head: 'Sour/Fermented', subs: ['Sour', 'Fermented'] },
  { head: 'Green/Vegetative', subs: [] },
  { head: 'Other', subs: ['Chemical', 'Musty/Earthy', 'Woody'] },
  { head: 'Roasted', subs: ['Cereal', 'Burnt', 'Tobacco'] },
  { head: 'Nutty/Cocoa', subs: ['Nutty', 'Cocoa'] },
  { head: 'Spice', subs: [] },
  { head: 'Sweet', subs: ['Vanilla/Vanillin', 'Brown Sugar'] },
]
{
  const flat = FORM_BOXES.flatMap((g) => [g.head, ...g.subs])
  const missing = [...CATA_BOXES].filter((b) => !flat.includes(b))
  const extra = flat.filter((b) => !CATA_BOXES.has(b))
  if (missing.length || extra.length) throw new Error(`FORM_BOXES drifted from CATA_BOXES: missing ${missing} extra ${extra}`)
  if (flat.length !== CATA_BOXES.size) throw new Error(`FORM_BOXES has ${flat.length}, CATA_BOXES has ${CATA_BOXES.size}`)
  console.log(`FORM_BOXES: ${flat.length} boxes, matches CATA_BOXES`)
}

const out = {
  VIEW, CX, CY, W, H, INSET_COLLAPSED, INSET_EXPANDED,
  wheelSize: Math.min(W, H),
  families: WHEEL.map((f) => ({ name: f.n, color: f.c })),
  nodes,
  REST_ZOOM, ZOOM_FLOOR,
  rest,
  rest1x,
  fly: families,
  fly22: families22,
  FORM_BOXES,
  MAIN_TASTES, MOUTH_CATA, OLF_CAP, TASTE_CAP, MOUTH_CAP,
}
const path = new URL('./wheel-data.json', import.meta.url).pathname
writeFileSync(path, JSON.stringify(out))
console.log('wrote', path, 'nodes', nodes.length)
console.log('rest col', rest.col.transform, 'labels', rest.col.visible.length, 'fs', rest.col.fs)
console.log('rest exp', rest.exp.transform, 'labels', rest.exp.visible.length)
const famKeys = NODES.filter((n) => n.ring === 1).map((n) => n.path.join('>'))
const famsAt = (st: ReturnType<typeof state>) => famKeys.filter((k) => st.visible.includes(k)).length
console.log(`FAMILY NAMES legible at rest: ${famsAt(rest1x.col)}/9 as built (1×)  ->  ${famsAt(rest.col)}/9 proposed (${REST_ZOOM}×)`)
for (const [k, v] of Object.entries(families)) {
  const f22 = families22[k]
  console.log(k.padEnd(18), 'fit', String(v.col.scale).padStart(5), `labels ${String(v.col.visible.length).padStart(3)}`,
              '| floored', String(f22.col.scale).padStart(5), `labels ${String(f22.col.visible.length).padStart(3)}`)
}
