import { describe, it, expect } from 'vitest'
import { digitsOf, docVariants, formatDoc, isValidCnpj, isValidCpf, pixKeyType } from './docs'

describe('company-register docs', () => {
  it('validates CNPJ check digits', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
  })
  it('validates CPF check digits', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('529.982.247-24')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
  })
  it('digitsOf, formatDoc, docVariants', () => {
    expect(digitsOf('11.222.333/0001-81')).toBe('11222333000181')
    expect(formatDoc('J', '11222333000181')).toBe('11.222.333/0001-81')
    expect(formatDoc('F', '52998224725')).toBe('529.982.247-25')
    expect(formatDoc('F', ' abc ')).toBe('abc')
    expect(docVariants('11222333000181')).toEqual(['11.222.333/0001-81', '11222333000181'])
    expect(docVariants('')).toEqual([])
  })
  it('guesses the PIX key type', () => {
    expect(pixKeyType('a@b.co')).toBe('email')
    expect(pixKeyType('52998224725')).toBe('cpf')
    expect(pixKeyType('+5511999999999')).toBe('phone')
  })
})
