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
 * 2. Exactly one element transforms: the HTML .wheel-camera div, via CSS. No
 *    ANIMATED transform on any SVG element — the static rotate() on radial
 *    labels is geometry. The only transition inside the svg is the 200 ms
 *    opacity cross-fade on .wheel-fam (paint-only).
 * 3. Geometry is computed once at module load (WheelScene, labels, hit index).
 * 4. No filters, ever, inside .wheel-root. Dimming = muted fill + opacity.
 * 5. Zero text measurement at runtime: labels are measured once per mount.
 * 6. Hit testing is math (hit-test.ts). One listener on the root;
 *    pointer-events: none on every arc and label.
 * 7. The idle wheel burns nothing: the loop stops on settle; will-change is
 *    set only while moving.
 * 8. Budget enforced: ?debug=1 HUD; scripts/perf re-takes the numbers.
 *
 * Hover is a white 1.1 px stroke (deliberately not the wedge's own colour,
 * which is the keyboard-focus stroke). Resting a MOUSE on a wedge for 210 ms
 * flies to its family (dwell.ts): one setTimeout, re-armed only when the
 * hovered family changes — never per move, never inside the loop.
 *
 * The descriptors tray covers a band at the bottom of the root; the overlay
 * measures it and passes `insetBottom`. Framing, clamping and the edge band all
 * work against the region ABOVE that band (camera.ts), so a fly to a bottom
 * family lifts the wheel clear of the tray instead of under it.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NODES, CX, CY, R1, R2, OLF_CAP, pickKey, type WheelNode } from '@/lib/cva/flavor-wheel-data'
import type { WheelPick } from '@/types/cva'
import {
  restCamera, cameraTransform, screenToWorld, zoomAt, clampCamera, springStep, isSettled, flyToNode,
  edgePanVelocity, pxPerUnit, MAX_SCALE_DESKTOP, MAX_SCALE_MOBILE, MAX_PAN_SPEED, RUBBER_PX, type Camera, type Viewport,
} from './camera'
import { regionAtScene, nodeAtScene } from './hit-test'
import { planDwell, type DwellPlan } from './dwell'
import { measureLabels, visibleLabelKeys, ringFontSizes } from './labels'
import { PALETTE } from './palette'
import { GestureMachine, type GestureAction } from './gestures'
import { WheelScene, wedgeDomId } from './WheelScene'
import { Thumbstick } from './Thumbstick'
import { DebugHud, pushFrame, type FrameStats } from './DebugHud'

export const COMPACT_MQ = '(max-width: 1023px), (pointer: coarse)'
const REDUCED_MQ = '(prefers-reduced-motion: reduce)'
const STICK_KEY = 'waqc.wheel.stick'
const CLICK_SLOP = 6
const FAMILY_NODE = new Map(NODES.filter((n) => n.ring === 1).map((n) => [n.name, n] as const))

export interface FlavorWheelProps {
  picks: WheelPick[]
  onToggle: (pick: WheelPick) => void
  /** false while the (kept-mounted) overlay is hidden — resets to rest. */
  active?: boolean
  /** Mobile swipe-down from the top band (spec) — the overlay closes itself. */
  onSwipeClose?: () => void
  /** CSS px at the bottom of the root covered by the descriptors tray; the camera frames and clamps against the region above it. */
  insetBottom?: number
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
const ringOf = (r: number): number => (r < R1 ? 1 : r < R2 ? 2 : 3)
const raf = (cb: FrameRequestCallback): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number)
const caf = (id: number) => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id) }

