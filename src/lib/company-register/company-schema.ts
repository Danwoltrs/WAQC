// The company's own fields (companies table), edited from the company panel.
// document_cnpj is stored formatted, as sys does (new-company.ts formatDoc).
//
// The address is sys's: street / street_number / neighbourhood / city / state /
// zip_code (sys company-modal.tsx AddressFields). companies.address is legacy:
// read as a fallback when street is empty, never written from here.
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
    // Limits follow the columns: country, state varchar(50); city varchar(100).
    country: opt(50).optional(),
    street: opt(300).optional(),
    street_number: opt(30).optional(),
    neighbourhood: opt(120).optional(),
    city: opt(100).optional(),
    state: opt(50).optional(),
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
  street: string | null
  street_number: string | null
  neighbourhood: string | null
  /** Legacy: shown read-only when street is empty, never written. */
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
  'id, name, fantasy_name, country, street, street_number, neighbourhood, address, city, state, zip_code, person_type, document_cnpj, document_ie, vat_number'

export interface AddressDraft {
  street: string
  street_number: string
  neighbourhood: string
  city: string
  state: string
  zip_code: string
}

/**
 * The address keys a save sends. Outside Brazil there is no separate number
 * (sys handleSave writes street_number NULL there): a number left over is
 * folded into the street line, unless the street already holds it, so it is
 * not lost.
 */
export function addressPatch(d: AddressDraft, brazil: boolean): Omit<AddressDraft, 'street_number'> & { street_number: string | null } {
  // Only the address keys: the draft passed in may carry the rest of the form.
  const base = { street: d.street, neighbourhood: d.neighbourhood, city: d.city, state: d.state, zip_code: d.zip_code }
  if (brazil) return { ...base, street_number: d.street_number }
  const street = d.street.trim()
  const number = d.street_number.trim()
  const folded = !number || street.toLowerCase().includes(number.toLowerCase())
    ? d.street
    : street ? `${street}, ${number}` : number
  return { ...base, street: folded, street_number: null }
}

/**
 * The address as lines, the way sys previews it (street and number, the
 * neighbourhood or second line, then city, state and postal code); the legacy
 * address when street is empty. A number already inside the street is not repeated.
 */
export function addressLines(c: Pick<CompanyRecord, 'street' | 'street_number' | 'neighbourhood' | 'address' | 'city' | 'state' | 'zip_code'>): string[] {
  const t = (v: string | null | undefined) => (v ?? '').trim()
  const lines: string[] = []
  const street = t(c.street)
  if (street) {
    const number = t(c.street_number)
    lines.push(number && !street.toLowerCase().includes(number.toLowerCase()) ? `${street}, ${number}` : street)
    if (t(c.neighbourhood)) lines.push(t(c.neighbourhood))
  } else if (t(c.address)) {
    lines.push(t(c.address))
  }
  const cityLine = [t(c.city), t(c.state), t(c.zip_code)].filter(Boolean).join(', ')
  if (cityLine) lines.push(cityLine)
  return lines
}
