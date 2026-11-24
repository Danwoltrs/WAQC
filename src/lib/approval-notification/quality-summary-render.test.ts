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
    finalClientSample: null, stuffing: true, additionalSample: false, ssPerContainer: false, setBy: null, setAt: null,
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
    const bRow = html.split('<tr>').find((r) => r.includes('>20.0<'))!
    const cells = bRow.split('</td>').slice(0, -1).map((c) => c.replace(/<[^>]*>/g, ''))
    // Sample, Contract, Quality, then 18..12, Peneira grossa, Pan
    expect(cells.slice(3, 12)).toEqual(['—', '20.0', '20.0', '20.0', '20.0', '10.0', '—', '10.0', '—'])
  })
  it('uses the issued screens for a buyer when present', () => {
    const s = sample({ screen: [scr('18', 27)], issuedScreen: [scr('18', 30), scr('17', 70)] })
    expect(sieveColumns([s], 'buyer').map((c) => c.label)).toEqual(['18', '17'])
    expect(sieveColumns([s], 'seller').map((c) => c.label)).toEqual(['18'])
  })
})

describe('layout A', () => {
  it("seller has Contract with its own and the buyer's ref under it; buyer has Buyer Ref and no Wolthers", () => {
    const seller = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller' })
    expect(seller).toContain('>Contract<')
    expect(seller).not.toContain('>Buyer Ref<')
    expect(seller).toContain('>Seller Ref 42235<')
    expect(seller).toContain('>Buyer Ref DKN-001<')
    expect(seller).not.toContain('% of sample')
    expect(seller).toContain('30.0')
    const buyer = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'buyer' })
    expect(buyer).toContain('>Buyer Ref<')
    expect(buyer).not.toContain('Wolthers')
    expect(buyer).not.toContain('42235')
  })
  it('PT headers', () => {
    const html = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller', language: 'pt' })
    for (const w of ['Amostra', 'Bebida', 'Fundo', 'APROVADO', 'Ref. vendedor 42235', 'Ref. comprador DKN-001']) expect(html).toContain(w)
    expect(html).not.toContain('% da amostra')
    expect(html).not.toContain('>Pan<')
  })
  it('every cell reads from the left, the sieve and defect columns too', () => {
    const html = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller' })
    expect(html).not.toContain('text-align:right')
    expect(html).not.toContain('colspan')
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
    const html = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller', requests, sellerComment: true })
    expect(html).toContain('Dunkin Roasters')
    expect(html).toContain('stuffing date')
    const text = buildQualitySummaryText(groupOf([sample({})]), { audience: 'seller', requests, sellerComment: true })
    expect(text).toContain('Dunkin Roasters')
  })
  it('never for the buyer, an SS, or a rejected row', () => {
    for (const [s, audience] of [
      [sample({}), 'buyer'],
      [sample({ sampleType: 'ss' }), 'seller'],
      [sample({ decision: 'rejected', reason: 'x' }), 'seller'],
    ] as const) {
      const html = buildQualitySummaryHtml(groupOf([s]), { audience, requests, sellerComment: true })
      expect(html).not.toContain('Dunkin Roasters')
      expect(html).not.toContain('stuffing date')
    }
  })
})

describe('request lines gate', () => {
  it('are omitted without sellerComment even for the seller', () => {
    const html = buildQualitySummaryHtml(groupOf([sample({})]), { audience: 'seller', requests })
    expect(html).not.toContain('Dunkin Roasters')
    expect(buildQualitySummaryText(groupOf([sample({})]), { audience: 'seller', requests })).not.toContain('Dunkin Roasters')
  })
})

describe('buildQualityCoverNote', () => {
  it('EN default is unchanged, PT is Portuguese', () => {
    expect(buildQualityCoverNote('Rich', true)).toBe('Dear Rich,\n\nPlease find below the quality results; the certificates are attached.')
    expect(buildQualityCoverNote('Rich', false)).toBe('Dear Rich,\n\nPlease find below the quality results for the samples we assessed.')
    expect(buildQualityCoverNote('Rich', false, 'pt')).toContain('Prezado(a) Rich,')
  })
})

describe('a type sample in the results email', () => {
  it('reads IN RANGE or OUT OF RANGE, never a verdict', () => {
    const inRange = buildQualitySummaryText(groupOf([sample({ sampleType: 'type', decision: 'approved' })]), { audience: 'buyer' })
    expect(inRange).toContain('IN RANGE')
    expect(inRange).not.toContain('APPROVED')

    const out = buildQualitySummaryHtml(groupOf([sample({ sampleType: 'type', decision: 'rejected', reason: 'Moisture: 13% exceeds maximum (12%)' })]), { audience: 'buyer' })
    expect(out).toContain('OUT OF RANGE')
    expect(out).not.toContain('REJECTED')
    // What is out of range is still named.
    expect(out).toContain('Moisture: 13% exceeds maximum (12%)')
  })

  it('in Portuguese too', () => {
    const text = buildQualitySummaryText(groupOf([sample({ sampleType: 'type', decision: 'rejected' })]), { audience: 'seller', language: 'pt' })
    expect(text).toContain('FORA DO PADRÃO')
    expect(text).not.toContain('REPROVADO')
  })

  it('any other sample keeps its verdict', () => {
    expect(buildQualitySummaryText(groupOf([sample({ sampleType: 'pss', decision: 'rejected' })]), { audience: 'buyer' })).toContain('REJECTED')
  })
})