export const FlavorWheel = memo(function FlavorWheel({ picks, onToggle, active = true, onSwipeClose, insetBottom = 0 }: FlavorWheelProps) {
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
  // handleAction is only reachable through tick's memoized closure (deps
  // [applyTransform, onSettle]) — a fresh onSwipeClose from a later render
  // never replaces the one that closure captured at mount. Mirror it into a
  // ref, like onToggleRef above.
  const onSwipeCloseRef = useRef(onSwipeClose); onSwipeCloseRef.current = onSwipeClose

  // ---- per-frame state, all refs ----
  const cam = useRef<{ current: Camera; target: Camera }>({ current: restCamera(), target: restCamera() })
  const vp = useRef<Viewport>({ width: 0, height: 0, insetBottom })
  const els = useRef<Map<string, { wedge: SVGGElement; label: SVGGElement }>>(new Map())
  const pointer = useRef<{ x: number; y: number; inside: boolean; mouse: boolean; downX: number; downY: number; down: boolean }>({ x: 0, y: 0, inside: false, mouse: false, downX: 0, downY: 0, down: false })
  const hoverEl = useRef<SVGGElement | null>(null)
  const stick = useRef({ x: 0, y: 0, m: 0 })
  const knobColorRef = useRef('')
  const gestures = useRef(new GestureMachine(() => performance.now()))
  const pressPending = useRef(false)
  const dwell = useRef<{ key: string | null; timer: ReturnType<typeof setTimeout> | null }>({ key: null, timer: null })
  const loop = useRef<number | null>(null)
  const lastT = useRef(0)
  const lastRing = useRef(0)
  const stats = useRef<FrameStats>({ p95: 0, last: 0, layouts: 0, frames: 0 })
  const ring = useRef<number[]>([])
  const [debug, setDebug] = useState(false)
  const debugRef = useRef(debug); debugRef.current = debug
  useEffect(() => {
    if (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) setDebug(true)
  }, [])

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

  // Label sizing/visibility can be recomputed for the fly TARGET as soon as a fly starts (so the
  // newly focused family's labels appear immediately, per the spec's "recompute on scale
  // crossings") without also flipping data-zoomed / the knob colour early — those must reflect
  // where the camera actually IS, which only onSettle (called once the camera has arrived) does.
  const applyLabels = useCallback((c: Camera) => {
    const v = vp.current
    const svg = svgRef.current
    if (svg) {
      const fs = ringFontSizes(v, c.scale)
      svg.style.setProperty('--wheel-fs-1', `${fs.r1}px`)
      svg.style.setProperty('--wheel-fs-2', `${fs.r2}px`)
      svg.style.setProperty('--wheel-fs-3', `${fs.r3}px`)
    }
    const visible = visibleLabelKeys(v, c.scale, focusFamilyRef.current)
    for (const [key, e] of els.current) e.label.style.display = visible.has(key) ? '' : 'none'
  }, [])

  const onSettle = useCallback((c: Camera = cam.current.current) => {
    applyLabels(c)
    const isZoomed = c.scale > 1.05
    if (rootRef.current) rootRef.current.dataset.zoomed = isZoomed ? '1' : '0'
    setZoomed((z) => (z === isZoomed ? z : isZoomed))
    const under = nodeAtScene(c.x, c.y)
    knobColorRef.current = under ? PALETTE.get(under.path.join('>'))!.fill : ''
    const knob = rootRef.current?.querySelector<HTMLElement>('.wheel-stick-knob')
    if (knob) knob.style.background = knobColorRef.current || ''
  }, [applyLabels])

  /* ---------- the loop ---------- */

  const tick = useCallback((t: number) => {
    const dt = lastT.current ? Math.min(0.05, Math.max(0, (t - lastT.current) / 1000)) : 0
    const frameMs = lastT.current ? t - lastT.current : 0
    lastT.current = t
    const s = cam.current, v = vp.current
    let inputActive = false

    for (const a of gestures.current.tick(t)) handleAction(a)
    if (pressPending.current) inputActive = true

    const before = s.target
    const p = pointer.current
    if (p.inside && p.mouse) {
      const ev = edgePanVelocity(p.x, p.y, v, s.target.scale, reducedRef.current)
      if (ev.vx || ev.vy) {
        // edgePanVelocity is already in scene units / s (and already divided by scale)
        s.target = { ...s.target, x: s.target.x + ev.vx * dt, y: s.target.y + ev.vy * dt }
      }
    }
    if (stick.current.m > 0) {
      const sp = (MAX_PAN_SPEED * stick.current.m) / s.target.scale
      s.target = { ...s.target, x: s.target.x + stick.current.x * sp * dt, y: s.target.y + stick.current.y * sp * dt }
    }
    s.target = clampCamera(s.target, v, inputActive ? RUBBER_PX : 0)
    // A velocity that ran straight into the clamp moved nothing — that must
    // NOT keep the loop spinning (a mouse parked in the edge band, or the
    // stick held at the rim, would burn will-change forever). Only a pending
    // long-press or an actual change in the clamped target counts as input.
    inputActive = pressPending.current || s.target.x !== before.x || s.target.y !== before.y || s.target.scale !== before.scale
    s.current = reducedRef.current ? { ...s.target } : springStep(s.current, s.target, dt)
    applyTransform()

    const r = ringOf(Math.hypot(s.current.x - CX, s.current.y - CY))
    if (r !== lastRing.current) { if (lastRing.current) vibrate(4); lastRing.current = r }
    if (frameMs && debugRef.current) pushFrame(stats.current, ring.current, frameMs)

    if (isSettled(s.current, s.target) && !inputActive) {
      loop.current = null
      lastT.current = 0
      if (cameraRef.current) cameraRef.current.style.willChange = ''
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
    cam.current.target = clampCamera(next, vp.current, RUBBER_PX)
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

  /* ---------- desktop hover dwell (dwell.ts): one timer, re-armed only when the intent changes ---------- */

  const clearDwell = useCallback(() => {
    const d = dwell.current
    if (d.timer != null) clearTimeout(d.timer)
    d.timer = null; d.key = null
  }, [])

  const scheduleDwell = useCallback((plan: DwellPlan | null) => {
    const d = dwell.current
    if ((plan?.key ?? null) === d.key) return   // same intent already counting down — wandering inside one family must not restart the clock
    clearDwell()
    if (!plan) return
    d.key = plan.key
    d.timer = setTimeout(() => {
      d.timer = null; d.key = null
      if (!plan.family) { zoomOut(); return }
      const fam = FAMILY_NODE.get(plan.family)
      if (fam) flyTo(fam)
    }, plan.ms)
  }, [clearDwell, flyTo, zoomOut])

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
      case 'tap': pressPending.current = false; setPressRing(null, null, 0); tapAt(a.x, a.y); break
      case 'double-tap': pressPending.current = false; setPressRing(null, null, 0); zoomOut(); break
      case 'long-press': {
        pressPending.current = false; setPressRing(null, null, 0); vibrate(8)
        const w = screenToWorld(a.x, a.y, s.current, v)
        const node = nodeAtScene(w.x, w.y)
        if (node) {
          setFocusFamily(node.family); focusFamilyRef.current = node.family
          setTarget(flyToNode(node, v, maxScaleRef.current))
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
      case 'swipe-down': onSwipeCloseRef.current?.(); break
    }
  }

  /* ---------- layout (once per resize) ---------- */

  const measure = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const w = root.clientWidth || root.getBoundingClientRect().width
    const h = root.clientHeight || root.getBoundingClientRect().height
    if (!w || !h) return   // kept-mounted overlay is display:none — ResizeObserver reports 0×0
    vp.current = { ...vp.current, width: w, height: h }
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
  // Uses the fly TARGET (not the pre-fly current camera) so the newly focused family's
  // labels appear as the fly starts, per the spec's "recompute on scale crossings" — but only
  // the label pass, not data-zoomed/the knob colour, which must track where the camera IS.
  useEffect(() => { applyLabels(cam.current.target) }, [focusFamily, applyLabels])

  useEffect(() => {
    try { setStickOn(localStorage.getItem(STICK_KEY) !== 'off') } catch { /* keep default */ }
  }, [])

  // The tray band changed (chips, the toast, the phone tray toggling): re-clamp against the
  // new visible region. Rest re-derives from the wheel centre so a phone wheel re-centres in
  // the clear area whether the band grew or shrank; a zoomed camera moves only if the new
  // bound demands it (the fly that framed it already used the band at the time).
  useEffect(() => {
    vp.current = { ...vp.current, insetBottom }
    if (!vp.current.width || !vp.current.height) return
    const t = cam.current.target
    const next = clampCamera(t.scale <= 1.001 ? restCamera() : t, vp.current, 0)
    if (next.x !== t.x || next.y !== t.y) { cam.current.target = next; startLoop() }
  }, [insetBottom, startLoop])

  useEffect(() => {
    if (active) return
    setFocusFamily(null); focusFamilyRef.current = null; setFocusKey(null)
    clearDwell()
    if (loop.current != null) { caf(loop.current); loop.current = null }
    if (cameraRef.current) cameraRef.current.style.willChange = ''
    const rest = clampCamera(restCamera(), vp.current, 0)
    cam.current = { current: rest, target: rest }
    gestures.current.reset()
    pressPending.current = false; setPressRing(null, null, 0)
    stick.current = { x: 0, y: 0, m: 0 }
    pointer.current = { ...pointer.current, inside: false, down: false }
    applyTransform(); onSettle()
  }, [active, applyTransform, onSettle, clearDwell])

  useEffect(() => () => { if (loop.current != null) caf(loop.current); clearDwell() }, [clearDwell])

  // Esc: consumed only while something is focused/zoomed, so the overlay's own Esc-to-close still works at rest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (focusFamilyRef.current || cam.current.current.scale > 1.05) { e.preventDefault(); zoomOut() }
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
  // Overlay controls (back/home/counter/thumbstick/debug HUD) live INSIDE .wheel-root so they can
  // sit above the camera, but they are real interactive DOM (buttons, the stick) — the wheel's own
  // hit-test/hover/gesture handling must never fire for pointer events that originate there.
  const inOverlay = (e: React.PointerEvent): boolean => !!(e.target as Element).closest?.('.wheel-overlay')
  // Note: getBoundingClientRect here runs per pointer EVENT, outside the animation frame, on a
  // root that never changes layout during motion — Chrome serves it from the clean layout tree.
  // The Phase 0 forced layouts came from reading the TRANSFORMING svg during a transition.

  const onPointerDown = (e: React.PointerEvent) => {
    clearDwell()   // a press is a deliberate intent; whatever the hover was counting toward is void
    if (inOverlay(e)) return
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
    if (inOverlay(e)) { clearDwell(); return }   // parked on a button: the last wedge's dwell must not fire underneath it
    const { x, y } = localXY(e)
    if (e.pointerType === 'touch') {
      for (const a of gestures.current.feed({ type: 'move', id: e.pointerId, x, y, t: performance.now() })) handleAction(a)
      return
    }
    const p = pointer.current
    p.x = x; p.y = y; p.inside = true; p.mouse = true
    // hover: direct DOM only
    const w = screenToWorld(x, y, cam.current.current, vp.current)
    const reg = regionAtScene(w.x, w.y)
    const node = reg.kind === 'node' ? reg.node : null
    const el = node ? els.current.get(node.path.join('>'))?.wedge ?? null : null
    if (el !== hoverEl.current) {
      hoverEl.current?.classList.remove('is-hover')
      el?.classList.add('is-hover')
      hoverEl.current = el
      if (rootRef.current) rootRef.current.style.cursor = node && node.family === focusFamilyRef.current ? 'pointer' : 'default'
    }
    scheduleDwell(planDwell(focusFamilyRef.current, reg))
    if (cam.current.target.scale > 1.05 && !reducedRef.current) startLoop()   // edge pan runs in the loop
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (inOverlay(e)) return
    const { x, y } = localXY(e)
    if (e.pointerType === 'touch') {
      const actions = gestures.current.feed({ type: 'up', id: e.pointerId, x, y, t: performance.now() })
      for (const a of actions) handleAction(a)
      // A clean tap (no move, released before the long-press threshold) only ever emits 'tap':
      // nothing else tells the press ring / pressPending to clear, so without this the rAF loop
      // would spin forever (inputActive stays true, isSettled never wins) — 'long-press' already
      // clears both itself.
      if (!actions.some((a) => a.kind === 'long-press')) { pressPending.current = false; setPressRing(null, null, 0) }
      return
    }
    const p = pointer.current
    if (p.down && Math.hypot(x - p.downX, y - p.downY) <= CLICK_SLOP) tapAt(x, y)
    p.down = false
  }
  const onPointerCancel = (e: React.PointerEvent) => {
    if (inOverlay(e)) return
    if (e.pointerType === 'touch') {
      const actions = gestures.current.feed({ type: 'cancel', id: e.pointerId, x: 0, y: 0, t: performance.now() })
      for (const a of actions) handleAction(a)
      if (!actions.some((a) => a.kind === 'long-press')) { pressPending.current = false; setPressRing(null, null, 0) }
    }
    pointer.current.down = false
  }
  const onPointerLeave = () => {
    clearDwell()
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
      data-inset={insetBottom}
      tabIndex={0}
      role="application"
      aria-label="Flavour wheel. Arrow keys move, Enter picks, Escape zooms out."
      aria-activedescendant={focusKey ? wedgeDomId(focusKey) : undefined}
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
