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

  it('refuses when primary alone exceeds limit and secondary is exhausted', () => {
    // Full Black: 15 (primary) > max 12, Broken: 1 only.
    // Reducing secondary cannot satisfy the limit (primary alone is 15).
    // Correct implementation must refuse; buggy impl reducing primary would succeed.
    const r = normalizeDefects({ 'Full Black': 15, Broken: 1 }, configs, { max_total: 12 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/exhausted/i)
  })

  it('takes from the largest contributing secondary category first', () => {
    // Broken contributes 40x0.2 = 8, Shells 10x0.34 = 3.4 -> Broken is reduced.
    const r = normalizeDefects({ Broken: 40, Shells: 10 }, configs, { max_total: 11 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts.Shells).toBe(10)
    expect(r.issued.counts.Broken).toBeLessThan(40)
  })

  it('breaks ties on weight when contributions are equal', () => {
    // Two categories with exactly equal weighted contribution: Broken 170 x 0.2 = 34, Shells 100 x 0.34 = 34.
    // Initial total: 68. Set max_total: 67.9 (requires exactly 1 reduction).
    // After 1 Shells reduction: 170 x 0.2 + 99 x 0.34 = 34 + 33.66 = 67.66 < 67.9 ✓
    // Heavier weight (Shells 0.34 > Broken 0.2) wins tie-break in first iteration.
    const r = normalizeDefects({ Broken: 170, Shells: 100 }, configs, { max_total: 67.9 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.issued.counts.Broken).toBe(170)
    expect(r.issued.counts.Shells).toBe(99)
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

  it('compares raw total not rounded total to avoid false positives', () => {
    // Full Black: 2, Shells: 30 -> raw sum = 2 + 10.200000000000001 = 12.200000000000001
    // Rounded sum = 12.2. Max total = 12.2.
    // Raw 12.200000000000001 > 12.2 (still over), but rounded 12.2 <= 12.2 (meets limit).
    // Buggy over() using round2 would stop; correct over() using raw sum keeps reducing.
    const r = normalizeDefects({ 'Full Black': 2, Shells: 30 }, configs, { max_total: 12.2 })
    if (!r.ok) throw new Error(r.reason)
    // After at least 1 reduction of Shells (heaviest contributor): Shells < 30
    expect(r.issued.counts.Shells).toBeLessThan(30)
    // Reported total (rounded) should be <= max
    expect(r.issued.total).toBeLessThanOrEqual(12.2)
  })
})
