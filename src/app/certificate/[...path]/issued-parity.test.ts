import { describe, expect, it } from 'vitest'
import { resolveScreenPercentages } from '@/lib/certificate-data'

import { readFileSync } from 'node:fs'

/**
 * The PDF and the public page must print the same numbers.
 *
 * Comparing the shared helper to itself would prove nothing, so this pins two
 * things that can actually break: the helper's concrete output, and the fact
 * that NEITHER render path still derives percentages on its own. The second is
 * the real guard — the old divergence existed precisely because both files
 * carried their own `grams / total * 100`.
 */
describe('issued value parity', () => {
  const grams = { '18': 272, '15': 689, Pan: 39 }
  const issued = { screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 }, defects: null }

  it('derives concrete percentages with no decision on file', () => {
    const r = resolveScreenPercentages(grams, null)
    expect(r?.issued).toBe(false)
    expect(r?.percentages['18']).toBeCloseTo(27.2)
    expect(r?.percentages['15']).toBeCloseTo(68.9)
    expect(r?.percentages.Pan).toBeCloseTo(3.9)
  })

  it('returns the issued percentages verbatim when a decision is on file', () => {
    const r = resolveScreenPercentages(grams, issued)
    expect(r?.issued).toBe(true)
    expect(r?.percentages).toEqual({ '18': 30, '15': 66.1, Pan: 3.9 })
  })

  it.each([
    ['src/components/pdf/certificate/quality-certificate.tsx'],
    ['src/app/certificate/[...path]/page.tsx'],
  ])('%s does not derive screen percentages itself', (file) => {
    const src = readFileSync(file, 'utf8')
    // Both files must read the resolved percentages, never recompute them.
    expect(src).not.toMatch(/totalGrams/)
    expect(src).not.toMatch(/\/\s*total\s*\)\s*\*\s*100/)
    // A render path can re-derive without an inline `total * 100` by calling
    // the raw-grams helper directly instead of going through
    // resolveScreenPercentages — that is exactly how the public page carried
    // its own derivation (screenGramsToPercent(greenBean?.screen_sizes)),
    // invisible to the two checks above. Catch the call itself.
    expect(src).not.toMatch(/screenGramsToPercent\(/)
  })
})
