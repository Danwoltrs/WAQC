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
  certUnitKey,
  buildSubContractSummary,
  resolveQualityName,
  type QualitySampleSummary,
} from './quality-summary'

const sample = (over: Partial<QualitySampleSummary>): QualitySampleSummary => ({
  sampleId: 's1',
  sampleContractId: null,
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
  qualityName: null,
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
  // Client-requested format (Rich Coop, 2026-08-28):
  //   "PSS Quality Report / <Shipper> for <Client> / Contract no. <their ref>"
  const richCoop = (over: Partial<QualitySampleSummary>) =>
    sample({
      qcClientName: 'Rich Coop',
      sellerName: 'Expocacer',
      sampleType: 'pss',
      buyerContractNr: 'GB26-JFEXP0613BRANY2',
      sellerContractNr: '26/604',
      wolthersContractNr: '42344/26',
      ...over,
    })

  it('buyer: stage / shipper for client / the buyer\'s own contract reference', () => {
    const groups = groupQualitySamples([richCoop({})], 'seller')
    expect(buildQualitySummarySubject(groups, 'buyer')).toBe(
      'PSS Quality Report / Expocacer for Rich Coop / Contract no. GB26-JFEXP0613BRANY2',
    )
  })

  it('lists every distinct contract once when the batch spans several', () => {
    const groups = groupQualitySamples(
      [
        richCoop({ sampleId: 's1' }),
        richCoop({ sampleId: 's2' }), // same contract → not repeated
        richCoop({ sampleId: 's3', buyerContractNr: 'GB26-JFEXP0615BRANY2', decision: 'rejected' }),
      ],
      'seller',
    )
    expect(buildQualitySummarySubject(groups, 'buyer')).toBe(
      'PSS Quality Report / Expocacer for Rich Coop / Contract nos. GB26-JFEXP0613BRANY2, GB26-JFEXP0615BRANY2',
    )
  })

  it('seller: uses the seller\'s own reference', () => {
    const groups = groupQualitySamples([richCoop({})], 'qcClient')
    expect(buildQualitySummarySubject(groups, 'seller')).toBe(
      'PSS Quality Report / Expocacer for Rich Coop / Contract no. 26/604',
    )
  })

  it('buyer with no buyer ref falls back to the seller ref, then the Wolthers number; TBI counts as blank', () => {
    const noBuyer = groupQualitySamples([richCoop({ buyerContractNr: 'TBI' })], 'seller')
    expect(buildQualitySummarySubject(noBuyer, 'buyer')).toContain('Contract no. 26/604')
    const noRefs = groupQualitySamples([richCoop({ buyerContractNr: null, sellerContractNr: null })], 'seller')
    expect(buildQualitySummarySubject(noRefs, 'buyer')).toContain('Contract no. 42344/26')
    const sellerNoRef = groupQualitySamples([richCoop({ sellerContractNr: '  ' })], 'qcClient')
    expect(buildQualitySummarySubject(sellerNoRef, 'seller')).toContain('Contract no. 42344/26')
  })

  it('names every stage and shipper in the batch', () => {
    const groups = groupQualitySamples(
      [
        richCoop({ sampleId: 's1' }),
        richCoop({ sampleId: 's2', sampleType: 'ss', sellerName: 'Minasul', buyerContractNr: 'GB25-JFMIN0805BRA-8' }),
      ],
      'seller',
    )
    expect(buildQualitySummarySubject(groups, 'buyer')).toBe(
      'PSS + SS Quality Report / Expocacer & Minasul for Rich Coop / Contract nos. GB26-JFEXP0613BRANY2, GB25-JFMIN0805BRA-8',
    )
  })

  it('drops the segments it cannot fill instead of printing placeholders', () => {
    const bare = groupQualitySamples(
      [richCoop({ sellerName: null, sampleType: null, buyerContractNr: null, sellerContractNr: null, wolthersContractNr: null })],
      'seller',
    )
    expect(buildQualitySummarySubject(bare, 'buyer')).toBe('Quality Report for Rich Coop')
    const noClient = groupQualitySamples([richCoop({ qcClientName: null })], 'seller')
    expect(buildQualitySummarySubject(noClient, 'buyer')).toBe(
      'PSS Quality Report / Expocacer / Contract no. GB26-JFEXP0613BRANY2',
    )
  })
})

describe('certUnitKey', () => {
  it('a mother certificate keys on the sample id alone (legacy-compatible)', () => {
    expect(certUnitKey('s1')).toBe('s1')
    expect(certUnitKey('s1', null)).toBe('s1')
  })
  it('a sub-contract certificate gets its own key', () => {
    expect(certUnitKey('s1', 'sub1')).toBe('s1:sub1')
    expect(certUnitKey('s1', 'sub1')).not.toBe(certUnitKey('s1', 'sub2'))
  })
})

