import { describe, it, expect } from 'vitest'
import {
  cleanNextNumber,
  cleanOriginCode,
  cleanOriginName,
  formatOriginCertificateNumber,
  nextOriginCertificateNumber,
  type OriginNumberLine,
} from './origin-certificate-numbers'

const colombia: OriginNumberLine = {
  origin: 'Colombia', code: 'COL', next_number: 123, counter_year: 2026, resets_yearly: true, padding: 6, is_active: true,
}

describe('origin certificate numbers', () => {
  it('reads number, origin code, year', () => {
    expect(formatOriginCertificateNumber(colombia, 123, 2026)).toBe('000123-COL/26')
    expect(formatOriginCertificateNumber({ code: 'PE', padding: 6 }, 7, 2027)).toBe('000007-PE/27')
  })

  it('puts a client quality code in front when given one', () => {
    expect(formatOriginCertificateNumber(colombia, 123, 2026, 'SAG-')).toBe('SAG-000123-COL/26')
  })

  it('never cuts a number longer than its padding', () => {
    expect(formatOriginCertificateNumber(colombia, 1234567, 2026)).toBe('1234567-COL/26')
  })

  it('shows what the next certificate gets, back at 1 in a new year for a line that restarts', () => {
    expect(nextOriginCertificateNumber(colombia, new Date('2026-11-19T12:00:00Z'))).toBe('000123-COL/26')
    expect(nextOriginCertificateNumber(colombia, new Date('2027-01-05T12:00:00Z'))).toBe('000001-COL/27')
    expect(nextOriginCertificateNumber({ ...colombia, resets_yearly: false }, new Date('2027-01-05T12:00:00Z'))).toBe('000123-COL/27')
  })

  it('takes a code of one to six letters and stores it upper-case', () => {
    expect(cleanOriginCode('Col')).toBe('COL')
    expect(cleanOriginCode(' pe ')).toBe('PE')
    expect(cleanOriginCode('')).toBeNull()
    expect(cleanOriginCode('C0L')).toBeNull()
    expect(cleanOriginCode('TOOLONGX')).toBeNull()
  })

  it('takes a next number from 1 up, whole', () => {
    expect(cleanNextNumber('4512')).toBe(4512)
    expect(cleanNextNumber(1)).toBe(1)
    expect(cleanNextNumber(0)).toBeNull()
    expect(cleanNextNumber('12.5')).toBeNull()
    expect(cleanNextNumber('')).toBeNull()
  })

  it('cleans an origin name', () => {
    expect(cleanOriginName('  El   Salvador ')).toBe('El Salvador')
    expect(cleanOriginName('   ')).toBeNull()
  })
})
