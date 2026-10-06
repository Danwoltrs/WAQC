import { describe, it, expect } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { planDwell, dwellKeepsCounting, dwellRearmed, DWELL_IN, DWELL_SWITCH, DWELL_OUT } from './dwell'

const node = (name: string) => ({ kind: 'node' as const, node: NODES.find((n) => n.name === name)! })
const HUB = { kind: 'hub' as const }
const OUTSIDE = { kind: 'outside' as const }

describe('planDwell — desktop hover flies to a family after a guard band', () => {
  it('at rest, resting on any wedge schedules a fly to its FAMILY (a leaf hovers its family, not itself)', () => {
    expect(planDwell(null, node('Fruity'))).toEqual({ key: 'fam:Fruity', ms: DWELL_IN, family: 'Fruity' })
    expect(planDwell(null, node('Blueberry'))).toEqual({ key: 'fam:Fruity', ms: DWELL_IN, family: 'Fruity' })
  })

  it('a wedge of the focused family never re-flies — clicks toggle picks there', () => {
    expect(planDwell('Fruity', node('Blueberry'))).toBeNull()
    expect(planDwell('Fruity', node('Fruity'))).toBeNull()
  })

  it('a wedge of another family switches after the longer switch band', () => {
    expect(planDwell('Fruity', node('Malt'))).toEqual({ key: 'fam:Roasted', ms: DWELL_SWITCH, family: 'Roasted' })
  })

  it('the hub zooms out only while something is focused', () => {
    expect(planDwell('Fruity', HUB)).toEqual({ key: 'out', ms: DWELL_OUT, family: null })
    expect(planDwell(null, HUB)).toBeNull()
  })

  it('the ground outside the rim never schedules anything', () => {
    expect(planDwell(null, OUTSIDE)).toBeNull()
    expect(planDwell('Fruity', OUTSIDE)).toBeNull()
  })

  it('the key names the FAMILY, so a hand resting on a wedge boundary inside one family keeps one clock', () => {
    expect(planDwell(null, node('Blueberry'))!.key).toBe(planDwell(null, node('Lemon'))!.key)
  })
})

// Daniel 2026-10-06: "Mouse circling around makes it very laggy". The clock used to
// keep counting while the mouse wandered anywhere inside one family, so a hand that
// merely passed through a big family flew the camera, and each fly moved the wheel
// under the moving hand into the next family. The clock now runs only while the
// pointer rests.
describe('dwellKeepsCounting — the clock runs only while the pointer rests', () => {
  const clock = { key: 'fam:Fruity', x: 100, y: 100 }

  it('hand jitter of a few pixels on the same intent keeps the clock running', () => {
    expect(dwellKeepsCounting(clock, 'fam:Fruity', 104, 97)).toBe(true)    // 5 px
  })

  it('travelling on restarts it, even inside the same family', () => {
    expect(dwellKeepsCounting(clock, 'fam:Fruity', 100, 120)).toBe(false)  // 20 px
  })

  it('a new intent restarts it however close the pointer is', () => {
    expect(dwellKeepsCounting(clock, 'fam:Sweet', 101, 100)).toBe(false)
  })

  it('with no clock running there is nothing to keep', () => {
    expect(dwellKeepsCounting(null, 'fam:Fruity', 100, 100)).toBe(false)
  })
})

describe('dwellRearmed — after a fly, hover waits for the hand to move on', () => {
  // A fly moves the wheel under a still pointer, so whatever is under it now was
  // never chosen. Until the hand travels away from where the fly began, a nudge
  // must not arm another fly.
  it('a nudge near where the fly began does not re-arm', () => {
    expect(dwellRearmed({ x: 100, y: 100 }, 110, 110)).toBe(false)   // 14 px
  })

  it('a deliberate move away does', () => {
    expect(dwellRearmed({ x: 100, y: 100 }, 100, 140)).toBe(true)    // 40 px
  })

  it('with no fly to wait out, hover is armed', () => {
    expect(dwellRearmed(null, 100, 100)).toBe(true)
  })
})
