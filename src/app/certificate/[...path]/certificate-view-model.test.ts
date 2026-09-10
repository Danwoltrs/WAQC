import { describe, expect, it } from 'vitest'
import { resolvePublicCertificateNumbers } from './certificate-view-model'

/**
 * Behavioural coverage for the one function both the certificate body and
 * generateMetadata's link-preview description must call.
 *
 * The source-grep guard in issued-parity.test.ts only forbids three literal
 * spellings — it cannot tell correct wiring from a page that quietly passes a
 * literal `null` instead of the fetched issued values (it would compile,
 * trip no regex, and pass every OTHER test, because
 * `sample_tolerance_approvals` is unmigrated everywhere and fetchIssuedValues
 * already returns null in every real environment today). These tests instead
 * assert on the RESULT: an issued decision must change what comes out.
 */
describe('resolvePublicCertificateNumbers', () => {
  const grams = { '18': 272, '15': 689, Pan: 39 }
  const rawGreenBean = { screen_sizes: grams, defects: { primary: 3, secondary: 5 } }
  // Raw total = 3 + 5 = 8.

  it('derives screen percentages from grams when there is no decision', () => {
    const r = resolvePublicCertificateNumbers(rawGreenBean, null)
    expect(r.screenPercentages?.['18']).toBeCloseTo(27.2)
    expect(r.screenPercentages?.['15']).toBeCloseTo(68.9)
    expect(r.screenPercentages?.Pan).toBeCloseTo(3.9)
  })

  it('prefers issued screen percentages verbatim when a decision exists', () => {
    const issued = { screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 }, defects: null }
    const r = resolvePublicCertificateNumbers(rawGreenBean, issued)
    expect(r.screenPercentages).toEqual({ '18': 30, '15': 66.1, Pan: 3.9 })
  })

  it('falls back to the raw defect total when there is no decision', () => {
    const r = resolvePublicCertificateNumbers(rawGreenBean, null)
    expect(r.totalDefects).toBe(8)
  })

  it('falls back to the raw defect total when the decision carries no defects override', () => {
    const issued = { screen_percentages: { '18': 30, '15': 66.1, Pan: 3.9 }, defects: null }
    const r = resolvePublicCertificateNumbers(rawGreenBean, issued)
    expect(r.totalDefects).toBe(8)
  })

  it('prefers the issued defect total, and it differs from the raw one — the metadata-leak case', () => {
    const issued = {
      screen_percentages: null,
      defects: { counts: { blackFull: 2, sour: 3 }, primary: 2, secondary: 3, total: 5 },
    }
    const r = resolvePublicCertificateNumbers(rawGreenBean, issued)
    // The whole point: this must NOT equal the raw total (8). A page that
    // read the raw count for its metadata description while the body read
    // this issued one would show a buyer two different defect counts for the
    // same certificate — the exact bug this test exists to catch.
    expect(r.totalDefects).toBe(5)
    expect(r.totalDefects).not.toBe(8)
  })

  it('treats an issued total of exactly 0 as a real override, not a missing one', () => {
    const issued = {
      screen_percentages: null,
      defects: { counts: {}, primary: 0, secondary: 0, total: 0 },
    }
    const r = resolvePublicCertificateNumbers(rawGreenBean, issued)
    expect(r.totalDefects).toBe(0)
  })

  it('returns null numbers when there is no green-bean data and no decision', () => {
    const r = resolvePublicCertificateNumbers(null, null)
    expect(r.screenPercentages).toBeNull()
    expect(r.totalDefects).toBeNull()
  })
})
