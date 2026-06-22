import { describe, it, expect } from 'vitest'
import {
  screenRowsFromGrams,
  totalDefects,
  classifyStageResults,
  groupQualitySamples,
  buildQualitySummaryText,
  buildQualitySummaryHtml,
  buildQualitySummarySubject,
  type QualitySampleSummary,
} from './quality-summary'

const sample = (over: Partial<QualitySampleSummary>): QualitySampleSummary => ({
  sampleId: 's1',
  qcClientName: 'Dunkin',
  sellerName: 'EISA',
  exporterSampleNumber: 'AS 175926',
  sellerContractNr: '42235',
  wolthersContractNr: '42235/26',
  screen: [],
  defects: null,
  typeOk: true,
  cupOk: true,
  decision: 'approved',
  reason: null,
  sellerComment: null,
  ...over,
})

describe('screenRowsFromGrams', () => {
  it('normalises grams to percentages, sorted high to low with B last', () => {
    const rows = screenRowsFromGrams({ '18': 45, '17': 53, below: 2 })
    expect(rows).toEqual([
      { label: 'Scr. 18', pct: 45 },
      { label: 'Scr. 17', pct: 53 },
      { label: 'B', pct: 2 },
    ])
  })
  it('works when stored as raw grams (normalises by total)', () => {
    const rows = screenRowsFromGrams({ '18': 90, '17': 106, pan: 4 })
    expect(rows[0]).toEqual({ label: 'Scr. 18', pct: 45 })
    expect(rows[2]).toEqual({ label: 'B', pct: 2 })
  })
  it('returns [] for empty or zero-total input', () => {
    expect(screenRowsFromGrams(null)).toEqual([])
    expect(screenRowsFromGrams({ '18': 0 })).toEqual([])
  })
})

describe('totalDefects', () => {
  it('uses pre-calculated weighted primary+secondary totals', () => {
    expect(totalDefects({ defects: { primary: 0, secondary: 19.04 } })).toBe(19)
  })
  it('falls back to summing raw counts', () => {
    expect(totalDefects({ defects: { counts: { Black: 2, Sour: 1 } } })).toBe(3)
  })
  it('returns null when no defect data', () => {
    expect(totalDefects(null)).toBeNull()
    expect(totalDefects({})).toBeNull()
  })
})

describe('classifyStageResults', () => {
  it('approved is always OK / OK', () => {
    expect(
      classifyStageResults({ decision: 'approved', violations: ['Screen 17: low'], hasGradingComment: false, hasCuppingComment: false }),
    ).toEqual({ typeOk: true, cupOk: true })
  })
  it('rejected on a green violation → Type FAIL, Cup OK', () => {
    expect(
      classifyStageResults({ decision: 'rejected', violations: ['Primary defects: 5 exceeds limit (2)'], hasGradingComment: true, hasCuppingComment: false }),
    ).toEqual({ typeOk: false, cupOk: true })
  })
  it('rejected on a cup violation → Type OK, Cup FAIL', () => {
    expect(
      classifyStageResults({ decision: 'rejected', violations: ['Flavor: 6.50 is below minimum (7)'], hasGradingComment: false, hasCuppingComment: true }),
    ).toEqual({ typeOk: true, cupOk: false })
  })
  it('rejected with no computed violations falls back to comment presence', () => {
    expect(
      classifyStageResults({ decision: 'rejected', violations: [], hasGradingComment: true, hasCuppingComment: false }),
    ).toEqual({ typeOk: false, cupOk: true })
  })
  it('rejected with no violations and no comments → undetermined', () => {
    expect(
      classifyStageResults({ decision: 'rejected', violations: [], hasGradingComment: false, hasCuppingComment: false }),
    ).toEqual({ typeOk: null, cupOk: null })
  })
})

