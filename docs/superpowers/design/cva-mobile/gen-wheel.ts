// Emits the wheel's geometry + the phone camera states using the PRODUCTION
// functions, so the mockup's framing is what the app would actually do.
import { writeFileSync } from 'node:fs'
import { NODES, WHEEL, CX, CY, VIEW, R0, R1, R3, arcPathD, cataForPick, CATA_BOXES, MAIN_TASTES, MOUTH_CATA, OLF_CAP, TASTE_CAP, MOUTH_CAP } from '@/lib/cva/flavor-wheel-data'
import { PALETTE } from '@/components/cupping/cva/wheel/palette'
import { LABELS, splitLabel } from '@/components/cupping/cva/wheel/labels'
import { WEDGE_GAP } from '@/components/cupping/cva/wheel/WheelScene'
import { ringFontSizes, labelPx, estimateWidth, arcLengthPx, MIN_ARC_PX } from '@/components/cupping/cva/wheel/labels'
import { flyToNode, clampCamera, restCamera, cameraTransform, pxPerUnit, MAX_SCALE_MOBILE, type Camera, type Viewport } from '@/components/cupping/cva/wheel/camera'

// Phone stage: 390 wide; 844 − 54 (status/safe top) − 52 (overlay bar) = 738 tall.
const W = 390, H = 738
// Bottom inset = the band the descriptors sheet covers, measured from the stage bottom.
const INSET_COLLAPSED = 52 + 34        // 52 px sheet row + 34 px home-indicator safe area
const INSET_EXPANDED = 300 + 34        // expanded sheet (≈300 px) + safe area
const ZOOM_FLOOR = 2.2                 // DECIDED (Daniel 2026-09-04): never frame a family below this on a phone

/**
 * DECIDED (Daniel 2026-09-04): the phone wheel does not rest at 1×.
 *
 * At scale 1 on a 390 px phone the family ring is 42.5 px deep, and at the 11 px
 * label floor only OTHER and SWEET fit it — a cupper sees 2 of 9 family names,
 * which are the first thing they must tap. No label-geometry fix reaches nine:
 * arc labels for every family fit only 3, and widening R0/R1 would move the PDF
 * certificate wheel too. Zooming does reach nine — 1.66× is where the last name
 * (GREEN/VEGETATIVE, split at the slash) clears the floor. We rest at 1.7×.
 *
 * The wheel is then ~650 px across in a 390 px viewport, so it is cropped by
 * design and the thumbstick becomes the primary navigation: push up to bring the
 * top families into view, right to travel right. That is already exactly what
 * Thumbstick reports and FlavorWheel's rAF loop applies — no new control.
 */
const REST_ZOOM = 1.7
const restProposed = (): Camera => ({ ...restCamera(), scale: REST_ZOOM })

const vp = (insetBottom: number): Viewport => ({ width: W, height: H, insetBottom })

const r3 = (v: number) => Math.round(v * 1000) / 1000

const nodes = NODES.map((n, idx) => {
  const mid = (n.a0 + n.a1) / 2, rDot = n.r1 - 5
  const pal = PALETTE.get(n.path.join('>'))!
  const g = LABELS[idx]
  // The two arc-labelled families (textPath) get the ordinary radial treatment in
  // the mockup — same rule the other seven families use (ring-1 conf, split at the slash).
  const radialFallback = (() => {
    const r = R0 + 8
    let deg = (mid * 180) / Math.PI
    let anchor: 'start' | 'end' = 'start'
    if (deg > 90 && deg < 270) { deg += 180; anchor = 'end' }
    return { kind: 'radial', x: r3(CX + Math.cos(mid) * r), y: r3(CY + Math.sin(mid) * r), deg: r3(deg), anchor, weight: 800, lines: splitLabel(n.name.toUpperCase(), 10) }
  })()
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
    label: g.kind === 'arc'
      ? radialFallback
      : { kind: 'radial', x: r3(g.x), y: r3(g.y), deg: r3(g.deg), anchor: g.anchor, weight: g.weight, lines: g.lines },
  }
})

