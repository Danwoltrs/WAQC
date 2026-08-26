// src/lib/cupping/cva-cupping-data.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildCvaCuppingData,
  hasPersistedCvaVerdict,
  parseCvaNumber,
  parseCvaTriBoolean,
  parseCvaVerdictRow,
} from './cva-cupping-data'

describe('parseCvaNumber', () => {
  it('accepts a plain finite number', () => {
    expect(parseCvaNumber(86.5)).toBe(86.5)
  })

  it('accepts a non-empty numeric string', () => {
    expect(parseCvaNumber('84')).toBe(84)
  })

  it('rejects an empty string rather than coercing it to zero', () => {
    // Number('') === 0 and Number.isFinite(0) is true — a naive Number(x)
    // coercion would print FINAL: 0 for a column that was never actually set.
    expect(parseCvaNumber('')).toBeNull()
  })

  it('rejects a blank/whitespace-only string', () => {
    expect(parseCvaNumber('   ')).toBeNull()
  })

  it('rejects a non-numeric string', () => {
    expect(parseCvaNumber('not-a-number')).toBeNull()
  })

  it('rejects NaN, null, undefined and other types', () => {
    expect(parseCvaNumber(NaN)).toBeNull()
    expect(parseCvaNumber(null)).toBeNull()
    expect(parseCvaNumber(undefined)).toBeNull()
    expect(parseCvaNumber(true)).toBeNull()
    expect(parseCvaNumber({})).toBeNull()
  })

  it('is the ONE parser for cupping_scores.cva_score, used by the finalize route too', () => {
    // POST /api/cupping/cva/finalize used to reimplement this inline, so the
    // column had two parsers that disagreed about the empty string. Both the
    // route (judging the cup) and the certificate (printing it) go through
    // here now, on the shapes a postgres `numeric` actually hands back.
    expect(parseCvaNumber(89.5)).toBe(89.5)
    expect(parseCvaNumber('89.50')).toBe(89.5)
    expect(parseCvaNumber('')).toBeNull()
    expect(parseCvaNumber(null)).toBeNull()
  })
})

describe('hasPersistedCvaVerdict', () => {
  it('is true once the finalize route wrote a score', () => {
    expect(hasPersistedCvaVerdict({ score: 88.75, minScore: 84, passed: true })).toBe(true)
  })

  it('is true for an override-decided lot that carries no score', () => {
    // decideCvaVerdict ignores the score when a human overrode the cup, so
    // "approved, no score recorded" is a real, certified combination.
    expect(hasPersistedCvaVerdict({ score: null, minScore: 84, passed: true })).toBe(true)
  })

  it('is true when only the pass mark landed', () => {
    expect(hasPersistedCvaVerdict({ score: null, minScore: 84, passed: null })).toBe(true)
  })

  it('is true for a rejected lot, which is a verdict like any other', () => {
    expect(hasPersistedCvaVerdict({ score: null, minScore: null, passed: false })).toBe(true)
  })

  it('is FALSE for a lot that was opened on the specialty table but certified on the commodity one', () => {
    // The spec's documented workaround: a specialty lot re-cupped on the
    // commodity table and certified there carries a CVA assessment blob (the
    // journey autosaves one on the first edit) AND commodity score rows, but
    // its cva_* columns were never written — the commodity route does not
    // write them. Under a methodology='cva' template, committing to the CVA
    // rail on the blob alone would republish that certificate with
    // overallScore: null, silently dropping the headline score it was issued
    // with. Reading false here is what makes certificate-data.ts fall through
    // to the commodity rail and find the real scores.
    expect(hasPersistedCvaVerdict({ score: null, minScore: null, passed: null })).toBe(false)
  })
})

describe('parseCvaTriBoolean', () => {
  it('accepts true and false verbatim', () => {
    expect(parseCvaTriBoolean(true)).toBe(true)
    expect(parseCvaTriBoolean(false)).toBe(false)
  })

  it('never derives true by truthiness from a non-boolean', () => {
    // A naive Boolean(x) would turn a stray non-empty string or non-zero
    // number into true. Only an actual boolean is trusted.
    expect(parseCvaTriBoolean('true')).toBeNull()
    expect(parseCvaTriBoolean(1)).toBeNull()
    expect(parseCvaTriBoolean('false')).toBeNull()
  })

  it('reads null/undefined as "not recorded", the same tri-state null the column uses', () => {
    expect(parseCvaTriBoolean(null)).toBeNull()
    expect(parseCvaTriBoolean(undefined)).toBeNull()
  })
})