describe('groupQualitySamples', () => {
  it('groups a seller email by QC client, ordered by name', () => {
    const groups = groupQualitySamples(
      [
        sample({ sampleId: 'a', qcClientName: 'Nestle' }),
        sample({ sampleId: 'b', qcClientName: 'Dunkin' }),
      ],
      'qcClient',
    )
    expect(groups.map((g) => g.heading)).toEqual(['Dunkin', 'Nestle'])
  })
  it('groups a buyer email by seller', () => {
    const groups = groupQualitySamples(
      [
        sample({ sampleId: 'a', sellerName: 'EISA' }),
        sample({ sampleId: 'b', sellerName: 'Cocatrel' }),
      ],
      'seller',
    )
    expect(groups.map((g) => g.heading)).toEqual(['Cocatrel', 'EISA'])
  })
  it('orders approvals before rejections within a group', () => {
    const groups = groupQualitySamples(
      [
        sample({ sampleId: 'r', decision: 'rejected', exporterSampleNumber: 'AS 1' }),
        sample({ sampleId: 'a', decision: 'approved', exporterSampleNumber: 'AS 2' }),
      ],
      'qcClient',
    )
    expect(groups[0].samples.map((s) => s.sampleId)).toEqual(['a', 'r'])
  })
})

describe('buildQualitySummaryText', () => {
  it('renders ref/both, screen, defects, type/cup, and a reason for rejections', () => {
    const groups = groupQualitySamples(
      [
        sample({
          screen: [
            { label: 'Scr. 18', pct: 45 },
            { label: 'Scr. 17', pct: 53 },
            { label: 'B', pct: 2 },
          ],
          defects: 4,
        }),
        sample({
          sampleId: 's2',
          decision: 'rejected',
          typeOk: true,
          cupOk: false,
          reason: 'Excess cup faults.',
        }),
      ],
      'qcClient',
    )
    const text = buildQualitySummaryText(groups)
    expect(text).toContain('Dunkin')
    expect(text).toContain('Sample: AS 175926 / 42235')
    expect(text).toContain('Scr. 18 45%')
    expect(text).toContain('Defects: 4')
    expect(text).toContain('Type: OK')
    expect(text).toContain('Cup: FAIL')
    expect(text).toContain('Reason: Excess cup faults.')
  })
})

describe('buildQualitySummaryHtml', () => {
  it('renders a table with OK/FAIL and a colspan reason row', () => {
    const groups = groupQualitySamples(
      [sample({ sampleId: 's2', decision: 'rejected', typeOk: false, cupOk: true, reason: 'Defects over spec.' })],
      'qcClient',
    )
    const html = buildQualitySummaryHtml(groups)
    expect(html).toContain('<table')
    expect(html).toContain('REJECTED')
    expect(html).toContain('FAIL')
    expect(html).toContain('colspan="7"')
    expect(html).toContain('Defects over spec.')
  })
  it('escapes dynamic values', () => {
    const groups = groupQualitySamples([sample({ exporterSampleNumber: '<b>x</b>' })], 'qcClient')
    const html = buildQualitySummaryHtml(groups)
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).not.toContain('<b>x</b>')
  })
})

describe('seller comment (approval note)', () => {
  it('shows the note in the seller email (sellerComment opt) for an approved sample', () => {
    const groups = groupQualitySamples([sample({ sellerComment: 'Slightly woody but within spec.' })], 'qcClient')
    expect(buildQualitySummaryText(groups, { sellerComment: true })).toContain('Note: Slightly woody but within spec.')
    expect(buildQualitySummaryHtml(groups, { sellerComment: true })).toContain('Slightly woody but within spec.')
  })
  it('omits the note for buyers (no opt)', () => {
    const groups = groupQualitySamples([sample({ sellerComment: 'Seller-only note.' })], 'seller')
    expect(buildQualitySummaryText(groups)).not.toContain('Seller-only note.')
    expect(buildQualitySummaryHtml(groups)).not.toContain('Seller-only note.')
  })
  it('does not show a note on a rejected sample even with the opt (approvals only)', () => {
    const groups = groupQualitySamples(
      [sample({ decision: 'rejected', sellerComment: 'Should not appear.', reason: 'Out of spec.' })],
      'qcClient',
    )
    expect(buildQualitySummaryText(groups, { sellerComment: true })).not.toContain('Should not appear.')
  })
})

describe('buildQualitySummarySubject', () => {
  it('says certificates for buyers, quality results for sellers', () => {
    const groups = groupQualitySamples([sample({}), sample({ sampleId: 's2', decision: 'rejected' })], 'qcClient')
    expect(buildQualitySummarySubject(groups, true)).toBe('Wolthers QC — 2 certificates (1 approved, 1 rejected)')
    expect(buildQualitySummarySubject(groups, false)).toBe('Wolthers QC — 2 quality results (1 approved, 1 rejected)')
  })
})
