// Build-time colour work for the wheel. Everything here runs ONCE at module
// load; nothing in the render or frame path does colour maths.
import { NODES } from '@/lib/cva/flavor-wheel-data'

/** The warm-dark ground the wheel sits on (spec: Visual treatment). */
export const SURFACE = '#2E2E29'
const LABEL_LIGHT = '#ffffff'
const LABEL_DARK = '#000000'

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
