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
  buyerContractNr: 'DKN-001',
  trackingNumber: 'BR-42235/26',
  containerNr: 'MRKU 708.491-7',
  icoNumber: '013/0456/0789',
  sampleType: 'ss',
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
  it('normalises grams to percentages, sorted high to low, dropping the pan/below bucket', () => {
    const rows = screenRowsFromGrams({ '18': 45, '17': 53, below: 2 })
    expect(rows).toEqual([
      { label: 'Scr. 18', pct: 45 },
      { label: 'Scr. 17', pct: 53 },
    ])
  })
  it('parses non-numeric keys ("Screen 16"), sorts high to low, and drops the pan', () => {
    // legacy data stored keys as "Screen N" — must still parse the number,
    // sort correctly, and omit the pan ("B") bucket
    const rows = screenRowsFromGrams({ 'Screen 15': 28, 'Screen 16': 65, B: 7 })
    expect(rows).toEqual([
      { label: 'Scr. 16', pct: 65 },
      { label: 'Scr. 15', pct: 28 },
    ])
  })
  it('keeps the pan in the percentage base but excludes it from the rows', () => {
    // total = 200 (incl. 4 g pan); screens keep their true proportion
    const rows = screenRowsFromGrams({ '18': 90, '17': 106, pan: 4 })
    expect(rows).toEqual([
      { label: 'Scr. 18', pct: 45 },
      { label: 'Scr. 17', pct: 53 },
    ])
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
  it('renders seller refs (Sample/Wolthers/Seller), screen, defects, type/cup, and a reason', () => {
    const groups = groupQualitySamples(
      [
        sample({
          screen: [
            { label: 'Scr. 18', pct: 45 },
            { label: 'Scr. 17', pct: 53 },
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
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Dunkin')
    expect(text).toContain('Sample: SS · BR-42235/26 (AS 175926)') // stage tag + Wolthers # + seller ref
    expect(text).toContain('Wolthers: 42235/26')
    expect(text).toContain('Seller Ref: 42235')
    expect(text).toContain('Container: MRKU 708.491-7 (ICO 013/0456/0789)')
    expect(text).toContain('Scr. 18 45%')
    expect(text).toContain('Defects: 4')
    expect(text).toContain('Type: OK')
    expect(text).toContain('Cup: FAIL')
    expect(text).toContain('Reason: Excess cup faults.')
  })
  it('renders buyer refs (Sample + Buyer ref) and hides the Wolthers/Seller numbers', () => {
    const groups = groupQualitySamples([sample({})], 'seller')
    const text = buildQualitySummaryText(groups, { audience: 'buyer' })
    expect(text).toContain('Sample: SS · BR-42235/26')
    expect(text).toContain('Buyer Ref: DKN-001')
    expect(text).toContain('Container: MRKU 708.491-7')
    expect(text).not.toContain('Wolthers: 42235/26')
    expect(text).not.toContain('Seller Ref:')
  })
})

describe('Sample cell (seller sample reference sub-line)', () => {
  it('shows the seller sample reference under the Wolthers number when entered', () => {
    const groups = groupQualitySamples([sample({ trackingNumber: 'S-00007/26', exporterSampleNumber: 'AS 9' })], 'qcClient')
    expect(buildQualitySummaryText(groups, { audience: 'seller' })).toContain('Sample: SS · S-00007/26 (AS 9)')
    const html = buildQualitySummaryHtml(groups, { audience: 'seller' })
    expect(html).toContain('S-00007/26')
    expect(html).toContain('AS 9')
  })
  it('omits the sub-line (and never the internal sample_number) when no seller reference was entered', () => {
    const groups = groupQualitySamples([sample({ trackingNumber: 'S-00008/26', exporterSampleNumber: null })], 'qcClient')
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: SS · S-00008/26')
    expect(text).not.toContain('S-00008/26 (')
  })
})

describe('Container, ICO, and stage tag', () => {
  it('renders the stage tag in the Sample cell and the ICO under the container', () => {
    const groups = groupQualitySamples(
      [sample({ trackingNumber: 'S-9/26', sampleType: 'pss', containerNr: 'TCKU 109.779-2', icoNumber: '99/1' })],
      'qcClient',
    )
    const html = buildQualitySummaryHtml(groups, { audience: 'seller' })
    expect(html).toContain('PSS · S-9/26')
    expect(html).toContain('TCKU 109.779-2')
    expect(html).toContain('ICO 99/1')
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: PSS · S-9/26')
    expect(text).toContain('Container: TCKU 109.779-2 (ICO 99/1)')
  })
  it('omits the stage prefix when type is null and shows a dash for a missing container', () => {
    const groups = groupQualitySamples(
      [sample({ trackingNumber: 'S-10/26', sampleType: null, containerNr: null, icoNumber: null, exporterSampleNumber: null })],
      'qcClient',
    )
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: S-10/26')
    expect(text).not.toContain(' · S-10/26')
    expect(text).toContain('Container: —')
  })
})

describe('buildQualitySummaryHtml', () => {
  it('renders a seller table (9 cols) with Wolthers/Seller/Container headers and a colspan reason row', () => {
    const groups = groupQualitySamples(
      [sample({ sampleId: 's2', decision: 'rejected', typeOk: false, cupOk: true, reason: 'Defects over spec.' })],
      'qcClient',
    )
    const html = buildQualitySummaryHtml(groups, { audience: 'seller' })
    expect(html).toContain('<table')
    expect(html).toContain('>Wolthers<')
    expect(html).toContain('>Seller Ref<')
    expect(html).toContain('>Container<')
    expect(html).toContain('REJECTED')
    expect(html).toContain('FAIL')
    expect(html).toContain('colspan="9"')
    expect(html).toContain('Defects over spec.')
  })
  it('renders a buyer table (8 cols) with Buyer ref + Container, and no Wolthers/Seller columns', () => {
    const groups = groupQualitySamples(
      [sample({ sampleId: 's2', decision: 'rejected', reason: 'x' })],
      'seller',
    )
    const html = buildQualitySummaryHtml(groups, { audience: 'buyer' })
    expect(html).toContain('>Buyer Ref<')
    expect(html).toContain('>Container<')
    expect(html).not.toContain('>Wolthers<')
    expect(html).not.toContain('>Seller Ref<')
    expect(html).toContain('colspan="8"')
  })
  it('escapes dynamic values', () => {
    const groups = groupQualitySamples([sample({ trackingNumber: '<b>x</b>' })], 'qcClient')
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