describe('buildSubContractSummary', () => {
  const mother = sample({
    certificateNumber: 'SAG-011791/26',
    wolthersContractNr: '41912/26',
    buyerContractNr: 'IR0007545-1',
    containerNr: 'MSKU 1',
    icoNumber: '013/0456/0789',
    screen: [{ label: 'Scr. 17', pct: 12 }],
    defects: 222,
  })

  it('takes its OWN references from the sub-contract row', () => {
    const sub = buildSubContractSummary(mother, {
      id: 'sub1',
      wolthers_contract_nr: '41913/26',
      buyer_contract_nr: 'IR0007546-1',
      container_nr: 'MSKU 2',
      ico_number: '013/0456/0790',
      supplier_contract_nr: null,
      seller_contract_nr: '9911',
      shipper_contract_nr: null,
      exporter_sample_number: 'AS 229426',
    }, 'SAG-011792/26', 'Ahold')
    expect(sub.sampleContractId).toBe('sub1')
    expect(sub.certificateNumber).toBe('SAG-011792/26')
    expect(sub.wolthersContractNr).toBe('41913/26')
    expect(sub.buyerContractNr).toBe('IR0007546-1')
    expect(sub.containerNr).toBe('MSKU 2')
    expect(sub.icoNumber).toBe('013/0456/0790')
    expect(sub.sellerContractNr).toBe('9911')
    expect(sub.exporterSampleNumber).toBe('AS 229426')
    expect(sub.qcClientName).toBe('Ahold')
  })

  it('inherits the mother sample quality assessment (splits share one lab result)', () => {
    const sub = buildSubContractSummary(mother, { id: 'sub1' }, 'SAG-011792/26', null)
    expect(sub.screen).toEqual(mother.screen)
    expect(sub.defects).toBe(222)
    expect(sub.typeOk).toBe(mother.typeOk)
    expect(sub.cupOk).toBe(mother.cupOk)
    expect(sub.decision).toBe(mother.decision)
    expect(sub.sampleId).toBe(mother.sampleId)
  })

  it('falls back to the mother for container / ICO / Wolthers number only', () => {
    const sub = buildSubContractSummary(mother, { id: 'sub1' }, 'SAG-011792/26', null)
    expect(sub.containerNr).toBe('MSKU 1')
    expect(sub.icoNumber).toBe('013/0456/0789')
    expect(sub.wolthersContractNr).toBe('41912/26')
    expect(sub.qcClientName).toBe(mother.qcClientName)
  })

  // Printing the mother's buyer reference on a split would name the wrong
  // contract, so the certificate PDF has no such fallback — nor does this.
  it('never borrows the mother buyer reference for a split', () => {
    const sub = buildSubContractSummary(mother, { id: 'sub1', buyer_contract_nr: '  ' }, 'SAG-011792/26', null)
    expect(sub.buyerContractNr).toBeNull()
  })

  // sys.wolthers is the source of truth and the certificate PDF reads it
  // through at render time; the email table must not print a stale copy.
  it('prefers the split sys-contract references over the stored ones', () => {
    const sub = buildSubContractSummary(
      mother,
      { id: 'sub1', buyer_contract_nr: 'STALE-BUYER', supplier_contract_nr: 'STALE-SELLER' },
      'SAG-011792/26',
      null,
      { seller_reference: '4155261412', buyer_reference: 'IR0007546-1' },
    )
    expect(sub.sellerContractNr).toBe('4155261412')
    expect(sub.buyerContractNr).toBe('IR0007546-1')
  })

  // The Ahold case: staff corrected a split's buyer ref in QC while sys kept the old
  // number. A pinned reference must beat the read-through, or the email table and the
  // attached certificate print a number nobody in QC ever entered.
  it('prints a hand-pinned split reference instead of the sys value', () => {
    const sub = buildSubContractSummary(
      mother,
      {
        id: 'sub1',
        buyer_contract_nr: 'IR0007524-1',
        supplier_contract_nr: '4155261412',
        manual_ref_fields: ['buyer_contract_nr'],
      },
      'SAG-011846/26',
      null,
      { seller_reference: '4155261412', buyer_reference: 'IR0007525-1' },
    )
    expect(sub.buyerContractNr).toBe('IR0007524-1')
    // ...while an unpinned reference on the same row still follows sys.
    expect(sub.sellerContractNr).toBe('4155261412')
  })

  it('keeps the stored split reference when sys has none', () => {
    const sub = buildSubContractSummary(
      mother,
      { id: 'sub1', buyer_contract_nr: 'IR0007546-1', supplier_contract_nr: '4155261412' },
      'SAG-011792/26',
      null,
      { seller_reference: null, buyer_reference: null },
    )
    expect(sub.sellerContractNr).toBe('4155261412')
    expect(sub.buyerContractNr).toBe('IR0007546-1')
  })
})

