// The company's own fields (companies table), edited from the company panel.
// document_cnpj is stored formatted, as sys does (new-company.ts formatDoc).
import { z } from 'zod'
import { digitsOf, formatDoc, isValidCnpj, isValidCpf } from './docs'

const opt = (max: number) =>
  z.string().max(max, `At most ${max} characters`).nullish().transform((v) => {
    const t = (v ?? '').trim()
    return t === '' ? null : t
  })

export const companyPatchSchema = z
  .object({
    name: z.string().max(300).transform((v) => v.trim()).refine((v) => v !== '', 'Enter the name').optional(),
    fantasy_name: opt(300).optional(),
    country: opt(100).optional(),
    address: opt(300).optional(),
    city: opt(120).optional(),
    state: opt(60).optional(),
    zip_code: opt(20).optional(),
    person_type: z.enum(['F', 'J']).nullish().transform((v) => v ?? null).optional(),
    document_cnpj: opt(30).optional(),
    document_ie: opt(40).optional(),
    vat_number: opt(60).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.document_cnpj) return
    const type = v.person_type ?? (digitsOf(v.document_cnpj).length === 11 ? 'F' : 'J')
    const ok = type === 'F' ? isValidCpf(v.document_cnpj) : isValidCnpj(v.document_cnpj)
    if (!ok) {
      ctx.addIssue({
        code: 'custom', path: ['document_cnpj'],
        message: type === 'F' ? 'Invalid CPF: check the numbers' : 'Invalid CNPJ: check the numbers',
      })
    }
  })
  .transform((v) => {
    if (!v.document_cnpj) return v
    const type = v.person_type ?? (digitsOf(v.document_cnpj).length === 11 ? 'F' : 'J')
    return { ...v, document_cnpj: formatDoc(type, v.document_cnpj) }
  })

export type CompanyPatch = z.output<typeof companyPatchSchema>

export interface CompanyRecord {
  id: string
  name: string
  fantasy_name: string | null
  country: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  person_type: 'F' | 'J' | null
  document_cnpj: string | null
  document_ie: string | null
  vat_number: string | null
}

export const COMPANY_COLUMNS =
  'id, name, fantasy_name, country, address, city, state, zip_code, person_type, document_cnpj, document_ie, vat_number'
