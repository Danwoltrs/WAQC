import { describe, it, expect } from 'vitest'
import { trayPlacement } from './placement'

// Where the descriptors go, given the stage below the tab row (Daniel 2026-10-06:
// "when we mouse over the lower part of the wheel, we cant see the buttons").
describe('trayPlacement — the descriptors never cover the wheel on a desktop', () => {
  it.each([
    [1366, 583, 'side'],    // the laptop the complaint came from
    [1366, 536, 'side'],    // same laptop with the lot strip
    [1280, 650, 'side'],
    [1920, 890, 'side'],
    [1024, 701, 'side'],    // smallest non-compact landscape
    [1100, 900, 'side'],    // squarish window: beside still gives the bigger wheel (716 vs 660)
  ] as const)('a %i×%i desktop stage puts them beside the wheel', (w, h, want) => {
    expect(trayPlacement(w, h, false)).toBe(want)
  })

  it('a portrait desktop stage puts them below the wheel, which is sized by the width anyway', () => {
    expect(trayPlacement(1080, 1800, false)).toBe('stacked')
  })

  it('a compact screen keeps the floating, collapsible tray whatever its size', () => {
    expect(trayPlacement(390, 743, true)).toBe('overlay')
    expect(trayPlacement(1024, 701, true)).toBe('overlay')
  })

  it('an unmeasured stage (closed overlay, first frame) assumes the common landscape desktop', () => {
    expect(trayPlacement(0, 0, false)).toBe('side')
  })
})
