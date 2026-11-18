import { describe, it, expect } from 'vitest'
import {
  buildQualityCoverNote,
  buildQualitySummaryHtml,
  buildQualitySummaryText,
  sieveColumns,
  type QualitySampleSummary,
  type QualityScreenRow,
} from './quality-summary-render'
import type { SellerRequests } from '@/lib/seller-requests/types'

const scr = (key: string, pct: number): QualityScreenRow => ({ key, label: key, pct, isPan: false, sortKey: Number(key) })
const free = (key: string, pct: number): QualityScreenRow => ({ key, label: key, pct, isPan: false, sortKey: -Infinity })
const pan = (pct: number): QualityScreenRow => ({ key: 'pan', label: 'pan', pct, isPan: true, sortKey: -Infinity })

const sample = (over: Partial<QualitySampleSummary>): QualitySampleSummary => ({
  sampleId: 's1',
  qcClientName: 'Dunkin',
  sellerName: 'EISA',
  exporterSampleNumber: 'AS 175926',
  sellerContractNr: '42235',
  wolthersContractNr: '42235/26',
  buyerContractNr: 'DKN-001',
  certificateNumber: 'SAG-011895/26',
  containerNr: 'MRKU 708.491-7',
  icoNumber: '013/0456/0789',
  sampleType: 'pss',
  qualityName: 'Santos 17/18',
  screen: [scr('18', 30), scr('17', 60), pan(10)],
  defects: 4,
  typeOk: true,
  cupOk: true,
  decision: 'approved',
  reason: null,
  sellerComment: null,
  ...over,
})
const groupOf = (samples: QualitySampleSummary[]) => [{ heading: 'Dunkin', samples }]

const requests: Record<string, SellerRequests> = {
  s1: {
    buyerSample: {
      companyId: 'c', companyName: 'Dunkin Roasters', savedAddressId: null, lines: ['1 Main St'], country: 'US',
      recipientName: null, attention: null, phone: null, instructions: null,
    },
    stuffing: true, setBy: null, setAt: null,
  },
}

describe('sieveColumns', () => {
  it('union of sieves across a group', () => {
    const a = sample({ sampleId: 'a', screen: [18, 17, 16, 15, 14, 13, 12].map((n) => scr(String(n), 10)).concat([pan(30)] as never) })
    const b = sample({ sampleId: 'b', screen: [scr('17', 20), scr('16', 20), scr('15', 20), scr('14', 20), scr('13', 10), free('Peneira grossa', 10)] })
    const cols = sieveColumns([a, b], 'seller')
    expect(cols.map((c) => c.label)).toEqual(['18', '17', '16', '15', '14', '13', '12', 'Peneira grossa', 'pan'])
    expect(cols[cols.length - 1].isPan).toBe(true)
    const html = buildQualitySummaryHtml(groupOf([a, b]), { audience: 'seller' })
    expect(html).toContain('>Pan<')
    // B has no 18 column value
    const bRow = html.split('<tr>').find((r) => r.includes('Santos') && r.includes('>20.0<'))!
    expect(bRow).toContain('>—</td>')
  })
  it('uses the issued screens for a buyer when present', () => {
    const s = sample({ screen: [scr('18', 27)], issuedScreen: [scr('18', 30), scr('17', 70)] })
    expect(sieveColumns([s], 'buyer').map((c) => c.label)).toEqual(['18', '17'])
    expect(sieveColumns([s], 'seller').map((c) => c.label)).toEqual(['18'])
  })
})

describe('layout A', () => {
  it('seller has Contract and no Buyer Ref; buyer has Buyer Ref and no Wolthers', () => {
    const seller = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller' })
    expect(seller).toContain('>Contract<')
    expect(seller).not.toContain('Buyer Ref')
    expect(seller).toContain('% of sample')
    expect(seller).toContain('30.0')
    const buyer = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'buyer' })
    expect(buyer).toContain('>Buyer Ref<')
    expect(buyer).not.toContain('Wolthers')
    expect(buyer).not.toContain('42235')
  })
  it('PT headers', () => {
    const html = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller', language: 'pt' })
    for (const w of ['Amostra', 'Bebida', 'Fundo', 'APROVADO', '% da amostra']) expect(html).toContain(w)
    expect(html).not.toContain('>Pan<')
  })
  it('text fallback lists every sieve with its percentage', () => {
    const text = buildQualitySummaryText(groupOf([sample({})]), { audience: 'seller' })
    expect(text).toContain('18 30.0%')
    expect(text).toContain('17 60.0%')
    expect(text).toContain('Pan 10.0%')
  })
  it('never renders the SAN tracking number', () => {
    const s = { ...sample({}), tracking_number: 'SAN-00123/26' } as QualitySampleSummary
    const opts = { audience: 'seller' as const, requests, sellerComment: true }
    expect(buildQualitySummaryHtml(groupOf([s]), opts)).not.toContain('SAN-')
    expect(buildQualitySummaryText(groupOf([s]), opts)).not.toContain('SAN-')
  })
})

describe('request lines', () => {
  it('render under an approved PSS row for the seller', () => {
    const html = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller', requests })
    expect(html).toContain('Dunkin Roasters')
    expect(html).toContain('stuffing date')
    const text = buildQualitySummaryText(groupOf([sample({})]), { audience: 'seller', requests })
    expect(text).toContain('Dunkin Roasters')
  })
  it('never for the buyer, an SS, or a rejected row', () => {
    for (const [s, audience] of [
      [sample({}), 'buyer'],
      [sample({ sampleType: 'ss' }), 'seller'],
      [sample({ decision: 'rejected', reason: 'x' }), 'seller'],
    ] as const) {
      const html = buildQualitySummaryHtml(groupOf([s]), { audience, requests })
      expect(html).not.toContain('Dunkin Roasters')
      expect(html).not.toContain('stuffing date')
    }
  })
})

describe('buildQualityCoverNote', () => {
  it('EN default is unchanged, PT is Portuguese', () => {
    expect(buildQualityCoverNote('Rich', true)).toBe('Dear Rich,\n\nPlease find below the quality results; the certificates are attached.')
    expect(buildQualityCoverNote('Rich', false)).toBe('Dear Rich,\n\nPlease find below the quality results for the samples we assessed.')
    expect(buildQualityCoverNote('Rich', false, 'pt')).toContain('Prezado(a) Rich,')
  })
})
