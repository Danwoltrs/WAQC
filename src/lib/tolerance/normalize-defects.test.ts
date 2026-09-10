import { describe, expect, it } from 'vitest'
import { normalizeDefects, type DefectLimits } from './normalize-defects'
import type { DefectConfig } from '@/types/defect-configuration'

const configs: DefectConfig[] = [
  { name: 'Full Black', weight: 1, category: 'primary', display_order: 0 },
  { name: 'Broken', weight: 0.2, category: 'secondary', display_order: 1 },
  { name: 'Shells', weight: 0.34, category: 'secondary', display_order: 2 },
]

describe('normalizeDefects', () => {
  it('reduces secondary counts until the total meets the limit', () => {
    // 2 primary + 60 Broken x 0.2 = 12 secondary -> total 14, max 12
    const r = normalizeDefects({ 'Full Black': 2, Broken: 60 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.total).toBeCloseTo(12)
    expect(r.issued.primary).toBeCloseTo(2)
    expect(r.issued.counts['Full Black']).toBe(2)
    expect(r.issued.counts.Broken).toBe(50)
  })

  it('lands better than the limit when no exact landing exists', () => {
    // 40 Shells x 0.34 = 13.6, max 12. Steps of 0.34 skip 12.0 exactly.
    const r = normalizeDefects({ Shells: 40 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.total).toBeLessThanOrEqual(12)
    expect(r.issued.total).toBeCloseTo(11.9)
    expect(r.issued.counts.Shells).toBe(35)
  })

  it('never reduces a primary category', () => {
    const r = normalizeDefects({ 'Full Black': 6, Broken: 40 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts['Full Black']).toBe(6)
    expect(r.issued.primary).toBeCloseTo(6)
  })

  it('takes from the largest contributing secondary category first', () => {
    // Broken contributes 40x0.2 = 8, Shells 10x0.34 = 3.4 -> Broken is reduced.
    const r = normalizeDefects({ Broken: 40, Shells: 10 }, configs, { max_total: 11 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts.Shells).toBe(10)
    expect(r.issued.counts.Broken).toBeLessThan(40)
  })

  it('satisfies the secondary limit and the total limit together', () => {
    const limits: DefectLimits = { max_secondary: 5, max_total: 12 }
    const r = normalizeDefects({ 'Full Black': 2, Broken: 50 }, configs, limits)
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.secondary).toBeLessThanOrEqual(5)
    expect(r.issued.total).toBeLessThanOrEqual(12)
  })

  it('refuses when the primary limit is the failing one', () => {
    const r = normalizeDefects({ 'Full Black': 5 }, configs, { max_primary: 2 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/primary/i)
  })

  it('refuses when secondary categories are exhausted', () => {
    const r = normalizeDefects({ 'Full Black': 20, Broken: 5 }, configs, { max_total: 12 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/exhausted/i)
  })

  it('refuses when the lot has no per-category counts stored', () => {
    const r = normalizeDefects({}, configs, { max_total: 12 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/no per-category/i)
  })

  it('returns the input untouched when nothing is over the limit', () => {
    const r = normalizeDefects({ Broken: 10 }, configs, { max_total: 12 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts.Broken).toBe(10)
    expect(r.issued.total).toBeCloseTo(2)
  })
})
