import { describe, it, expect } from 'vitest'
import { isValidEmail } from './html'

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('sven.drillenburg@adcoffeecompany.nl')).toBe(true)
    expect(isValidEmail('hans@allgoworldwide.com')).toBe(true)
    expect(isValidEmail('first+tag@sub.domain.co.uk')).toBe(true)
    expect(isValidEmail('wolthers@wolthers.com')).toBe(true)
  })

  it('rejects addresses with punctuation glued onto the domain (paste artifacts)', () => {
    // Real prod incident: this exact value in contacts.email made Graph reject
    // the whole Ahold batch send with 400 ErrorInvalidRecipients.
    expect(isValidEmail('adccpurchasing@adcoffeecompany.nl),')).toBe(false)
    expect(isValidEmail('someone@example.com,')).toBe(false)
    expect(isValidEmail('someone@example.com;')).toBe(false)
    expect(isValidEmail('(someone@example.com)')).toBe(false)
    expect(isValidEmail('someone@example.com>')).toBe(false)
  })

  it('rejects structurally broken addresses', () => {
    expect(isValidEmail('no-at-sign.example.com')).toBe(false)
    expect(isValidEmail('missing-tld@domain')).toBe(false)
    expect(isValidEmail('two@@example.com')).toBe(false)
    expect(isValidEmail('spaces in@example.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
    expect(isValidEmail(42)).toBe(false)
  })
})
