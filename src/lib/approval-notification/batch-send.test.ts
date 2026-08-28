import { describe, it, expect } from 'vitest'
import {
  getInitials,
  computeSendStatus,
  buildBatchUnits,
  type SendStatusRow,
  type BatchSampleInput,
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

  it('none sent', () => {
    const m = computeSendStatus([], required)
    expect(m.get('s1')).toEqual({ buyerSent: null, sellerSent: null, full: false })
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
    const status = new Map([['s1', { buyerSent: { by: 'A', at: 't' }, sellerSent: null, full: false }]])
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
    const status = new Map([['s1', { buyerSent: { by: 'A', at: 't' }, sellerSent: null, full: false }]])
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