describe('screen line collapsing', () => {
  // The reported Grinders distribution: 7 sieves is too tall for the table.
  it('condenses a 7-sieve Grinders spread to "14 up / 13 / 12"', () => {
    const rows = screenRowsFromGrams({ '18': 6, '17': 12, '16': 12, '15': 13, '14': 14, '13': 28, '12': 15 })
    expect(rows).toEqual([
      { label: 'Scr. 14 up', pct: 57 },
      { label: 'Scr. 13', pct: 28 },
      { label: 'Scr. 12', pct: 15 },
    ])
  })

  it('always keeps the two finest sieves explicit', () => {
    const rows = screenRowsFromGrams({ '20': 25, '19': 25, '18': 25, '17': 25 })
    expect(rows).toEqual([
      { label: 'Scr. 19 up', pct: 50 },
      { label: 'Scr. 18', pct: 25 },
      { label: 'Scr. 17', pct: 25 },
    ])
  })

  it('leaves three or fewer sieves untouched', () => {
    expect(screenRowsFromGrams({ '17': 50, '16': 30, '15': 20 })).toEqual([
      { label: 'Scr. 17', pct: 50 },
      { label: 'Scr. 16', pct: 30 },
      { label: 'Scr. 15', pct: 20 },
    ])
  })

  it('rounds the aggregate once instead of summing rounded parts', () => {
    // Raw shares 16.6% each: summing three rounded 17s would print 51, not 50.
    const rows = screenRowsFromGrams({ '18': 1, '17': 1, '16': 1, '15': 1.5, '14': 1.5 })
    expect(rows[0]).toEqual({ label: 'Scr. 16 up', pct: 50 })
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBe(100)
  })

  it('keeps the pan out of the lines but inside the percentage base', () => {
    const rows = screenRowsFromGrams({ '18': 10, '17': 10, '16': 10, '15': 10, '14': 10, pan: 50 })
    expect(rows.map((r) => r.label)).toEqual(['Scr. 16 up', 'Scr. 15', 'Scr. 14'])
    expect(rows[0].pct).toBe(30)
  })

  it('does not collapse legacy free-text sieve keys', () => {
    const rows = screenRowsFromGrams({ '18': 20, '17': 20, '16': 20, Peaberry: 40 })
    expect(rows.length).toBe(4)
  })
})

describe('resolveQualityName', () => {
  it('prefers the sample override over the spec', () => {
    expect(resolveQualityName('Custom Santos 17/18', 'Ahold Standard', 'Brazil Base')).toBe('Custom Santos 17/18')
  })
  it('falls back to the client quality custom name', () => {
    expect(resolveQualityName(null, 'Ahold Standard', 'Brazil Base')).toBe('Ahold Standard')
  })
  it('falls back to the template name', () => {
    expect(resolveQualityName('  ', '', 'Brazil Base')).toBe('Brazil Base')
  })
  it('returns null when nothing is set', () => {
    expect(resolveQualityName(null, null, null)).toBeNull()
  })
})

describe('quality column', () => {
  const s = sample({ qualityName: 'Brazil Santos 17/18 FC', decision: 'approved' })

  it('renders a Quality header and value in the HTML table', () => {
    const html = buildQualitySummaryHtml([{ heading: 'Ahold', samples: [s] }], { audience: 'buyer' })
    expect(html).toContain('>Quality<')
    expect(html).toContain('Brazil Santos 17/18 FC')
  })
  it('renders the quality in the plain-text form', () => {
    const text = buildQualitySummaryText([{ heading: 'Ahold', samples: [s] }], { audience: 'buyer' })
    expect(text).toContain('Quality: Brazil Santos 17/18 FC')
  })
  it('renders an em dash when no quality is known', () => {
    const html = buildQualitySummaryHtml(
      [{ heading: 'Ahold', samples: [sample({ qualityName: null })] }],
      { audience: 'seller' },
    )
    expect(html).toContain('>Quality<')
  })
  it('a split inherits the mother quality', () => {
    const split = buildSubContractSummary(s, { id: 'sc1' }, 'BR-2/26', 'Ahold', null)
    expect(split.qualityName).toBe('Brazil Santos 17/18 FC')
  })
})
