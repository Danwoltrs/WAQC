'use client'

// Game-style analog stick for one-thumb panning on touch devices (spec: Mobile
// interactions). It never moves the camera itself: it reports a vector, and
// FlavorWheel's rAF loop turns that into camera velocity. Drag the KNOB to pan;
// drag the WELL to relocate it — on release it springs to whichever side of
// the screen midline it was let go on, remembered per device.

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPE } from 'react'

export const STICK_WELL = 112
export const STICK_KNOB = 48
export const STICK_DEADZONE = 0.14
export const STICK_IDLE_MS = 2500
export const STICK_SIDE_KEY = 'waqc.wheel.stickSide'

export function stickVector(dx: number, dy: number, radius: number): { x: number; y: number; m: number } {
  const d = Math.hypot(dx, dy)
  const n = Math.min(1, d / radius)
  if (n <= STICK_DEADZONE || d === 0) return { x: 0, y: 0, m: 0 }
  const after = (n - STICK_DEADZONE) / (1 - STICK_DEADZONE)
  return { x: dx / d, y: dy / d, m: after * after }
}

export function readStickSide(): 'left' | 'right' {
  try { return localStorage.getItem(STICK_SIDE_KEY) === 'left' ? 'left' : 'right' } catch { return 'right' }
}
export function writeStickSide(side: 'left' | 'right'): void {
  try { localStorage.setItem(STICK_SIDE_KEY, side) } catch { /* private mode etc. */ }
}

export interface ThumbstickProps {
  onVector: (v: { x: number; y: number; m: number }) => void
  /** Current family colour under the viewport centre; FlavorWheel keeps it fresh. */
  knobColorRef: MutableRefObject<string>
  onAnyTouch?: () => void
}

export function Thumbstick({ onVector, knobColorRef, onAnyTouch }: ThumbstickProps) {
  const wellRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [idle, setIdle] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const knobPointer = useRef<number | null>(null)
  const wellPointer = useRef<{ id: number; sx: number; sy: number } | null>(null)

  useEffect(() => { setSide(readStickSide()) }, [])

  const armIdle = useCallback(() => {
    setIdle(false)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), STICK_IDLE_MS)
  }, [])
  useEffect(() => {
    armIdle()
    const wake = () => { armIdle(); onAnyTouch?.() }
    document.addEventListener('pointerdown', wake, { passive: true })
    return () => { document.removeEventListener('pointerdown', wake); if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [armIdle, onAnyTouch])

  const centre = () => {
    const r = wellRef.current!.getBoundingClientRect()   // on pointerdown only — never per frame
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: r.width / 2 }
  }
  const origin = useRef({ x: 0, y: 0, radius: STICK_WELL / 2 })

  const onKnobDown = (e: RPE) => {
    armIdle()
    onAnyTouch?.()
    e.stopPropagation()
    knobPointer.current = e.pointerId
    origin.current = centre()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onKnobMove = (e: RPE) => {
    if (knobPointer.current !== e.pointerId) return
    const o = origin.current
    const dx = e.clientX - o.x, dy = e.clientY - o.y
    const lim = o.radius - STICK_KNOB / 2
    const d = Math.hypot(dx, dy) || 1
    const k = Math.min(1, lim / d)
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`
    onVector(stickVector(dx, dy, lim))
  }
  const onKnobUp = (e: RPE) => {
    if (knobPointer.current !== e.pointerId) return
    knobPointer.current = null
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    onVector({ x: 0, y: 0, m: 0 })
  }

  const onWellDown = (e: RPE) => {
    armIdle()
    onAnyTouch?.()
    wellPointer.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onWellMove = (e: RPE) => {
    const w = wellPointer.current
    if (!w || w.id !== e.pointerId) return
    setDragOffset({ x: e.clientX - w.sx, y: e.clientY - w.sy })
  }
  const onWellUp = (e: RPE) => {
    const w = wellPointer.current
    if (!w || w.id !== e.pointerId) return
    wellPointer.current = null
    const next: 'left' | 'right' = e.clientX < window.innerWidth / 2 ? 'left' : 'right'
    setDragOffset(null)
    setSide(next); writeStickSide(next)
  }

  return (
    <div
      ref={wellRef}
      className="wheel-stick"
      data-side={side}
      data-idle={idle ? '1' : '0'}
      style={dragOffset ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, transition: 'none' } : undefined}
      onPointerDown={onWellDown} onPointerMove={onWellMove} onPointerUp={onWellUp} onPointerCancel={onWellUp}
      aria-label="Pan the wheel with your thumb"
      role="group"
    >
      <div
        ref={knobRef}
        className="wheel-stick-knob"
        style={{ background: knobColorRef.current || undefined }}
        onPointerDown={onKnobDown} onPointerMove={onKnobMove} onPointerUp={onKnobUp} onPointerCancel={onKnobUp}
      />
    </div>
  )
}
