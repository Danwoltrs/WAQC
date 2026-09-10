import { describe, expect, it } from 'vitest'
import { evaluateTolerance } from './evaluate'
import type { ComplianceCriterion } from '@/lib/compliance-criteria'

const pass = (key: string): ComplianceCriterion => ({
  key, label: key, actual: 1, operator: null, limit: 1, passed: true,
})
const fail = (
  key: string, actual: number, limit: number, operator: '>' | '<',
): ComplianceCriterion => ({ key, label: key, actual, operator, limit, passed: false })

describe('evaluateTolerance', () => {
  it('offers nothing when every criterion passes', () => {
    const a = evaluateTolerance([pass('screen_18_min'), pass('total_defects')])
    expect(a.offered).toBe(false)
    expect(a.items).toEqual([])
  })

  it('offers a screen minimum inside 5 points', () => {
    const a = evaluateTolerance([fail('screen_18_min', 27.2, 30, '<')])
    expect(a.offered).toBe(true)
    expect(a.items).toHaveLength(1)
    expect(a.items[0]).toMatchObject({
      key: 'screen_18_min', label: 'Screen 18', quadrant: 'distribution',
      direction: 'min', actual: 27.2, limit: 30, tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(2.8)
  })

  it('refuses a screen minimum beyond 5 points', () => {
    const a = evaluateTolerance([fail('screen_18_min', 24, 30, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_18_min')
  })

  it('treats the legacy suffix-less screen key as a minimum', () => {
    const a = evaluateTolerance([fail('screen_18', 27.2, 30, '<')])
    expect(a.offered).toBe(true)
    expect(a.items[0].direction).toBe('min')
  })

  it('offers a pan maximum inside 5 points', () => {
    const a = evaluateTolerance([fail('screen_Pan_max', 7, 5, '>')])
    expect(a.offered).toBe(true)
    expect(a.items[0]).toMatchObject({ direction: 'max', label: 'Pan' })
    expect(a.items[0].gap).toBeCloseTo(2)
  })

  it('offers a total defect count inside 5 equivalents', () => {
    const a = evaluateTolerance([fail('total_defects', 14, 12, '>')])
    expect(a.offered).toBe(true)
    expect(a.items[0]).toMatchObject({
      quadrant: 'defects', direction: 'max', tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(2)
  })

  it('never offers a primary defect failure', () => {
    const a = evaluateTolerance([fail('primary_defects', 3, 2, '>')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('primary_defects')
  })

  it('never offers an exact screen constraint', () => {
    const a = evaluateTolerance([fail('screen_16_exact', 49, 50, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_16_exact')
  })

  it('blocks when any non-tolerable criterion also fails', () => {
    const a = evaluateTolerance([
      fail('screen_18_min', 29, 30, '<'),
      fail('moisture', 13, 12, '>'),
    ])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('moisture')
  })

  it('blocks an unknown future criterion by default', () => {
    const a = evaluateTolerance([fail('water_activity', 0.7, 0.6, '>')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('water_activity')
  })

  it('blocks a criterion whose actual or limit is not numeric', () => {
    const a = evaluateTolerance([
      { key: 'screen_18_min', label: 's', actual: 'n/a', operator: '<', limit: 30, passed: false },
    ])
    expect(a.offered).toBe(false)
  })

  it('collects several tolerable misses into one assessment', () => {
    const a = evaluateTolerance([
      fail('screen_18_min', 27.2, 30, '<'),
      fail('screen_Pan_max', 7, 5, '>'),
      fail('total_defects', 14, 12, '>'),
    ])
    expect(a.offered).toBe(true)
    expect(a.items).toHaveLength(3)
    expect(a.items.map((i) => i.quadrant)).toEqual(['distribution', 'distribution', 'defects'])
  })

  it('blocks suffix-less key with non-screen-shaped size (e.g. screen_uniformity_index)', () => {
    const a = evaluateTolerance([fail('screen_uniformity_index', 29, 30, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_uniformity_index')
  })

  it('blocks suffixed key with non-screen-shaped size (e.g. screen_uniformity_min)', () => {
    const a = evaluateTolerance([fail('screen_uniformity_min', 29, 30, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_uniformity_min')
  })

  it('offers screen size with space (e.g. screen_Peas 11_min) when inside tolerance', () => {
    const a = evaluateTolerance([fail('screen_Peas 11_min', 27.2, 30, '<')])
    expect(a.offered).toBe(true)
    expect(a.items).toHaveLength(1)
    expect(a.items[0]).toMatchObject({
      key: 'screen_Peas 11_min', label: 'Screen Peas 11', quadrant: 'distribution',
      direction: 'min', actual: 27.2, limit: 30, tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(2.8)
  })

  it('offers screen minimum at exactly 5.0 gap (boundary)', () => {
    const a = evaluateTolerance([fail('screen_18_min', 25, 30, '<')])
    expect(a.offered).toBe(true)
    expect(a.items[0]).toMatchObject({
      key: 'screen_18_min', direction: 'min', tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(5.0)
  })

  it('blocks screen minimum at 5.1 gap (beyond boundary)', () => {
    const a = evaluateTolerance([fail('screen_18_min', 24.9, 30, '<')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('screen_18_min')
  })

  it('offers total defects at exactly 5.0 gap (boundary)', () => {
    const a = evaluateTolerance([fail('total_defects', 17, 12, '>')])
    expect(a.offered).toBe(true)
    expect(a.items[0]).toMatchObject({
      key: 'total_defects', quadrant: 'defects', tolerance: 5,
    })
    expect(a.items[0].gap).toBeCloseTo(5.0)
  })

  it('blocks total defects at 5.1 gap (beyond boundary)', () => {
    const a = evaluateTolerance([fail('total_defects', 17.1, 12, '>')])
    expect(a.offered).toBe(false)
    expect(a.blockedBy).toContain('total_defects')
  })
})
