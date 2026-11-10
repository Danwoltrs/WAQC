import { describe, it, expect } from 'vitest'
import {
  getInitials,
  computeSendStatus,
  sentFor,
  buildBatchUnits,
  attachedSampleIds,
  composerPosition,
  compareQcClientName,
  type SendStatusRow,
  type BatchSampleInput,
  type BatchUnit,
} from './batch-send'
import type { PanelPrefill, RecipientChip } from './types'
import type { BatchUnitLine } from './batch-approval-template'

const chip = (email: string): RecipientChip => ({ email, name: null, nickname: null, isGroupMailbox: false })
const panel = (greeting: string, to: string[]): PanelPrefill => ({
  greeting,
  to: to.map(chip),
  cc: [chip('qualitycontrol@wolthers.com')],
})
type LineCore = Omit<BatchUnitLine, 'reference' | 'date'>
const line = (over: Partial<LineCore> = {}): LineCore => ({
  containerNr: 'C1',
  certNumber: 'CERT-1',
  contractNumber: '100/26',
  decision: 'approved',
  reason: null,
  ...over,
})

describe('getInitials', () => {
  it('first two name parts', () => expect(getInitials('Anderson Nunes dos Santos')).toBe('AN'))
  it('single name', () => expect(getInitials('Daniel')).toBe('D'))
  it('empty', () => expect(getInitials('')).toBe('—'))
})

describe('computeSendStatus', () => {
  const required = new Map([['s1', { buyer: true, seller: true }]])

  it('tracks each party on its own, and full needs every required one', () => {
    const rows: SendStatusRow[] = [{ sampleId: 's1', side: 'buyer', sentBy: 'A', sentAt: 't' }]
    const m = computeSendStatus(rows, new Map([['s1', { buyer: true, seller: false, importer: true }]]))
    expect(m.get('s1')).toMatchObject({ importerSent: null, full: false })
    expect(sentFor(m.get('s1'), 'buyer')?.by).toBe('A')
    expect(sentFor(m.get('s1'), 'importer')).toBeNull()
    expect(sentFor(undefined, 'roaster')).toBeNull()
  })

  it('full once the importer is sent too', () => {
    const rows: SendStatusRow[] = [
      { sampleId: 's1', side: 'buyer', sentBy: 'A', sentAt: 't' },
      { sampleId: 's1', side: 'importer', sentBy: 'B', sentAt: 't' },
    ]
    const m = computeSendStatus(rows, new Map([['s1', { buyer: true, seller: false, importer: true }]]))
    expect(m.get('s1')?.full).toBe(true)
  })

  it('none sent', () => {
    const m = computeSendStatus([], required)
    expect(m.get('s1')).toEqual({ buyerSent: null, sellerSent: null, importerSent: null, roasterSent: null, full: false })
  })

  it('buyer only — not full', () => {
    const rows: SendStatusRow[] = [{ sampleId: 's1', side: 'buyer', sentBy: 'Anderson N', sentAt: '2026-06-18T10:00:00Z' }]
    const m = computeSendStatus(rows, required)
    expect(m.get('s1')?.buyerSent).toEqual({ by: 'Anderson N', at: '2026-06-18T10:00:00Z' })
    expect(m.get('s1')?.sellerSent).toBeNull()
    expect(m.get('s1')?.full).toBe(false)
  })

  it('both sides sent — full', () => {
    const rows: SendStatusRow[] = [
      { sampleId: 's1', side: 'buyer', sentBy: 'A', sentAt: '2026-06-18T10:00:00Z' },
      { sampleId: 's1', side: 'seller', sentBy: 'B', sentAt: '2026-06-18T11:00:00Z' },
    ]
    expect(computeSendStatus(rows, required).get('s1')?.full).toBe(true)
  })

  it('keeps the most recent send per side', () => {
    const rows: SendStatusRow[] = [
      { sampleId: 's1', side: 'buyer', sentBy: 'old', sentAt: '2026-06-18T09:00:00Z' },
      { sampleId: 's1', side: 'buyer', sentBy: 'new', sentAt: '2026-06-18T12:00:00Z' },
    ]
    expect(computeSendStatus(rows, required).get('s1')?.buyerSent?.by).toBe('new')
  })

  it('full when only one side is required and it is sent', () => {
    const req = new Map([['s2', { buyer: true, seller: false }]])
    const rows: SendStatusRow[] = [{ sampleId: 's2', side: 'buyer', sentBy: 'A', sentAt: '2026-06-18T10:00:00Z' }]
    expect(computeSendStatus(rows, req).get('s2')?.full).toBe(true)
  })

  // A lab unit and its contract siblings are SEPARATE samples with separate
  // certificates, tracked separately: sending the lab unit's certificate must
  // not mark a sibling's as sent, and vice versa.
  it('tracks a sibling certificate independently of its lab unit', () => {
    const req = new Map([
      ['s1', { buyer: true, seller: false }],
      ['s2', { buyer: true, seller: false }],
    ])
    const rows: SendStatusRow[] = [{ sampleId: 's1', side: 'buyer', sentBy: 'A', sentAt: '2026-06-18T10:00:00Z' }]
    const m = computeSendStatus(rows, req)
    expect(m.get('s1')?.buyerSent).not.toBeNull()
    expect(m.get('s2')?.buyerSent).toBeNull()
  })

  it('a send logged for a sibling marks only that sibling', () => {
    const req = new Map([
      ['s1', { buyer: true, seller: false }],
      ['s2', { buyer: true, seller: false }],
    ])
    const rows: SendStatusRow[] = [
      { sampleId: 's2', side: 'buyer', sentBy: 'A', sentAt: '2026-06-18T10:00:00Z' },
    ]
    const m = computeSendStatus(rows, req)
    expect(m.get('s2')?.buyerSent).not.toBeNull()
    expect(m.get('s1')?.buyerSent).toBeNull()
  })
})

