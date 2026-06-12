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
          const famLabels = NODES.map((n, i) => [n, i] as const)
            .filter(([n]) => n.family === fam.n)
            .sort(([a], [b]) => poppedLast(a, b))   // popped label paints last, like the prototype's re-append
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
