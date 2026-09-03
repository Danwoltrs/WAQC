import { describe, it, expect } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { planDwell, DWELL_IN, DWELL_SWITCH, DWELL_OUT } from './dwell'

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

  it('the key is stable across wedges of one family so a timer keeps counting while the mouse wanders inside it', () => {
    expect(planDwell(null, node('Blueberry'))!.key).toBe(planDwell(null, node('Lemon'))!.key)
  })
})
