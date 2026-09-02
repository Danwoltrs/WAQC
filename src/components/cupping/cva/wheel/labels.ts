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
