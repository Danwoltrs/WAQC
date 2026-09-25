import { describe, it, expect } from 'vitest'
import { buildQualityFindings, buyerSafeGreen, emptyQualityFindings, type LabUnitQuality } from './annual-quality'
import { extractGreenDefects } from '@/lib/report-data'
import type { CupDefect } from '@/lib/quality-resolvers'
import type { IssuedValues } from '@/lib/tolerance/issued-values'

const lot = (p: Partial<LabUnitQuality>): LabUnitQuality => ({
  labUnitId: 'l', shipper: 'EISA', certificateNumber: 'SAK-1/26', green: null, cupDefects: [], ...p,
})
const graded = (counts: Record<string, number>, primary: number, secondary: number) => ({
  defects: { counts, primary, secondary },
})
const cup = (kind: 'Taint' | 'Fault', name: string): CupDefect => ({ kind, name, cups: null, intensity: null })

describe('buildQualityFindings', () => {
  it('splits named defects into primary and secondary with lots, total beans and the worst lot', () => {
    const f = buildQualityFindings([
      lot({ labUnitId: 'a', shipper: 'EISA', certificateNumber: 'SAK-1/26', green: graded({ 'Full Black': 2, 'Broken/Chipped': 10 }, 2, 2) }),
      lot({ labUnitId: 'b', shipper: 'Dreyfus', certificateNumber: 'SAK-2/26', green: graded({ 'Full Black': 5 }, 5, 0) }),
      lot({ labUnitId: 'c', shipper: 'Grano', certificateNumber: 'SAK-3/26', green: graded({ Immature: 3 }, 0, 0.6) }),
    ])
    expect(f.primary).toEqual([
      { name: 'Full Black', lots: 2, total: 7, worst: { count: 5, shipper: 'Dreyfus', certificate: 'SAK-2/26' } },
    ])
    expect(f.secondary.map(d => [d.name, d.lots, d.total])).toEqual([['Broken/Chipped', 1, 10], ['Immature', 1, 3]])
  })

  it('counts a taint or fault once per lot and across lots', () => {
    const f = buildQualityFindings([
      lot({ labUnitId: 'a', cupDefects: [cup('Taint', 'Phenolic'), cup('Taint', 'Phenolic'), cup('Fault', 'Mouldy')] }),
      lot({ labUnitId: 'b', cupDefects: [cup('Taint', 'Phenolic')] }),
    ])
    expect(f.taints).toEqual([{ name: 'Phenolic', lots: 2 }])
    expect(f.faults).toEqual([{ name: 'Mouldy', lots: 1 }])
  })

  it('averages the defect load over graded lots, clean ones included, and skips ungraded lots', () => {
    const f = buildQualityFindings([
      lot({ labUnitId: 'a', certificateNumber: 'SAK-1/26', green: graded({}, 2, 10) }),
      lot({ labUnitId: 'b', certificateNumber: 'SAK-2/26', green: graded({}, 0, 0) }),
      lot({ labUnitId: 'c', green: null }),
    ])
    expect(f.lots).toBe(3)
    expect(f.gradedLots).toBe(2)
    expect(f.load).toEqual({
      graded: 2, avgPrimary: 1, avgSecondary: 5, avgTotal: 6,
      worst: { total: 12, shipper: 'EISA', certificate: 'SAK-1/26' },
    })
  })

  it('has no worst lot when every graded lot was clean, and no load when nothing was graded', () => {
    expect(buildQualityFindings([lot({ green: graded({}, 0, 0) })]).load?.worst).toBeNull()
    expect(buildQualityFindings([lot({ green: null })]).load).toBeNull()
    expect(buildQualityFindings([])).toEqual(emptyQualityFindings())
  })
})

describe('buyerSafeGreen', () => {
  const green = {
    screen_sizes: { '17': 40, '16': 60 },
    defects: {
      counts: { 'Broken/Chipped': 30 },
      defect_list: [{ name: 'Broken/Chipped', count: 30 }],
      primary: 0, secondary: 6, total: 6,
    },
  }

  it('replaces the defect counts with the issued ones and drops the editor list that still holds the real counts', () => {
    const issued: IssuedValues = {
      screen_percentages: null,
      defects: { counts: { 'Broken/Chipped': 25 }, primary: 0, secondary: 5, total: 5 },
    }
    const safe = buyerSafeGreen(green, issued) as { defects: Record<string, unknown> }
    expect(safe.defects.counts).toEqual({ 'Broken/Chipped': 25 })
    expect(safe.defects.secondary).toBe(5)
    expect(safe.defects).not.toHaveProperty('defect_list')
    expect(extractGreenDefects(safe)).toEqual([{ name: 'Broken/Chipped', count: 25 }])
  })

  it('keeps the real defects when only the screens were issued', () => {
    const issued: IssuedValues = { screen_percentages: { '17': 50, '16': 50 }, defects: null }
    const safe = buyerSafeGreen(green, issued) as { screen_sizes: Record<string, number>; defects: Record<string, unknown> }
    expect(safe.screen_sizes).toEqual({ '17': 50, '16': 50 })
    expect(safe.defects.counts).toEqual({ 'Broken/Chipped': 30 })
  })
})
