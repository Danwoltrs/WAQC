import { describe, it, expect } from 'vitest'
import { NODES } from '@/lib/cva/flavor-wheel-data'
import { mergePanelSensory } from './merge'
import { RESOLVED_NOTE_CAP, type PanelSensoryRow } from './types'

const choc = ['Nutty/Cocoa', 'Cocoa', 'Chocolate']
const nut = ['Nutty/Cocoa', 'Nutty', 'Hazelnut']
const car = ['Sweet', 'Brown Sugar', 'Caramelized']

const row = (id: string, picks: string[][] | null, pid: string | null = null, match: boolean | null = null): PanelSensoryRow => ({
  score_id: id, cupper_id: 'c' + id,
  sensory: picks === null ? null : { picks, profile_id: pid, profile_match: match },
})
const merge = (rows: PanelSensoryRow[], extra: Partial<Parameters<typeof mergePanelSensory>[0]> = {}) =>
  mergePanelSensory({ rows, excludedScoreIds: [], sourceScoreId: null, profileId: null, ...extra })

const rows4 = [row('1', [choc, nut, car]), row('2', [choc, nut]), row('3', [choc]), row('4', [['Sweet']])]

describe('mergePanelSensory', () => {
  it('keeps picks at or above ceil(contributors/2)', () => {
    const r = merge(rows4)
    expect(r.contributors).toBe(4)
    expect(r.notes).toEqual([choc, nut])
    expect(r.counts[choc.join('>')]).toBe(3)
    expect(r.counts[car.join('>')]).toBe(1)
  })
  it('1 of 1 and 1 of 2 pass', () => {
    expect(merge([row('1', [choc])]).notes).toEqual([choc])
    expect(merge([row('1', [choc]), row('2', [nut])]).notes).toEqual([choc, nut].sort((a, b) => idx(a) - idx(b)))
  })
  it('a null-sensory row does not raise the threshold', () => {
    const r = merge([row('1', [choc]), row('2', null), row('3', null)])
    expect(r.contributors).toBe(1)
    expect(r.notes).toEqual([choc])
  })
  it('a row with no picks is not a contributor', () => {
    expect(merge([row('1', [choc]), row('2', [])]).contributors).toBe(1)
  })
  it('zero contributors gives no notes', () => {
    expect(merge([row('1', [])])).toEqual({ notes: [], counts: {}, match: null, contributors: 0 })
  })
  it('ignores excluded rows entirely', () => {
    const r = merge([row('1', [choc], 'p', true), row('2', [nut], 'p', false), row('3', [nut], 'p', false)],
      { excludedScoreIds: ['2', '3'], profileId: 'p' })
    expect(r.notes).toEqual([choc])
    expect(r.contributors).toBe(1)
    expect(r.counts[nut.join('>')]).toBeUndefined()
    expect(r.match).toBe(true)
  })
  it('sourceScoreId takes that row picks and answer', () => {
    const r = merge([row('1', [choc], 'p', true), row('2', [nut, car], 'p', false), row('3', [nut], 'p', false)],
      { sourceScoreId: '1', profileId: 'p' })
    expect(r.notes).toEqual([choc])
    expect(r.match).toBe(true)
    expect(r.contributors).toBe(3)
    expect(r.counts[nut.join('>')]).toBe(2)
  })
  it('sourceScoreId answer is null when its profile_id differs', () => {
    expect(merge([row('1', [choc], 'other', true)], { sourceScoreId: '1', profileId: 'p' }).match).toBeNull()
    expect(merge([row('1', [choc], 'p', true)], { sourceScoreId: '1', profileId: null }).match).toBeNull()
  })
  it('an excluded or missing sourceScoreId falls back to the majority', () => {
    expect(merge([row('1', [choc]), row('2', [nut])], { sourceScoreId: '2', excludedScoreIds: ['2'] }).notes).toEqual([choc])
    expect(merge([row('1', [choc])], { sourceScoreId: 'zzz' }).notes).toEqual([choc])
  })
  it('answers: majority, tie, none', () => {
    const p = { profileId: 'p' }
    expect(merge([row('1', [], 'p', true), row('2', [], 'p', true), row('3', [], 'p', false)], p).match).toBe(true)
    expect(merge([row('1', [], 'p', false), row('2', [], 'p', false), row('3', [], 'p', true)], p).match).toBe(false)
    expect(merge([row('1', [], 'p', true), row('2', [], 'p', false)], p).match).toBeNull()
    expect(merge([row('1', [choc])], p).match).toBeNull()
  })
  it('ignores answers for another profile or when profileId is null', () => {
    expect(merge([row('1', [], 'x', true), row('2', [], 'x', true)], { profileId: 'p' }).match).toBeNull()
    expect(merge([row('1', [], 'p', true)], { profileId: null }).match).toBeNull()
  })
  it('orders by count desc then wheel order, capped', () => {
    const leaves = NODES.filter((n) => n.ring === 3).slice(0, 8).map((n) => n.path)
    const r = merge([row('1', leaves.slice(0, 5)), row('2', leaves.slice(3, 5).concat([leaves[7]]))])
    // leaves 3 and 4 have count 2, rest 1; threshold = 1 so everything counts
    expect(r.notes[0]).toEqual(leaves[3])
    expect(r.notes[1]).toEqual(leaves[4])
    const many = NODES.filter((n) => n.ring === 3).slice(0, 12).map((n) => n.path)
    const capped = merge([row('1', many.slice(0, 5)), row('2', many.slice(5, 10))])
    expect(capped.notes).toHaveLength(RESOLVED_NOTE_CAP)
  })
  it('sanitizes picks read from rows', () => {
    const r = merge([row('1', [choc, ['Bad', 'Path'], choc])])
    expect(r.notes).toEqual([choc])
    expect(r.counts[choc.join('>')]).toBe(1)
  })
})

function idx(p: string[]) { return NODES.findIndex((n) => n.path.join('>') === p.join('>')) }
