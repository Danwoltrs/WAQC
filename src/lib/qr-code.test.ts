import { describe, it, expect } from 'vitest'
import { getCertificatePageUrl } from './qr-code'

describe('getCertificatePageUrl', () => {
  it('slugifies a certificate number into the public path', () => {
    expect(getCertificatePageUrl('BR-036991/26')).toMatch(/\/certificate\/BR-036991_26$/)
  })

  it('produces an absolute http(s) url', () => {
    expect(getCertificatePageUrl('BR-036991/26')).toMatch(/^https?:\/\//)
  })

  it('encodes nothing beyond the url', () => {
    expect(getCertificatePageUrl('BR-036991/26')).not.toContain('\n')
  })

  it('puts the buyer in front so two clients\' 000001/26 stay distinct', () => {
    expect(getCertificatePageUrl('000001/26', 'Arvid Nordquist'))
      .toMatch(/\/certificate\/arvid-nordquist\/000001_26$/)
  })

  it('falls back to the bare number when the buyer slugifies to nothing', () => {
    expect(getCertificatePageUrl('000001/26', '  ')).toMatch(/\/certificate\/000001_26$/)
  })
})
