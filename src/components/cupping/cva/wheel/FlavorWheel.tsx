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
//
// PERF (2026-06-12 audit): all geometry (path d, keys, label geo) is built once
// at module scope; each family renders through a memoized <Branch> so a hover
// crossing re-renders 2 of 9 branches instead of the whole 600-element tree.
// Shadows/frost are pre-blurred copies crossfaded by opacity — `filter` is
// never transitioned (see the .cva-wheel-* block in globals.css).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CX, CY, R0, R1, R2, R3, VIEW, NODES, WHEEL, nodeAt, pickKey,
  type WheelNode,
} from '@/lib/cva/flavor-wheel-data'
import { DEPTHS, REST_S, planDwell, type ZoomState, type HoverSample } from './zoom-machine'
import type { WheelPick } from '@/types/cva'

interface Props {
  picks: WheelPick[]
  onToggle: (pick: WheelPick) => void
  /** false while the (kept-mounted) overlay is hidden — springs the wheel to rest. */
  active?: boolean
}

const GAP = 0.0028
const ARC_FAMS = new Set(['Green/Vegetative', 'Sour/Fermented'])

const FAM_SPANS = new Map(
  NODES.filter((n) => n.ring === 1).map((n) => [n.family, { a0: n.a0, a1: n.a1 }]),
)
const FAM_ORDER = WHEEL.map((f) => f.n)
/** The two families flanking `fam` in the (circular) wheel order. */
function neighbours(fam: string | null): Set<string> {
  if (!fam) return new Set()
  const i = FAM_ORDER.indexOf(fam)
  if (i < 0) return new Set()
  const n = FAM_ORDER.length
  return new Set([FAM_ORDER[(i - 1 + n) % n], FAM_ORDER[(i + 1) % n]])
}

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

/* ---------- static per-node render records + per-family partitions ----------
   Everything here is pure geometry, so it is computed exactly once at module
   load instead of on every render (was ~2k filter calls + 110 path strings +
   hundreds of Array.joins per hover frame). */

interface NodeRec {
  nd: WheelNode
  key: string      // path.join('>') — pick identity
  aria: string     // path.join(' / ') — wedge button label
  d: string        // arc path
  geo: LabelGeo
}
interface FamGroup {
  name: string
  recs: NodeRec[]      // original NODES order — label paint order
  inner: NodeRec[]     // rings 1 / 2 / 2.5
  outer: NodeRec[]     // ring 3 (leaf annulus — frost + sharp copies)
  shadowD: string      // full family sector, silhouette for the shadow presets
}

const FAM_GROUPS: FamGroup[] = WHEEL.map((f) => {
  const recs = NODES
    .map((n, i): NodeRec => ({
      nd: n,
      key: n.path.join('>'),
      aria: n.path.join(' / '),
      d: arcPathD(n.r0, n.r1, n.a0 + GAP, n.a1 - GAP),
      geo: LABELS[i],
    }))
    .filter((r) => r.nd.family === f.n)
  const span = FAM_SPANS.get(f.n)!
  return {
    name: f.n,
    recs,
    inner: recs.filter((r) => r.nd.ring !== 3),
    outer: recs.filter((r) => r.nd.ring === 3),
    shadowD: arcPathD(R0, R3, span.a0 + GAP, span.a1 - GAP),
  }
})

const KEY_FAM = new Map(NODES.map((n) => [n.path.join('>'), n.family]))

/** popped-paints-last without sorting — same z-order as the prototype's
    re-append (stable order otherwise); O(n) and only runs in the owning family. */
function reorder(arr: NodeRec[], poppedKey: string | null): NodeRec[] {
  if (!poppedKey) return arr
  const i = arr.findIndex((r) => r.key === poppedKey)
  return i < 0 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1), arr[i]]
}

/* ---------- per-family branch (memoized) ---------- */

