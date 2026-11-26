// Copy of sys src/types/company-register.ts (+ owner_lab_id), keep in step.
// Company register: the holders (titulares) a company trades under and the
// bank / PIX accounts each holder is paid into. Both tables are shared with sys.

export type PersonType = 'F' | 'J'

export const PIX_KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const
export type PixKeyType = (typeof PIX_KEY_TYPES)[number]

export const ACCOUNT_TYPES = ['corrente', 'poupanca'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export interface Titular {
  id: string
  company_id: string
  person_type: PersonType
  name: string
  cpf_cnpj: string | null
  rg: string | null
  /** IPR for a person (F), IE for a company (J). */
  ie_ipr: string | null
  /** Printed line 2, e.g. "FAZENDA SAO JOAO". */
  farm_line: string | null
  /** Blank = the company's (per field). */
  address: string | null
  zip: string | null
  city: string | null
  state: string | null
  notes: string | null
  is_active: boolean
  /** NULL = sys or Santos; a lab id = the non-HQ lab that added the row. */
  owner_lab_id: string | null
}

export interface BankAccount {
  id: string
  company_id: string
  /** null = the company's own account. */
  titular_id: string | null
  bank_name: string | null
  /** Bank code in Brazil (e.g. "341"); SWIFT / ABA elsewhere. */
  routing_code: string | null
  /** Agencia (Brazil). */
  branch: string | null
  account_number: string | null
  account_type: AccountType | null
  pix_key: string | null
  pix_key_type: PixKeyType | null
  label: string | null
  is_primary: boolean
  is_active: boolean
  owner_lab_id: string | null
}

export const TITULAR_COLUMNS =
  'id, company_id, person_type, name, cpf_cnpj, rg, ie_ipr, farm_line, address, zip, city, state, notes, is_active, owner_lab_id'
export const BANK_ACCOUNT_COLUMNS =
  'id, company_id, titular_id, bank_name, routing_code, branch, account_number, account_type, pix_key, pix_key_type, label, is_primary, is_active, owner_lab_id'