/**
 * Label visibility under the PROPOSED rule. Identical to production
 * `visibleLabelKeys` except for one thing: every family is measured as a RADIAL
 * split label, because the mockup draws them that way (see `radialFallback`).
 *
 * Production still special-cases Green/Vegetative and Sour/Fermented as arc
 * (textPath) labels via ARC_FAMS, and that is exactly what keeps them dark: at
 * the family radius their arc is 46 px while the names need 85 and 97 px, so
 * they never appear at any zoom. Split at the slash and measured radially they
 * clear the floor at 1.52× and 1.66×. Dropping ARC_FAMS is therefore part of the
 * proposal — it removes a special case rather than adding one.
 *
 * `widthAt10` is not exported, but in Node the production path falls back to
 * `estimateWidth` anyway (LABEL_WIDTHS is only filled by a browser canvas), so
 * this measures the same way production does when it runs here.
 */
function proposedVisibleLabelKeys(v: Viewport, scale: number): Set<string> {
  const out = new Set<string>()
  const k = pxPerUnit(v) * scale
  for (const n of NODES) {
    if (arcLengthPx(n, v, scale) < MIN_ARC_PX) continue
    const base = n.ring === 1 ? 7 : n.ring === 2 || n.ring === 2.5 ? 5.6 : 4.9
    const max = n.ring === 1 ? 10 : n.ring === 2 ? 11 : 22
    const px = labelPx(base, k, scale)
    const lines = splitLabel(n.ring === 1 ? n.name.toUpperCase() : n.name, max)
    const widest = Math.max(...lines.map((t) => estimateWidth(t))) * (px / 10)
    if (widest <= (n.r1 - n.r0) * k - 10) out.add(n.path.join('>'))
  }
  return out
}

function state(cam: ReturnType<typeof restCamera>, v: Viewport) {
  const fs = ringFontSizes(v, cam.scale)
  return {
    cam,
    transform: cameraTransform(cam, v),
    scale: r3(cam.scale),
    fs: { r1: r3(fs.r1), r2: r3(fs.r2), r3: r3(fs.r3) },
    visible: [...proposedVisibleLabelKeys(v, cam.scale)],
  }
}

// `rest` is the DECIDED state (1.7×). `rest1x` is what ships today, kept only so
// the artboard's chip can show the before/after.
const rest = {
  col: state(clampCamera(restProposed(), vp(INSET_COLLAPSED)), vp(INSET_COLLAPSED)),
  exp: state(clampCamera(restProposed(), vp(INSET_EXPANDED)), vp(INSET_EXPANDED)),
}
const rest1x = {
  col: state(clampCamera(restCamera(), vp(INSET_COLLAPSED)), vp(INSET_COLLAPSED)),
  exp: state(clampCamera(restCamera(), vp(INSET_EXPANDED)), vp(INSET_EXPANDED)),
}

const families: Record<string, { col: ReturnType<typeof state>; exp: ReturnType<typeof state> }> = {}
const families22: Record<string, { col: ReturnType<typeof state>; exp: ReturnType<typeof state> }> = {}
// flyToNode with a scale floor: same centroid + lift maths as production, scale = max(fit, floor)
function flyFloored(node: (typeof NODES)[number], v: Viewport, floor: number) {
  const fit = flyToNode(node, v, MAX_SCALE_MOBILE)
  const scale = Math.max(fit.scale, floor)
  const mid = (node.a0 + node.a1) / 2
  const rMid = (node.r0 + R3) / 2
  const f = Math.min(v.width, v.height) / VIEW
  const lift = (v.insetBottom ?? 0) / (2 * f * scale)
  return clampCamera({ x: CX + Math.cos(mid) * rMid, y: CY + Math.sin(mid) * rMid + lift, scale }, v)
}
for (const f of WHEEL) {
  const node = NODES.find((n) => n.ring === 1 && n.name === f.n)!
  families[f.n] = {
    col: state(flyToNode(node, vp(INSET_COLLAPSED), MAX_SCALE_MOBILE), vp(INSET_COLLAPSED)),
    exp: state(flyToNode(node, vp(INSET_EXPANDED), MAX_SCALE_MOBILE), vp(INSET_EXPANDED)),
  }
  families22[f.n] = {
    col: state(flyFloored(node, vp(INSET_COLLAPSED), ZOOM_FLOOR), vp(INSET_COLLAPSED)),
    exp: state(flyFloored(node, vp(INSET_EXPANDED), ZOOM_FLOOR), vp(INSET_EXPANDED)),
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
