import { describe, it, expect } from 'vitest'
import { buildCertificateFilename, sanitizeCertNumber } from './certificate-filename'

describe('sanitizeCertNumber', () => {
  it('replaces the slash with an underscore', () => {
    expect(sanitizeCertNumber('SAG-011692/26')).toBe('SAG-011692_26')
  })

  it('lowercases the rejected R- prefix', () => {
    expect(sanitizeCertNumber('R-SAG-011692/26')).toBe('r-SAG-011692_26')
  })

  it('falls back to "certificate" when empty', () => {
    expect(sanitizeCertNumber(null)).toBe('certificate')
  })
})

describe('buildCertificateFilename', () => {
  it('leads with the cert number, then the buyer reference', () => {
    expect(buildCertificateFilename('SAG-011692/26', 'IR0007634-1')).toBe(
      'SAG-011692_26_IR0007634-1.pdf',
    )
  })

  it('omits the buyer reference when not present', () => {
    expect(buildCertificateFilename('SAG-011692/26', null)).toBe('SAG-011692_26.pdf')
    expect(buildCertificateFilename('SAG-011692/26', '   ')).toBe('SAG-011692_26.pdf')
  })

  it('sanitizes a buyer reference that contains a slash or spaces', () => {
    expect(buildCertificateFilename('SAG-011692/26', 'PO 123/A')).toBe(
      'SAG-011692_26_PO_123_A.pdf',
    )
  })
})
