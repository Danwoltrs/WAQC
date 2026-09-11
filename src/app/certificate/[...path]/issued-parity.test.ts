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
    // The machine-readable twin of the page above: unauthenticated,
    // service-role, and documented as public. It derived its own percentages
    // and its own defect counts straight from the raw assessment, so the slug
    // printed on a tin returned the real out-of-spec numbers while the page
    // and the PDF behind the same slug returned the issued ones.
    ['src/app/api/certificate/[slug]/route.ts'],
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

  /**
   * resolvePublicCertificateNumbers (certificate-view-model.ts) is exercised
   * directly, with hand-built arguments, by certificate-view-model.test.ts —
   * those tests prove the FUNCTION discriminates on `issued`, but they cannot
   * see how the PAGE calls it. The page has exactly one production call site
   * (getCertificateInfo). If a future edit changed it to
   * `resolvePublicCertificateNumbers(greenBean, null)` — discarding the
   * fetched decision — that would compile clean, trip none of the regexes
   * above, and pass every behavioural test, because they never touch the call
   * site itself.
   *
   * It matters more here than usual: `sample_tolerance_approvals` is
   * unmigrated everywhere, so `fetchIssuedValues` returns null in every real
   * environment today. There is no runtime signal that would ever surface
   * this mistake — nothing would catch it until a real decision existed in
   * production and the page quietly started showing raw values to a buyer.
   *
   * This is deliberately another source-grep, guarding one known call site
   * against one specific substitution — a narrow case where a grep is
   * genuinely adequate. The alternative (exporting and mocking the page's
   * whole data-assembly function) is a refactor out of proportion to the risk.
   * Written to survive reformatting: it captures the call's whole argument
   * list rather than anchoring to one exact line, so wrapping the call across
   * lines or adding whitespace does not break the guard.
   */
  it('page.tsx passes the fetched issued values into the view-model, not a literal null', () => {
    const src = readFileSync('src/app/certificate/[...path]/page.tsx', 'utf8')
    const match = src.match(/resolvePublicCertificateNumbers\(([\s\S]*?)\)/)
    expect(match).not.toBeNull()

    const args = match![1].split(',').map(s => s.trim()).filter(Boolean)
    expect(args).toHaveLength(2)

    const [, issuedArg] = args
    expect(issuedArg).not.toBe('null')
    expect(issuedArg).not.toBe('undefined')
    expect(issuedArg).toBe('issuedValues')
  })
})
