'use client'

// The wheel's static SVG. Rendered once; its geometry never changes. The only
// things that change are CLASSES (picked / hover / keyboard focus) — set through
// props on a selection change — and, from FlavorWheel's settle handler, the
// display of each label and three font-size variables.
//
// The scene deliberately does NOT know which family is framed. Nothing dims when
// one is (Daniel 2026-09-03: "no need to hide the other sides, let them
// visible"), so drilling no longer reconciles these ~600 elements at all — the
// camera moves and the rest of the wheel stays exactly as it was.
//
// No element in here ever carries a transform, a transition or a filter: any of
// those makes Blink lay out the whole subtree every animated frame (Phase 0,
// 2026-09-02).
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

/** DOM id for a wedge's <g>, keyed by its path key — used for aria-activedescendant. */
export const wedgeDomId = (key: string): string => 'wheel-' + key.replace(/[^a-zA-Z0-9]+/g, '-')

export interface WheelSceneProps {
  pickedKeys: ReadonlySet<string>
  focusKey: string | null
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

export const WheelScene = memo(function WheelScene({ pickedKeys, focusKey, onActivate, svgRef }: WheelSceneProps) {
  return (
    <svg ref={svgRef} className="wheel-scene" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-label="Flavour wheel">
      <defs>
        {LABELS.map((g) => g.kind === 'arc' ? <path key={g.pid} id={g.pid} d={g.pathD} fill="none" stroke="none" /> : null)}
      </defs>
      <g className="wheel-arcs" pointerEvents="none">
        {BY_FAMILY.map((f) => (
          <g key={f.name} className="wheel-fam" data-fam={f.name}>
            {f.recs.map((r) => {
              const cls = ['wheel-wedge']
              if (pickedKeys.has(r.key)) cls.push('is-picked')
              if (focusKey === r.key) cls.push('is-focus')
              const pal = PALETTE.get(r.key)!
              return (
                <g key={r.key} id={wedgeDomId(r.key)} className={cls.join(' ')} role="button" tabIndex={-1} aria-label={r.aria} data-key={r.key}
                   style={{ color: pal.fill }}
                   onClick={(e) => { e.stopPropagation(); onActivate(r.node) }}>
                  <path d={r.d} fill={pal.fill} style={{ ['--wheel-fill' as string]: pal.fill }} />
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
