import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { createRef } from 'react'
import { Thumbstick, stickVector, readStickSide, writeStickSide, STICK_SIDE_KEY, STICK_DEADZONE } from './Thumbstick'

/** jsdom's PointerEvent support is patchy: build a MouseEvent of the pointer type and pin the pointer fields on it. */
function pev(el: Element, type: string, init: { clientX: number; clientY: number; pointerId?: number }) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX, clientY: init.clientY, button: 0 })
  Object.defineProperty(ev, 'pointerType', { value: 'touch' })
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 })
  act(() => { el.dispatchEvent(ev) })
}

describe('stickVector', () => {
  it('returns zero inside the deadzone', () => {
    expect(stickVector(3, -3, 56)).toEqual({ x: 0, y: 0, m: 0 })
    expect(stickVector(56 * STICK_DEADZONE * 0.99, 0, 56).m).toBe(0)
  })
  it('squares the magnitude and keeps the raw direction', () => {
    const half = stickVector(28, 0, 56)     // halfway out
    const full = stickVector(56, 0, 56)
    expect(full.m).toBeCloseTo(1, 6); expect(full.x).toBeCloseTo(1, 6); expect(full.y).toBe(0)
    expect(half.m).toBeGreaterThan(0); expect(half.m).toBeLessThan(0.5)   // (0.42)^2 ≈ 0.17 after deadzone
    const diag = stickVector(40, 40, 56)
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 6)
    expect(diag.x).toBeCloseTo(diag.y, 6)
  })
  it('clamps beyond the rim', () => {
    expect(stickVector(500, 0, 56).m).toBeCloseTo(1, 6)
  })
})

describe('side persistence', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to right, remembers left', () => {
    expect(readStickSide()).toBe('right')
    writeStickSide('left')
    expect(localStorage.getItem(STICK_SIDE_KEY)).toBe('left')
    expect(readStickSide()).toBe('left')
  })
})

describe('<Thumbstick>', () => {
  beforeEach(() => localStorage.clear())

  it('dragging the knob emits vectors and releasing emits zero', () => {
    const onVector = vi.fn()
    const { container } = render(<Thumbstick onVector={onVector} knobColorRef={createRef<string>() as any} />)
    const knob = container.querySelector('.wheel-stick-knob')!
    vi.spyOn(container.querySelector('.wheel-stick')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 112, height: 112, right: 112, bottom: 112, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    pev(knob, 'pointerdown', { pointerId: 1, clientX: 56, clientY: 56 })
    pev(knob, 'pointermove', { pointerId: 1, clientX: 112, clientY: 56 })
    expect(onVector).toHaveBeenLastCalledWith({ x: 1, y: 0, m: 1 })
    pev(knob, 'pointerup', { pointerId: 1, clientX: 112, clientY: 56 })
    expect(onVector).toHaveBeenLastCalledWith({ x: 0, y: 0, m: 0 })
  })

  it('dragging the well past the midline tosses it to the other side and persists it', () => {
    const { container } = render(<Thumbstick onVector={() => {}} knobColorRef={createRef<string>() as any} />)
    const well = container.querySelector('.wheel-stick')!
    expect(well.getAttribute('data-side')).toBe('right')
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    pev(well, 'pointerdown', { pointerId: 2, clientX: 340, clientY: 700 })
    pev(well, 'pointermove', { pointerId: 2, clientX: 120, clientY: 700 })
    pev(well, 'pointerup', { pointerId: 2, clientX: 120, clientY: 700 })
    expect(well.getAttribute('data-side')).toBe('left')
    expect(localStorage.getItem(STICK_SIDE_KEY)).toBe('left')
  })

  it('fades to idle after 2.5 s without touch and wakes on any touch', () => {
    vi.useFakeTimers()
    const { container } = render(<Thumbstick onVector={() => {}} knobColorRef={createRef<string>() as any} />)
    const well = container.querySelector('.wheel-stick')!
    act(() => { vi.advanceTimersByTime(2600) })
    expect(well.getAttribute('data-idle')).toBe('1')
    pev(document.body, 'pointerdown', { pointerId: 3, clientX: 10, clientY: 10 })
    expect(well.getAttribute('data-idle')).toBe('0')
    vi.useRealTimers()
  })

  it('a touch that starts on the knob wakes an idle stick', () => {
    vi.useFakeTimers()
    const { container } = render(<Thumbstick onVector={() => {}} knobColorRef={createRef<string>() as any} />)
    const well = container.querySelector('.wheel-stick')!
    const knob = container.querySelector('.wheel-stick-knob')!
    vi.spyOn(well, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 112, height: 112, right: 112, bottom: 112, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    act(() => { vi.advanceTimersByTime(2600) })
    expect(well.getAttribute('data-idle')).toBe('1')
    pev(knob, 'pointerdown', { pointerId: 4, clientX: 56, clientY: 56 })
    expect(well.getAttribute('data-idle')).toBe('0')
    vi.useRealTimers()
  })
})
