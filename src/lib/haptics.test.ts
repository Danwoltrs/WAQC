import { describe, it, expect, vi, afterEach } from 'vitest'
import { haptic, hapticTick, hapticSelect, hapticRefuse, IOS_SWITCH_ID } from './haptics'

const nav = navigator as unknown as { vibrate?: (p: number | number[]) => boolean }

afterEach(() => {
  delete nav.vibrate
  document.getElementById(IOS_SWITCH_ID)?.remove()
})

describe('haptics — one tick for every touch surface of the journey', () => {
  it('uses navigator.vibrate where it exists (Android Chrome)', () => {
    nav.vibrate = vi.fn(() => true)
    hapticTick(); hapticSelect(); hapticRefuse()
    expect(nav.vibrate).toHaveBeenCalledTimes(3)
    expect(nav.vibrate).toHaveBeenNthCalledWith(1, 5)
    expect(nav.vibrate).toHaveBeenNthCalledWith(2, 8)
    expect(nav.vibrate).toHaveBeenNthCalledWith(3, [12, 40, 12])
    // no switch is planted when the real API is there
    expect(document.getElementById(IOS_SWITCH_ID)).toBeNull()
  })

  it('without vibrate (iOS Safari) it toggles a hidden <input type=checkbox switch>, planted once — inside a trusted event, at once', () => {
    // A trusted event is what iOS demands; jsdom cannot mint one, so stand in for window.event.
    Object.defineProperty(window, 'event', { value: { isTrusted: true }, configurable: true })
    haptic(5)
    const sw = document.getElementById(IOS_SWITCH_ID) as HTMLInputElement
    expect(sw).toBeTruthy()
    expect(sw.type).toBe('checkbox')
    expect(sw.hasAttribute('switch')).toBe(true)
    expect(sw.getAttribute('aria-hidden')).toBe('true')
    const before = sw.checked
    haptic(5)
    expect(sw.checked).toBe(!before)                          // each tick toggles the switch
    expect(document.querySelectorAll(`#${IOS_SWITCH_ID}`)).toHaveLength(1)
    Object.defineProperty(window, 'event', { value: undefined, configurable: true })
  })

  it('outside a trusted event (the rAF loop) the tick is queued and plays on the next touch — once, however many were queued', () => {
    Object.defineProperty(window, 'event', { value: undefined, configurable: true })
    haptic(5)
    const sw = document.getElementById(IOS_SWITCH_ID) as HTMLInputElement
    const before = sw.checked
    expect(sw.checked).toBe(before)                           // nothing yet: no gesture to ride
    haptic(5); haptic(5)
    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }))
    expect(sw.checked).toBe(!before)                          // one toggle for the three queued ticks
    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }))
    expect(sw.checked).toBe(!before)                          // and nothing more without a new tick
  })

  it('never throws when nothing is available', () => {
    nav.vibrate = () => { throw new Error('denied') }
    expect(() => haptic(5)).not.toThrow()
  })
})