describe('buildBatchUnits', () => {
  const panels = new Map<string, PanelPrefill>([
    ['buyerZ', panel('Zeta team', ['z@buyer.com'])],
    ['buyerA', panel('Alpha team', ['a@buyer.com'])],
    ['sellerS', panel('Seller team', ['s@seller.com'])],
  ])
  const names = new Map([
    ['buyerZ', 'Zeta Importers'],
    ['buyerA', 'Alpha Importers'],
    ['sellerS', 'Seller Co'],
  ])

  const base = { buyerReference: null, sellerReference: null, date: null }
  const samples: BatchSampleInput[] = [
    { sampleId: 's1', buyerId: 'buyerZ', sellerId: 'sellerS', ...base, line: line({ containerNr: 'C1' }) },
    { sampleId: 's2', buyerId: 'buyerA', sellerId: 'sellerS', ...base, line: line({ containerNr: 'C2', decision: 'rejected', reason: 'phenol' }) },
  ]

  it('emits all buyer units (sorted by name) before seller units', () => {
    const units = buildBatchUnits(samples, new Map(), panels, names)
    expect(units.map((u) => `${u.side}:${u.companyName}`)).toEqual([
      'buyer:Alpha Importers',
      'buyer:Zeta Importers',
      'seller:Seller Co',
    ])
  })

  it('seller unit groups both samples for the shared seller', () => {
    const units = buildBatchUnits(samples, new Map(), panels, names)
    const seller = units.find((u) => u.side === 'seller')!
    expect(seller.samples.map((s) => s.sampleId).sort()).toEqual(['s1', 's2'])
    expect(seller.to).toEqual(['s@seller.com'])
  })

  it('drops a (sample, side) pair already sent', () => {
    const status = new Map([['s1', { buyerSent: { by: 'A', at: 't' }, sellerSent: null, importerSent: null, roasterSent: null, full: false }]])
    const units = buildBatchUnits(samples, status, panels, names)
    // s1's buyer side is sent → buyerZ has no remaining samples → no Zeta unit.
    expect(units.find((u) => u.companyId === 'buyerZ')).toBeUndefined()
    // Seller side of s1 is still pending → present.
    expect(units.find((u) => u.side === 'seller')?.samples.some((s) => s.sampleId === 's1')).toBe(true)
  })

  it('emits a company with no resolvable TO recipient, flagged needsRecipients', () => {
    const noTo = new Map(panels)
    noTo.set('buyerA', panel('Alpha team', []))
    const units = buildBatchUnits(samples, new Map(), noTo, names)
    const alpha = units.find((u) => u.companyId === 'buyerA')
    expect(alpha).toBeDefined()
    expect(alpha!.to).toEqual([])
    expect(alpha!.needsRecipients).toBe(true)
    // It still carries its samples and a greeting so the composer can render it.
    expect(alpha!.samples.map((s) => s.sampleId)).toEqual(['s2'])
    expect(alpha!.greeting).toBe('Alpha team')
  })

  it('flags units with recipients as needsRecipients=false', () => {
    const units = buildBatchUnits(samples, new Map(), panels, names)
    expect(units.every((u) => u.needsRecipients === false)).toBe(true)
  })

  it('skips a side with no company', () => {
    const orphan: BatchSampleInput[] = [{ sampleId: 's9', buyerId: 'buyerZ', sellerId: null, buyerReference: null, sellerReference: null, date: null, line: line() }]
    const units = buildBatchUnits(orphan, new Map(), panels, names)
    expect(units.every((u) => u.side === 'buyer')).toBe(true)
  })

  // One physical sample covering two contracts is two samples (lab unit s1 +
  // sibling s2), each with its own certificate; both ride in the same unit.
  const withSibling: BatchSampleInput[] = [
    { sampleId: 's1', buyerId: 'buyerZ', sellerId: 'sellerS', ...base, line: line({ certNumber: 'SAG-011791/26' }) },
    { sampleId: 's2', buyerId: 'buyerZ', sellerId: 'sellerS', ...base, line: line({ certNumber: 'SAG-011792/26' }) },
  ]

  it('keeps a lab unit and its sibling certificate as separate lines in one unit', () => {
    const units = buildBatchUnits(withSibling, new Map(), panels, names)
    const buyer = units.find((u) => u.side === 'buyer')!
    expect(buyer.samples.map((s) => s.certNumber)).toEqual(['SAG-011791/26', 'SAG-011792/26'])
    expect(buyer.samples.map((s) => s.sampleId)).toEqual(['s1', 's2'])
  })

  it('dropping a sent lab-unit certificate keeps its unsent sibling', () => {
    const status = new Map([['s1', { buyerSent: { by: 'A', at: 't' }, sellerSent: null, importerSent: null, roasterSent: null, full: false }]])
    const units = buildBatchUnits(withSibling, status, panels, names)
    const buyer = units.find((u) => u.side === 'buyer')!
    expect(buyer.samples.map((s) => s.certNumber)).toEqual(['SAG-011792/26'])
  })

  it('greets "all" when the company has no named contact', () => {
    const noTo = new Map(panels)
    noTo.set('buyerA', { greeting: 'all', to: [], cc: [] })
    const units = buildBatchUnits(samples, new Map(), noTo, names)
    expect(units.find((u) => u.companyId === 'buyerA')!.greeting).toBe('all')
  })

  it('falls back to "all" (never "<company> team") when a company has no panel', () => {
    const units = buildBatchUnits(samples, new Map(), new Map(), names)
    expect(units.every((u) => u.greeting === 'all')).toBe(true)
  })
})

