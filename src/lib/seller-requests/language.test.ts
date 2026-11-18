import { describe, expect, it } from 'vitest'
import { sellerLanguage } from './language'

describe('sellerLanguage', () => {
  it('pt preference', () => expect(sellerLanguage({ preferred_language: 'pt-BR' })).toBe('pt'))
  it('Brasil', () => expect(sellerLanguage({ country: 'Brasil' })).toBe('pt'))
  it('UF with blank country', () => expect(sellerLanguage({ state: 'MG' })).toBe('pt'))
  it('Switzerland', () => expect(sellerLanguage({ country: 'Switzerland' })).toBe('en'))
  it('null', () => expect(sellerLanguage(null)).toBe('en'))
  it('preference wins', () => expect(sellerLanguage({ preferred_language: 'en', country: 'Brazil' })).toBe('en'))
})
