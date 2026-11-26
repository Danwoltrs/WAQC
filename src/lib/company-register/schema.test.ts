import { describe, it, expect } from 'vitest'
import { bankAccountInputSchema, parseRegisterPatch, titularInputSchema } from './schema'

const CNPJ = '11.222.333/0001-81'
const CPF = '529.982.247-25'

describe('titularInputSchema', () => {
  it('accepts a valid CNPJ for J and formats digits', () => {
    const r = titularInputSchema.parse({ person_type: 'J', name: ' Acme ', cpf_cnpj: '11222333000181' })
    expect(r.cpf_cnpj).toBe(CNPJ)
    expect(r.name).toBe('Acme')
  })
  it('accepts a valid CPF for F', () => {
    expect(titularInputSchema.parse({ person_type: 'F', name: 'Ana', cpf_cnpj: CPF }).cpf_cnpj).toBe(CPF)
  })
  it('rejects a bad check digit and a CPF given for J', () => {
    expect(titularInputSchema.safeParse({ person_type: 'J', name: 'A', cpf_cnpj: '11.222.333/0001-80' }).success).toBe(false)
    expect(titularInputSchema.safeParse({ person_type: 'J', name: 'A', cpf_cnpj: CPF }).success).toBe(false)
    expect(titularInputSchema.safeParse({ person_type: 'F', name: 'A', cpf_cnpj: '529.982.247-24' }).success).toBe(false)
  })
  it('allows a blank document, requires a name, uppercases the state', () => {
    expect(titularInputSchema.parse({ person_type: 'F', name: 'A', cpf_cnpj: '', state: 'mg' }).state).toBe('MG')
    expect(titularInputSchema.safeParse({ person_type: 'F', name: '  ' }).success).toBe(false)
    expect(titularInputSchema.safeParse({ person_type: 'F', name: 'A', state: 'MGX' }).success).toBe(false)
  })
})

describe('bankAccountInputSchema', () => {
  it('rejects an account with neither number nor PIX', () => {
    const r = bankAccountInputSchema.safeParse({ bank_name: 'Itau' })
    expect(r.success).toBe(false)
  })
  it('accepts a PIX-only account and guesses the key type', () => {
    const r = bankAccountInputSchema.parse({ pix_key: 'a@b.co' })
    expect(r.pix_key_type).toBe('email')
    expect(r.is_primary).toBe(false)
  })
  it('keeps corrente/poupanca for Brazil (default) and drops it elsewhere', () => {
    expect(bankAccountInputSchema.parse({ account_number: '1', account_type: 'corrente' }).account_type).toBe('corrente')
    expect(bankAccountInputSchema.parse({ account_number: '1', account_type: 'corrente', country: 'Brazil' }).account_type).toBe('corrente')
    const r = bankAccountInputSchema.parse({ account_number: '1', account_type: 'poupanca', country: 'Colombia', routing_code: 'BCOLCOBM' })
    expect(r.account_type).toBeNull()
    expect(r.routing_code).toBe('BCOLCOBM')
    expect('country' in r).toBe(false)
  })
  it('rejects an unknown account type or PIX type', () => {
    expect(bankAccountInputSchema.safeParse({ account_number: '1', account_type: 'savings' }).success).toBe(false)
    expect(bankAccountInputSchema.safeParse({ pix_key: 'x', pix_key_type: 'iban' }).success).toBe(false)
  })
})

describe('parseRegisterPatch', () => {
  it('reads the one-key shortcuts and the full row', () => {
    expect(parseRegisterPatch({ is_active: false }, bankAccountInputSchema)).toEqual({ kind: 'active', is_active: false })
    expect(parseRegisterPatch({ is_primary: true }, bankAccountInputSchema)).toEqual({ kind: 'primary' })
    expect(parseRegisterPatch({ account_number: '9' }, bankAccountInputSchema).kind).toBe('full')
    expect(parseRegisterPatch({}, bankAccountInputSchema).kind).toBe('invalid')
  })
})
