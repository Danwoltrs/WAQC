import { describe, expect, it } from 'vitest'
import { buildRequestLines } from './request-lines'
import type { SellerRequests } from './types'

const dest = {
  companyId: null, companyName: 'Blaser', savedAddressId: null,
  lines: ['Guterstrasse 4', 'CH-3001 Bern'], country: 'Switzerland', recipientName: null,
  attention: 'QC desk', phone: '+41 31 000', instructions: 'DHL only',
}
const req = (o: Partial<SellerRequests> = {}): SellerRequests => ({
  buyerSample: dest, finalClientSample: null, stuffing: true,
  additionalSample: false, ssPerContainer: false, setBy: null, setAt: null, ...o,
})
const nespresso = { ...dest, companyName: 'Nespresso', lines: ['Avenue de Rhodanie 40', '1007 Lausanne'], instructions: null }

describe('buildRequestLines', () => {
  it('PT text', () => {
    const r = buildRequestLines(req(), 'pt')!
    expect(r.text).toContain(
      'Pré-aprovado pela Wolthers – favor enviar 1 amostra para Blaser:\nGuterstrasse 4\nCH-3001 Bern\nSwitzerland\nATTN QC desk · Tel: +41 31 000\nDHL only',
    )
    expect(r.text).toContain('Favor nos informar data, hora e local da estufagem para retirarmos a amostra de embarque (SS).')
  })
  it('PT html', () => {
    const r = buildRequestLines(req({ buyerSample: { ...dest, companyName: 'A<b>' } }), 'pt')!
    expect(r.html).toContain('<strong>Pré-aprovado pela Wolthers – favor enviar 1 amostra para A&lt;b&gt;:</strong>')
    expect(r.html).toContain('color:#c0392b')
    expect(r.html).toContain('DHL only')
    expect(r.html).not.toContain('<b>')
  })
  it('EN', () => {
    const r = buildRequestLines(req(), 'en')!
    expect(r.text).toContain('Pre-approved by Wolthers – please send 1 sample to Blaser:\nGuterstrasse 4')
    expect(r.text).toContain('Please let us know the stuffing date, time and place so we can draw the shipment sample (SS).')
  })
  it('stuffing only / buyer only / none', () => {
    expect(buildRequestLines(req({ buyerSample: null }), 'en')!.text).not.toContain('Pre-approved')
    expect(buildRequestLines(req({ stuffing: false }), 'en')!.text).not.toContain('stuffing')
    expect(buildRequestLines(req({ buyerSample: null, stuffing: false }), 'en')).toBeNull()
  })

  it('final client: our pre-approval reads like the buyer line, with its own address', () => {
    const r = buildRequestLines(req({ finalClientSample: { destination: nespresso, purpose: 'pre_approval' } }), 'en')!
    expect(r.text).toContain('Pre-approved by Wolthers – please send 1 sample to Blaser:')
    expect(r.text).toContain('Pre-approved by Wolthers – please send 1 sample to Nespresso:\nAvenue de Rhodanie 40\n1007 Lausanne')
  })
  it('final client: for their final approval, EN and PT', () => {
    const f = { destination: nespresso, purpose: 'final_approval' as const }
    expect(buildRequestLines(req({ finalClientSample: f }), 'en')!.text).toContain(
      'Approved by Wolthers – please send 1 sample to Nespresso for their final approval:\nAvenue de Rhodanie 40',
    )
    expect(buildRequestLines(req({ finalClientSample: f }), 'pt')!.html).toContain(
      '<strong>Aprovado pela Wolthers – favor enviar 1 amostra para Nespresso para aprovação final:</strong>',
    )
  })
  it('a final-client tick with no address yet prints nothing', () => {
    const r = buildRequestLines(
      req({ buyerSample: null, stuffing: false, finalClientSample: { destination: null, purpose: 'final_approval' } }),
      'en',
    )
    expect(r).toBeNull()
  })
  it('additional sample and one SS per container, in order before the stuffing line', () => {
    const r = buildRequestLines(req({ buyerSample: null, additionalSample: true, ssPerContainer: true }), 'en')!
    expect(r.text).toBe(
      [
        'Please send an additional sample to our lab.',
        'Please send one shipment sample (SS) of each container to our lab.',
        'Please let us know the stuffing date, time and place so we can draw the shipment sample (SS).',
      ].join('\n'),
    )
    const pt = buildRequestLines(req({ buyerSample: null, stuffing: false, ssPerContainer: true }), 'pt')!
    expect(pt.text).toBe('Favor enviar uma amostra de embarque (SS) de cada contêiner para o nosso laboratório.')
  })
})
