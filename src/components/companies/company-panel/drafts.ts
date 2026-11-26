import type { BankAccount, Titular } from '@/types/company-register'

/** What the holder form edits: every field a string, as typed. */
export interface HolderDraft {
  person_type: 'F' | 'J'
  name: string
  cpf_cnpj: string
  rg: string
  ie_ipr: string
  farm_line: string
  address: string
  zip: string
  city: string
  state: string
  notes: string
}

export interface AccountDraft {
  bank_name: string
  routing_code: string
  branch: string
  account_number: string
  account_type: '' | 'corrente' | 'poupanca'
  pix_key: string
  label: string
  is_primary: boolean
}

export type FieldErrors = Record<string, string>

export const emptyHolder = (): HolderDraft => ({
  person_type: 'J', name: '', cpf_cnpj: '', rg: '', ie_ipr: '', farm_line: '',
  address: '', zip: '', city: '', state: '', notes: '',
})

export const emptyAccount = (): AccountDraft => ({
  bank_name: '', routing_code: '', branch: '', account_number: '', account_type: '', pix_key: '', label: '', is_primary: false,
})

export const holderToDraft = (t: Titular): HolderDraft => ({
  person_type: t.person_type, name: t.name, cpf_cnpj: t.cpf_cnpj ?? '', rg: t.rg ?? '', ie_ipr: t.ie_ipr ?? '',
  farm_line: t.farm_line ?? '', address: t.address ?? '', zip: t.zip ?? '', city: t.city ?? '', state: t.state ?? '',
  notes: t.notes ?? '',
})

export const accountToDraft = (a: BankAccount): AccountDraft => ({
  bank_name: a.bank_name ?? '', routing_code: a.routing_code ?? '', branch: a.branch ?? '',
  account_number: a.account_number ?? '', account_type: a.account_type ?? '', pix_key: a.pix_key ?? '',
  label: a.label ?? '', is_primary: a.is_primary,
})