interface BranchProps {
  group: FamGroup
  cls: string                                   // cva-wheel-branch + zoom/hover state
  w3state: '' | 'is-clear' | 'is-semiclear'
  poppedKey: string | null                      // non-null only when popped is ours
  pickedSig: string                             // '|'-joined picked keys in this family
  showLeaf: boolean
  leafReady: boolean
  onWedge: (nd: WheelNode) => void
}

const Branch = memo(function Branch({ group, cls, w3state, poppedKey, pickedSig, showLeaf, leafReady, onWedge }: BranchProps) {
  const picked = useMemo(() => new Set(pickedSig ? pickedSig.split('|') : []), [pickedSig])
  const w3cls = w3state ? ` ${w3state}` : ''

  const renderWedge = (r: NodeRec) => (
    <g
      key={r.key}
      role="button"
      aria-label={r.aria}
      className={`cva-wheel-wedge${picked.has(r.key) ? ' is-picked' : ''}${poppedKey === r.key ? ' is-popped' : ''}`}
      onClick={(e) => { e.stopPropagation(); onWedge(r.nd) }}
    >
      <path d={r.d} fill={r.nd.color} />
    </g>
  )

  const renderLabel = (r: NodeRec) => {
    const g = r.geo
    const l3 = r.nd.ring === 3
    if (l3 && !leafReady) return null
    const wrapCls = `cva-wheel-lw${poppedKey === r.key ? ' is-popped' : ''}`
    const txtCls = `cva-wheel-label${l3 ? ` cva-l3${showLeaf ? ' is-visible' : ''}` : ''}`
    if (g.kind === 'arc') {
      return (
        <g key={r.key} className={wrapCls}>
          <path id={g.pid} d={g.pathD} fill="none" />
          <text className={txtCls} fontSize={g.size} fontWeight={800} fill={g.fill}>
            <textPath href={`#${g.pid}`} startOffset="50%" textAnchor="middle">{g.text}</textPath>
          </text>
        </g>
      )
    }
    return (
      <g key={r.key} className={wrapCls}>
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
    <g className={cls}>
      {/* pre-blurred shadow silhouettes, crossfaded by the .cva-wheel-bsh rules */}
      <path className="cva-wheel-bsh cva-wheel-bsh--hot" d={group.shadowD} fill="#000" filter="url(#cva-sh-hot)" pointerEvents="none" />
      <path className="cva-wheel-bsh cva-wheel-bsh--focused" d={group.shadowD} fill="#000" filter="url(#cva-sh-focused)" pointerEvents="none" />
      <path className="cva-wheel-bsh cva-wheel-bsh--mid" d={group.shadowD} fill="#000" filter="url(#cva-sh-mid)" pointerEvents="none" />
      <g>{reorder(group.inner, poppedKey).map(renderWedge)}</g>
      {/* static frost copy — its blur never animates; the sharp interactive ring
          below crossfades over it. No role/aria: stays out of the a11y tree. */}
      <g className={`cva-wheel-w3-frost${w3cls}`} aria-hidden pointerEvents="none">
        {group.outer.map((r) => (
          <g key={r.key} className={`cva-wheel-wedge${picked.has(r.key) ? ' is-picked' : ''}`}>
            <path d={r.d} fill={r.nd.color} />
          </g>
        ))}
      </g>
      <g className={`cva-wheel-w3${w3cls}`}>
        {reorder(group.outer, poppedKey).map(renderWedge)}
      </g>
      <g pointerEvents="none">{reorder(group.recs, poppedKey).map(renderLabel)}</g>
    </g>
  )
})

/* ---------- component ---------- */

export const FlavorWheel = memo(function FlavorWheel({ picks, onToggle, active = true }: Props) {
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
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  // The ~73 ring-3 leaf labels are invisible until a family is focused (190ms
  // dwell minimum) — defer their DOM by one commit so first mount paints sooner.
  const [leafReady, setLeafReady] = useState(false)
  useEffect(() => { setLeafReady(true) }, [])

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

  // Hidden (kept-mounted) overlay: spring back to rest so reopening starts clean
  // and the document Esc listener below becomes a no-op.
  useEffect(() => {
    if (!active) applyZoom({ mode: 'rest', fam: null })
  }, [active, applyZoom])

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

  // Stable across renders (reads zoom/onToggle through refs) so the memoized
  // branches never re-render because of a fresh handler identity.
  const onWedge = useCallback((nd: WheelNode) => {
    const z = zoomRef.current
    if (z.mode === 'full' && nd.family === z.fam) onToggleRef.current({ path: nd.path })
    else applyZoom({ mode: 'full', fam: nd.family })
  }, [applyZoom])

  const adjacent = useMemo(() => neighbours(zoom.fam), [zoom.fam])

  const branchClass = (fam: string) => {
    const cls = ['cva-wheel-branch']
    if (zoom.mode === 'rest') {
      if (hotFam) cls.push(fam === hotFam ? 'is-hot' : 'is-dim')
    } else if (fam === zoom.fam) cls.push('is-focused')
    else if (adjacent.has(fam)) cls.push('is-adjacent')   // keep neighbours readable — continuous flow
    else cls.push(zoom.mode === 'full' ? 'is-faded' : 'is-soft')
    return cls.join(' ')
  }

  const poppedFam = popped ? KEY_FAM.get(popped) ?? null : null

  // Per-family picked-keys signature — a string prop keeps Branch.memo effective
  // (a shared Set would change identity on every pick).
  const pickedSigs = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of picks) {
      const k = pickKey(p)
      const fam = KEY_FAM.get(k)
      if (!fam) continue
      m.set(fam, m.has(fam) ? `${m.get(fam)}|${k}` : k)
    }
    return m
  }, [picks])

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

  // Leaving the wheel entirely springs it back to rest (Daniel: "if the mouse
  // goes outside the wheel, zoom back out").
  const onPointerLeave = () => {
    clearDwell()
    setHotFam(null)
    setPopped(null)
    if (zoomRef.current.mode !== 'rest') applyZoom({ mode: 'rest', fam: null })
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
        <defs>
          {/* Shadow presets matching the old CSS drop-shadows (blur radius ≈
              2×stdDeviation). Explicit userSpaceOnUse regions: the default
              bbox-relative region would clip the blur on narrow families. */}
          <filter id="cva-sh-hot" filterUnits="userSpaceOnUse" x="-40" y="-40" width="520" height="520" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="7" />
            <feOffset dy="6" />
            <feComponentTransfer><feFuncA type="linear" slope="0.30" /></feComponentTransfer>
          </filter>
          <filter id="cva-sh-focused" filterUnits="userSpaceOnUse" x="-40" y="-40" width="520" height="520" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="9" />
            <feOffset dy="4" />
            <feComponentTransfer><feFuncA type="linear" slope="0.28" /></feComponentTransfer>
          </filter>
          <filter id="cva-sh-mid" filterUnits="userSpaceOnUse" x="-40" y="-40" width="520" height="520" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="7" />
            <feOffset dy="4" />
            <feComponentTransfer><feFuncA type="linear" slope="0.22" /></feComponentTransfer>
          </filter>
        </defs>
        {FAM_GROUPS.map((g) => (
          <Branch
            key={g.name}
            group={g}
            cls={branchClass(g.name)}
            w3state={hotFam === g.name || zoom.fam === g.name ? 'is-clear' : adjacent.has(g.name) ? 'is-semiclear' : ''}
            poppedKey={poppedFam === g.name ? popped : null}
            pickedSig={pickedSigs.get(g.name) ?? ''}
            showLeaf={zoom.fam === g.name || adjacent.has(g.name)}
            leafReady={leafReady}
            onWedge={onWedge}
          />
        ))}
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
})