describe('parseCvaVerdictRow', () => {
  it('parses all three columns from a well-formed row', () => {
    expect(parseCvaVerdictRow({ cva_score: 86.5, cva_min_score: 84, cva_passed: true })).toEqual({
      score: 86.5,
      minScore: 84,
      passed: true,
    })
  })

  it('treats a missing row as fully unrecorded', () => {
    expect(parseCvaVerdictRow(null)).toEqual({ score: null, minScore: null, passed: null })
    expect(parseCvaVerdictRow(undefined)).toEqual({ score: null, minScore: null, passed: null })
  })

  it('does not let an empty-string score print as zero', () => {
    expect(parseCvaVerdictRow({ cva_score: '', cva_min_score: 84, cva_passed: false })).toEqual({
      score: null,
      minScore: 84,
      passed: false,
    })
  })
})

describe('buildCvaCuppingData', () => {
  it('builds the rail from the assessment and the overall from the persisted score', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: { fragrance: { impression: 7 }, flavor: { impression: 8 } } },
      cvaScore: 86.5,
      cleanCup: true,
      uniformCup: true,
      cvaMinScore: 84,
      cvaPassed: true,
    })
    expect(data.attributes.map((a) => a.name)).toEqual(['Fragrance', 'Flavor'])
    expect(data.overallScore).toBe(86.5)
    expect(data.isSpecialty).toBe(true)
    expect(data.cvaVerdict).toEqual({ minScore: 84, passed: true })
  })

  it('is always marked specialty, regardless of the score achieved', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: {} },
      cvaScore: 62,
      cleanCup: false,
      uniformCup: false,
      cvaMinScore: 84,
      cvaPassed: false,
    })
    expect(data.isSpecialty).toBe(true)
    expect(data.cvaVerdict).toEqual({ minScore: 84, passed: false })
  })

  it('returns an empty rail rather than guessing when no assessment row was found, and still reports the persisted score', () => {
    // Note: buildCvaCuppingData's OWN output still carries the score here —
    // it is the correct value to hand back. Whether the certificate actually
    // PRINTS it in this combination is a decision made downstream by
    // CertificateCupping (which currently suppresses the whole cupping
    // section, score included, whenever attributes is empty) — a renderer
    // concern, not something this assembler should pre-empt.
    const data = buildCvaCuppingData({
      assessment: null,
      cvaScore: 84.25,
      cleanCup: null,
      uniformCup: null,
      cvaMinScore: 84,
      cvaPassed: true,
    })
    expect(data.attributes).toEqual([])
    expect(data.overallScore).toBe(84.25)
  })

  it('prints no score rather than a blank or a zero for an override-approved lot', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: { flavor: { impression: 8 } } },
      cvaScore: null,
      cleanCup: true,
      uniformCup: true,
      cvaMinScore: 84,
      cvaPassed: true,
    })
    expect(data.overallScore).toBeNull()
    // The rail itself is unaffected — what was actually assessed still shows.
    expect(data.attributes).toHaveLength(1)
  })

  it('passes clean/uniform cup and the tri-state verdict through verbatim, including all-null (unjudged)', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: {} },
      cvaScore: null,
      cleanCup: null,
      uniformCup: null,
      cvaMinScore: null,
      cvaPassed: null,
    })
    expect(data.cleanCup).toBeNull()
    expect(data.uniformCup).toBeNull()
    expect(data.cvaVerdict).toEqual({ minScore: null, passed: null })
  })

  it('has no taints, faults, comments or flavor descriptor — concepts CVA has no equivalent for', () => {
    const data = buildCvaCuppingData({
      assessment: { sections: { flavor: { impression: 6 } } },
      cvaScore: 80,
      cleanCup: true,
      uniformCup: true,
      cvaMinScore: 84,
      cvaPassed: false,
    })
    expect(data.taints).toBeNull()
    expect(data.faults).toBeNull()
    expect(data.taintDetails).toEqual([])
    expect(data.faultDetails).toEqual([])
    expect(data.comments).toBeNull()
    expect(data.flavorDescriptor).toBeNull()
  })
})
