import { describe, it, expect, vi, afterEach } from 'vitest'
import { haptic, hapticTick, hapticSelect, hapticRefuse, IOS_SWITCH_ID } from './haptics'

const nav = navigator as unknown as { vibrate?: (p: number | number[]) => boolean }

afterEach(() => {
  delete nav.vibrate
  document.getElementById(IOS_SWITCH_ID)?.parentElement?.remove()
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

  it('without vibrate (iOS Safari) it clicks a hidden <input type=checkbox switch>, planted once', () => {
    haptic(5)
    const sw = document.getElementById(IOS_SWITCH_ID) as HTMLInputElement
    expect(sw).toBeTruthy()
    expect(sw.type).toBe('checkbox')
    expect(sw.hasAttribute('switch')).toBe(true)
    expect(sw.closest('label')).toBeTruthy()                 // the label click is what toggles it
    expect(sw.closest('label')!.getAttribute('aria-hidden')).toBe('true')
    const before = sw.checked
    haptic(5)
    expect(sw.checked).toBe(!before)                          // each tick toggles the switch
    expect(document.querySelectorAll(`#${IOS_SWITCH_ID}`)).toHaveLength(1)
  })

  it('never throws when nothing is available', () => {
    nav.vibrate = () => { throw new Error('denied') }
    expect(() => haptic(5)).not.toThrow()
  })
})
