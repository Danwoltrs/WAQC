import { describe, it, expect } from 'vitest'
import { planDwell, DWELL, type ZoomState } from './zoom-machine'

const rest: ZoomState = { mode: 'rest', fam: null }
const fullFruity: ZoomState = { mode: 'full', fam: 'Fruity' }
const midFruity: ZoomState = { mode: 'mid', fam: 'Fruity' }

describe('planDwell — the v8 graded hover zoom', () => {
  it('rest: hovering any node schedules full zoom at 190ms', () => {
    expect(planDwell(rest, { region: 'node', fam: 'Fruity', ring: 2 })).toEqual({
      kind: 'schedule', key: 'full:Fruity', ms: DWELL.in, next: { mode: 'full', fam: 'Fruity' },
    })
  })

  it('rest: hub or background clears', () => {
    expect(planDwell(rest, { region: 'hub' })).toEqual({ kind: 'clear' })
    expect(planDwell(rest, { region: 'none' })).toEqual({ kind: 'clear' })
  })

  it('full: hub schedules zoom-out at 220ms; from mid the hub uses 180ms', () => {
    expect(planDwell(fullFruity, { region: 'hub' })).toEqual({
      kind: 'schedule', key: 'out', ms: DWELL.out, next: { mode: 'rest', fam: null },
    })
    expect(planDwell(midFruity, { region: 'hub' })).toEqual({
      kind: 'schedule', key: 'out', ms: DWELL.backIn, next: { mode: 'rest', fam: null },
    })
  })

  it('full: same family ring 1 schedules half-out at 200ms; outer rings clear', () => {
    expect(planDwell(fullFruity, { region: 'node', fam: 'Fruity', ring: 1 })).toEqual({
      kind: 'schedule', key: 'mid', ms: DWELL.mid, next: { mode: 'mid', fam: 'Fruity' },
    })
    expect(planDwell(fullFruity, { region: 'node', fam: 'Fruity', ring: 3 })).toEqual({ kind: 'clear' })
  })

  it('full: a different family re-aims at 240ms', () => {
    expect(planDwell(fullFruity, { region: 'node', fam: 'Roasted', ring: 2 })).toEqual({
      kind: 'schedule', key: 'full:Roasted', ms: DWELL.switch, next: { mode: 'full', fam: 'Roasted' },
    })
  })

  it('mid: same family ring 1 holds; anything else re-focuses at 180ms', () => {
    expect(planDwell(midFruity, { region: 'node', fam: 'Fruity', ring: 1 })).toEqual({ kind: 'clear' })
    expect(planDwell(midFruity, { region: 'node', fam: 'Fruity', ring: 3 })).toEqual({
      kind: 'schedule', key: 'full:Fruity', ms: DWELL.backIn, next: { mode: 'full', fam: 'Fruity' },
    })
    expect(planDwell(midFruity, { region: 'node', fam: 'Sweet', ring: 1 })).toEqual({
      kind: 'schedule', key: 'full:Sweet', ms: DWELL.backIn, next: { mode: 'full', fam: 'Sweet' },
    })
  })

  it('background clears in every zoomed mode', () => {
    expect(planDwell(fullFruity, { region: 'none' })).toEqual({ kind: 'clear' })
    expect(planDwell(midFruity, { region: 'none' })).toEqual({ kind: 'clear' })
  })
})
