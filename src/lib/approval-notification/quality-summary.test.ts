import { describe, it, expect } from 'vitest'
import {
  screenRowsFromGrams,
  totalDefects,
  classifyStageResults,
  groupQualitySamples,
  buildQualitySummaryText,
  buildQualitySummaryHtml,
  buildQualitySummarySubject,
  buildRejectionReason,
  compactDefectViolations,
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
  certificateNumber: null,
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

describe('buildRejectionReason', () => {
  it('names the cup faults/taints concisely as name (intensity)', () => {
    const r = buildRejectionReason({
      violations: [],
      resolvedDefects: { faults: [{ name: 'Hard (riado)', intensity: 3 }], taints: [{ name: 'Fermented' }] },
      cuppingComment: '',
      gradingComment: '',
    })
    expect(r).toContain('Hard (riado) (3)')
    expect(r).toContain('Fermented')
    expect(r).not.toContain('intensity')
    expect(r).not.toContain('Cup faults:')
  })
  it('keeps spec violations but drops the generic taint/fault counts already named', () => {
    const r = buildRejectionReason({
      violations: ['Cupping faults: 1 exceeds limit (0)', 'Flavor: 5.50 is below minimum (6)'],
      resolvedDefects: { faults: [{ name: 'Hard (riado)', intensity: 3 }] },
      cuppingComment: '',
      gradingComment: '',
    })
    expect(r).toContain('Hard (riado) (3)')
    expect(r).toContain('Flavor: 5.50 is below minimum (6)')
    expect(r).not.toContain('Cupping faults: 1')
  })
  it('keeps the generic taint/fault counts when there are no named defects', () => {
    const r = buildRejectionReason({
      violations: ['Cupping faults: 1 exceeds limit (0)'],
      resolvedDefects: null,
      cuppingComment: '',
      gradingComment: '',
    })
    expect(r).toContain('Cupping faults: 1 exceeds limit (0)')
  })
  it('appends the free-text grading/cupping note and returns null when empty', () => {
    expect(
      buildRejectionReason({ violations: [], resolvedDefects: null, cuppingComment: 'Strong phenolic note.', gradingComment: '' }),
    ).toBe('Strong phenolic note.')
    expect(
      buildRejectionReason({ violations: [], resolvedDefects: null, cuppingComment: '', gradingComment: '' }),
    ).toBeNull()
  })
  it('collapses redundant defect-count lines to one terse "Defects: N (max M)"', () => {
    const r = buildRejectionReason({
      violations: ['Secondary defects: 45 exceeds limit (30)', 'Total defects: 45 exceeds limit (30)'],
      resolvedDefects: null,
      cuppingComment: '',
      gradingComment: '',
    })
    expect(r).toBe('Defects: 45 (max 30)')
  })
})

describe('compactDefectViolations', () => {
  it('prefers the Total breach and drops the redundant Secondary duplicate', () => {
    expect(
      compactDefectViolations([
        'Secondary defects: 45 exceeds limit (30)',
        'Total defects: 45 exceeds limit (30)',
      ]),
    ).toEqual(['Defects: 45 (max 30)'])
  })
  it('shortens a single defect line and leaves non-defect violations untouched, in place', () => {
    expect(
      compactDefectViolations([
        'Flavor: 5.50 is below minimum (6)',
        'Total defects: 45 exceeds limit (30)',
        'Moisture: 13% exceeds maximum (12%)',
      ]),
    ).toEqual([
      'Flavor: 5.50 is below minimum (6)',
      'Defects: 45 (max 30)',
      'Moisture: 13% exceeds maximum (12%)',
    ])
  })
  it('keeps distinct primary/secondary breaches when there is no Total line', () => {
    expect(
      compactDefectViolations([
        'Primary defects: 16 exceeds limit (15)',
        'Secondary defects: 31 exceeds limit (30)',
      ]),
    ).toEqual(['Defects: 16 (max 15)', 'Defects: 31 (max 30)'])
  })
  it('passes through when there are no defect-count violations', () => {
    expect(compactDefectViolations(['Flavor: 5.50 is below minimum (6)'])).toEqual([
      'Flavor: 5.50 is below minimum (6)',
    ])
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
    expect(text).toContain('Sample: SS · AS 175926') // stage tag + seller/shipper sample ref (never the internal lab #)
    expect(text).not.toContain('BR-42235/26')
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
    expect(text).toContain('Sample: SS · AS 175926')
    expect(text).toContain('Buyer Ref: DKN-001')
    expect(text).toContain('Container: MRKU 708.491-7')
    expect(text).not.toContain('Wolthers: 42235/26')
    expect(text).not.toContain('Seller Ref:')
  })
})

describe('Sample cell (seller/shipper sample reference)', () => {
  it('shows the seller/shipper sample reference as the Sample value when entered', () => {
    const groups = groupQualitySamples([sample({ exporterSampleNumber: 'AS 9' })], 'qcClient')
    expect(buildQualitySummaryText(groups, { audience: 'seller' })).toContain('Sample: SS · AS 9')
    const html = buildQualitySummaryHtml(groups, { audience: 'seller' })
    expect(html).toContain('AS 9')
  })
  it('falls back to the certificate number (never the internal lab number) when no seller reference was entered', () => {
    const groups = groupQualitySamples(
      [sample({ exporterSampleNumber: null, certificateNumber: 'BR-037065/26' })],
      'qcClient',
    )
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: SS · BR-037065/26')
  })
  it('prefers the seller reference over the certificate number when both exist', () => {
    const groups = groupQualitySamples(
      [sample({ exporterSampleNumber: 'AS 9', certificateNumber: 'BR-037065/26' })],
      'qcClient',
    )
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: SS · AS 9')
    expect(text).not.toContain('BR-037065/26')
  })
  it('falls back to the stage tag when neither a seller reference nor a certificate exists', () => {
    const groups = groupQualitySamples([sample({ exporterSampleNumber: null, certificateNumber: null })], 'qcClient')
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: SS')
    expect(text).not.toContain('SS · ') // no reference appended when none entered
  })
  it('shows the reference without a stage prefix when the type is null', () => {
    const groups = groupQualitySamples([sample({ sampleType: null, exporterSampleNumber: 'AS 9' })], 'qcClient')
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: AS 9')
    expect(text).not.toContain('· AS 9')
  })
})

describe('Container, ICO, and stage tag', () => {
  it('renders the stage tag in the Sample cell and the ICO under the container', () => {
    const groups = groupQualitySamples(
      [sample({ sampleType: 'pss', exporterSampleNumber: 'AS 9', containerNr: 'TCKU 109.779-2', icoNumber: '99/1' })],
      'qcClient',
    )
    const html = buildQualitySummaryHtml(groups, { audience: 'seller' })
    expect(html).toContain('PSS · AS 9')
    expect(html).toContain('TCKU 109.779-2')
    expect(html).toContain('ICO 99/1')
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: PSS · AS 9')
    expect(text).toContain('Container: TCKU 109.779-2 (ICO 99/1)')
  })
  it('shows a dash when neither stage nor reference is present, and a dash for a missing container', () => {
    const groups = groupQualitySamples(
      [sample({ sampleType: null, containerNr: null, icoNumber: null, exporterSampleNumber: null })],
      'qcClient',
    )
    const text = buildQualitySummaryText(groups, { audience: 'seller' })
    expect(text).toContain('Sample: —')
    expect(text).toContain('Container: —')
  })
})

describe('buildQualitySummaryHtml', () => {
  it('renders a seller table with Wolthers/Seller/Container headers and the reason under REJECTED', () => {
    const groups = groupQualitySamples(
      [sample({ sampleId: 's2', decision: 'rejected', typeOk: false, cupOk: true, reason: 'Defects over spec.' })],
      'qcClient',
    )
    const html = buildQualitySummaryHtml(groups, { audience: 'seller' })
    expect(html).toContain('<table')
    expect(html).toContain('>Wolthers<')
    expect(html).toContain('>Seller Ref<')
    expect(html).toContain('>Container<')
    expect(html).toContain('FAIL')
    // Reason sits in the Result cell directly under REJECTED — not a separate
    // full-width row and without a "Reason:" label.
    expect(html).toContain('REJECTED</span><div')
    expect(html).toContain('Defects over spec.')
    expect(html).not.toContain('Reason:')
    expect(html).not.toContain('colspan')
  })
  it('renders a buyer table with Buyer ref + Container and no Wolthers/Seller columns', () => {
    const groups = groupQualitySamples(
      [sample({ sampleId: 's2', decision: 'rejected', reason: 'Out of spec.' })],
      'seller',
    )
    const html = buildQualitySummaryHtml(groups, { audience: 'buyer' })
    expect(html).toContain('>Buyer Ref<')
    expect(html).toContain('>Container<')
    expect(html).not.toContain('>Wolthers<')
    expect(html).not.toContain('>Seller Ref<')
    expect(html).toContain('REJECTED</span><div')
    expect(html).toContain('Out of spec.')
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