describe('buildBatchUnits: one email per party', () => {
  const after = { date: '2026-12-01', buyerReference: null, sellerReference: null }
  const s = (over: Partial<BatchSampleInput>): BatchSampleInput => ({ sampleId: 's1', buyerId: 'c1', sellerId: 'x', ...after, line: line(), ...over })
  const order = (us: BatchUnit[]) => us.map((u) => `${u.side}:${u.companyId}`)

  it('orders clients, importers, roasters, sellers', () => {
    expect(order(buildBatchUnits([s({ importerId: 'i1', roasterId: 'r1', qcClientId: 'c1' })], new Map(), new Map(), new Map())))
      .toEqual(['buyer:c1', 'importer:i1', 'roaster:r1', 'seller:x'])
  })
  it('splits a seller by QC client, one email each, a lot with no client on its own', () => {
    const units = buildBatchUnits([s({ sampleId: 'a', qcClientId: 'c1' }), s({ sampleId: 'b', qcClientId: 'c2' }), s({ sampleId: 'n', qcClientId: null })], new Map(), new Map(), new Map([['c1', 'Blaser'], ['c2', 'Ahold']]), { parties: new Set(['seller']) })
    expect(units.map((u) => u.samples.map((l) => l.sampleId))).toEqual([['n'], ['b'], ['a']])
    expect(units.map((u) => u.qcClientName)).toEqual([null, 'Ahold', 'Blaser'])
  })
  it('compareQcClientName: no client first, by name, and equal names (both null too) tie', () => {
    expect(compareQcClientName(null, null)).toBe(0)
    expect(compareQcClientName('Ahold', 'Ahold')).toBe(0)
    expect(compareQcClientName(null, 'Ahold')).toBeLessThan(0)
    expect(compareQcClientName('Ahold', null)).toBeGreaterThan(0)
    expect(compareQcClientName('Ahold', 'Blaser')).toBeLessThan(0)
  })
  it('two companies with the same name keep their order', () => {
    const units = buildBatchUnits([s({ sampleId: 'a', buyerId: 'z1' }), s({ sampleId: 'b', buyerId: 'z2' })], new Map(), new Map(), new Map([['z1', 'Same'], ['z2', 'Same']]), { parties: new Set(['buyer']) })
    expect(order(units)).toEqual(['buyer:z1', 'buyer:z2'])
  })
  it('client on one certificate and importer on another: two emails', () => {
    const units = buildBatchUnits([s({ sampleId: 'a', buyerId: 'b' }), s({ sampleId: 'c', buyerId: 'z', importerId: 'b' })], new Map(), new Map(), new Map(), { parties: new Set(['buyer', 'importer']) })
    expect(order(units)).toEqual(['buyer:b', 'buyer:z', 'importer:b'])
  })
  it('attach defaults per certificate: the client, or anyone when shared with all', () => {
    const units = buildBatchUnits([s({ sampleId: 'a', importerId: 'i' }), s({ sampleId: 'd', importerId: 'i', shareWithAll: true })], new Map(), new Map(), new Map())
    expect(units.find((u) => u.side === 'buyer')!.samples.every((l) => l.attach)).toBe(true)
    expect(units.find((u) => u.side === 'importer')!.samples.map((l) => [l.sampleId, l.attach])).toEqual([['a', false], ['d', true]])
  })
  it('skips importers on older certificates unless asked, and only the chosen parties', () => {
    const old = s({ date: '2026-10-01', importerId: 'i' })
    expect(order(buildBatchUnits([old], new Map(), new Map(), new Map(), { parties: new Set(['buyer', 'importer']) }))).toEqual(['buyer:c1'])
    expect(order(buildBatchUnits([old], new Map(), new Map(), new Map(), { parties: new Set(['buyer', 'importer']), includePreGoLive: true }))).toEqual(['buyer:c1', 'importer:i'])
  })
  it('a party with no contact is flagged and does not stop the others', () => {
    const units = buildBatchUnits([s({ importerId: 'i' })], new Map(), new Map([['c1', panel('all', ['a@b.c'])]]), new Map())
    expect(units.find((u) => u.side === 'importer')!.needsRecipients).toBe(true)
    expect(units.find((u) => u.side === 'buyer')!.needsRecipients).toBe(false)
  })
})

describe('composer helpers', () => {
  it('attachedSampleIds follows the override, else each certificate', () => {
    const u = { attachCertificates: undefined, samples: [{ sampleId: 'a', attach: true }, { sampleId: 'b', attach: false }] } as unknown as BatchUnit
    expect(attachedSampleIds(u)).toEqual(['a'])
    expect(attachedSampleIds({ ...u, attachCertificates: true })).toEqual(['a', 'b'])
    expect(attachedSampleIds({ ...u, attachCertificates: false })).toEqual([])
  })

  it('composerPosition counts within the party and announces a change', () => {
    const us = [{ side: 'buyer' }, { side: 'importer' }, { side: 'importer' }, { side: 'seller' }] as BatchUnit[]
    expect(composerPosition(us, 0)).toEqual({ label: 'Client 1 of 1', divider: null })
    expect(composerPosition(us, 1)).toEqual({ label: 'Importer 1 of 2', divider: 'Now sending to IMPORTERS' })
    expect(composerPosition(us, 2)).toEqual({ label: 'Importer 2 of 2', divider: null })
    expect(composerPosition(us, 3)).toEqual({ label: 'Seller 1 of 1', divider: 'Now sending to SELLERS' })
  })
})
