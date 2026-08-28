/**
 * The SCA Coffee Taster's Flavor Wheel, printed on a specialty certificate
 * with the cupper's own picks highlighted.
 *
 * Drawn from the SAME geometry and colours as the interactive wheel the cupper
 * clicked — `NODES` and `arcPathD` in flavor-wheel-data.ts — so the printed
 * wheel cannot drift from the one in the app. Every wedge is drawn: the picked
 * ones in their true colour, the rest washed out toward white. That contrast is
 * the whole point, and it is why the unpicked wedges are kept rather than
 * dropped: a reader sees the coffee's character as a shape against the full
 * taxonomy, not a handful of floating slices.
 *
 * No labels. Even at this size, 110 leaf names would be unreadable and would
 * turn the wheel into grey noise; the picked terms are printed as text in a
 * full-width band beneath the whole cupping block instead.
 */

import React from 'react'
import { Svg, Path } from '@react-pdf/renderer'
import { NODES, VIEW, arcPathD } from '@/lib/cva/flavor-wheel-data'

/** How far an unpicked wedge is washed toward white. 0 = full colour, 1 = white. */
const WASH = 0.86
/** Hairline gap between wedges, in radians — the same trick the interactive wheel uses. */
const GAP = 0.004

/**
 * Blend a hex colour toward white.
 *
 * Done by mixing rather than with `opacity`, so the result is a plain solid
 * fill: opacity composites against whatever is behind it, which in a PDF is not
 * guaranteed to be the white page (a viewer's dark mode, a printed background),
 * and the wash would then read as a different colour than intended.
 */
export function washOut(hex: string, amount = WASH): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#f2f2f2'
  const n = parseInt(m[1], 16)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Which wedges light up, as `path.join('>')` keys.
 *
 * A pick lights its whole lineage outward from the hub: picking
 * ["Nutty/Cocoa","Cocoa","Chocolate"] highlights the Nutty/Cocoa family, the
 * Cocoa subcategory and the Chocolate leaf, so the wedge reads as one radial
 * band. A pick that stopped at an inner ring lights only as far as it went —
 * ["Sweet","Brown Sugar"] must NOT light the four leaves beneath Brown Sugar,
 * which the cupper did not choose.
 */
export function highlightedKeys(paths: string[][]): Set<string> {
  const keys = new Set<string>()
  for (const path of paths ?? []) {
    if (!Array.isArray(path)) continue
    for (let i = 1; i <= path.length; i++) {
      keys.add(path.slice(0, i).join('>'))
    }
  }
  return keys
}

export interface CertificateFlavorWheelProps {
  /** Full picked paths — see CvaDescriptorGroups.paths. */
  paths: string[][]
  /**
   * Rendered size in points, square.
   *
   * 160 is the largest that keeps a specialty certificate on ONE page, measured
   * with the real Inter (the vitest font shim serves Noto and cannot judge fit).
   * Width is not the limit — the column has ~236pt free, being 535pt of content
   * less the ~299pt the attributes chart and its separator take. HEIGHT is: at
   * 176 and above, a lot that fills all four descriptor groups wraps the band
   * below onto a second line and pushes the certificate onto a second page, and
   * four groups is the heaviest load seen in production. Raising this without
   * re-measuring that four-group case silently costs a page.
   */
  size?: number
}

export function CertificateFlavorWheel({ paths, size = 160 }: CertificateFlavorWheelProps) {
  const lit = highlightedKeys(paths)
  if (lit.size === 0) return null

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      {NODES.map((node) => {
        const key = node.path.join('>')
        const on = lit.has(key)
        return (
          <Path
            key={key}
            d={arcPathD(node.r0, node.r1, node.a0 + GAP, node.a1 - GAP)}
            fill={on ? node.color : washOut(node.color)}
          />
        )
      })}
    </Svg>
  )
}
