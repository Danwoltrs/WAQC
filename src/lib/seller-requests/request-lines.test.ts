import { describe, expect, it } from 'vitest'
import { buildRequestLines } from './request-lines'
import type { SellerRequests } from './types'

const dest = {
  companyId: null, companyName: 'Blaser', savedAddressId: null,
  lines: ['Guterstrasse 4', 'CH-3001 Bern'], country: 'Switzerland', recipientName: null,
  attention: 'QC desk', phone: '+41 31 000', instructions: 'DHL only',
}
const req = (o: Partial<SellerRequests> = {}): SellerRequests => ({
  buyerSample: dest, stuffing: true, setBy: null, setAt: null, ...o,
})

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
})
