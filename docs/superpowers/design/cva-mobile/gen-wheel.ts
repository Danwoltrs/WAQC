// Emits the wheel's geometry + the phone camera states using the PRODUCTION
// functions, so the mockup's framing is what the app would actually do.
import { writeFileSync } from 'node:fs'
import { NODES, WHEEL, CX, CY, VIEW, R0, R3, arcPathD, cataForPick, MAIN_TASTES, MOUTH_CATA, OLF_CAP, TASTE_CAP, MOUTH_CAP } from '@/lib/cva/flavor-wheel-data'
import { PALETTE } from '@/components/cupping/cva/wheel/palette'
import { LABELS, splitLabel } from '@/components/cupping/cva/wheel/labels'
import { WEDGE_GAP } from '@/components/cupping/cva/wheel/WheelScene'
import { visibleLabelKeys, ringFontSizes } from '@/components/cupping/cva/wheel/labels'
import { flyToNode, clampCamera, restCamera, cameraTransform, MAX_SCALE_MOBILE, type Viewport } from '@/components/cupping/cva/wheel/camera'

// Phone stage: 390 wide; 844 − 54 (status/safe top) − 52 (overlay bar) = 738 tall.
const W = 390, H = 738
// Bottom inset = the band the descriptors sheet covers, measured from the stage bottom.
const INSET_COLLAPSED = 52 + 44 + 34   // 52 px sheet row + 44 px family rail + 34 px home-indicator safe area
const INSET_EXPANDED = 300 + 34        // expanded sheet (≈300 px) + safe area
const ZOOM_FLOOR = 2.2                 // proposal: never frame a family below this on a phone

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

const rest = {
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

const out = {
  VIEW, CX, CY, W, H, INSET_COLLAPSED, INSET_EXPANDED,
  wheelSize: Math.min(W, H),
  families: WHEEL.map((f) => ({ name: f.n, color: f.c })),
  nodes,
  rest,
  fly: families,
  fly22: families22,
  MAIN_TASTES, MOUTH_CATA, OLF_CAP, TASTE_CAP, MOUTH_CAP,
}
const path = new URL('./wheel-data.json', import.meta.url).pathname
writeFileSync(path, JSON.stringify(out))
console.log('wrote', path, 'nodes', nodes.length)
console.log('rest col', rest.col.transform, 'labels', rest.col.visible.length, 'fs', rest.col.fs)
console.log('rest exp', rest.exp.transform, 'labels', rest.exp.visible.length)
for (const [k, v] of Object.entries(families)) console.log(k.padEnd(18), 'col', v.col.transform.padEnd(48), 'scale', v.col.scale, 'labels', v.col.visible.length, '| exp', v.exp.transform)
