// The save sequence of POST /api/clients (add a company), spec 2026-11-24
// decision 3: parse the body, find the company if it already exists, link a
// confined laboratory to it, then save the holders and bank accounts.
//
// Server only. findCompanyMatch and linkCompanyToLab take the SERVICE-ROLE
// client because a confined laboratory cannot see the candidates; nothing they
// read leaves this module except a company id. Everything else runs with the
// caller's session so the database rules apply.
import { z } from 'zod'
import { companyPatchSchema } from './company-schema'
import { digitsOf, docVariants } from './docs'
import {
  decideCompanyMatch, longestNameToken, nameTokensPattern, TAX_ID_MIN_DIGITS,
  type MatchCandidate, type MatchDecision,
} from './match'
import { bankAccountSchemaFor, parseWith, titularInputSchema, type TitularInput } from './schema'
import { insertBankAccountRow, insertTitularRow, mapRegisterError, type AnyClient } from './server'

/** Holders, and bank accounts per list, one form may carry. */
export const MAX_REGISTER_ROWS = 20

const rows = z.array(z.unknown()).max(MAX_REGISTER_ROWS, `At most ${MAX_REGISTER_ROWS} rows`).nullish().transform((v) => v ?? [])

/** The add-company body. Every other key (the legacy client fields) passes
 *  through to splitClientPayload. */
const newCompanyBodySchema = z
  .object({
    name: z.string().max(300).transform((v) => v.trim()).refine((v) => v !== ''),
    company: z.string().max(300).transform((v) => v.trim()).refine((v) => v !== ''),
    titulares: rows,
    bank_accounts: rows,
  })
  .passthrough()

const DOCUMENT_KEYS = ['person_type', 'document_cnpj', 'document_ie', 'vat_number'] as const

export interface NewCompanyRegister {
  /** The body, name and company trimmed; titulares / bank_accounts still in it (splitClientPayload ignores them). */
  body: Record<string, unknown>
  /** person_type / document_cnpj (CNPJ or CPF, formatted) / document_ie / vat_number, only the keys sent. */
  documents: Record<string, unknown>
  /** What identifies the company for matching: the CNPJ / CPF, else the tax id. */
  taxId: string | null
  holders: { data: TitularInput; accounts: unknown[] }[]
  /** The company's own accounts, raw: they are parsed again with the company record's country. */
  accounts: unknown[]
}

type Fail = { ok: false; error: string; fieldErrors: Record<string, string> }

const failAt = (label: string, path: string, r: Fail): Fail => ({
  ok: false,
  error: `${label}: ${r.error}`,
  fieldErrors: Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [`${path}.${k}`, v])),
})

/** Validate the whole body before anything is read or written. Bank accounts
 *  are checked against the country in the body here; the save re-checks them
 *  against the company record's (an existing company's on a link). */
export function parseNewCompanyRegister(raw: unknown): { ok: true; value: NewCompanyRegister } | Fail {
  const top = newCompanyBodySchema.safeParse(raw)
  if (!top.success) {
    const issue = top.error.issues[0]
    const key = String(issue?.path[0] ?? '')
    if (key === 'titulares' || key === 'bank_accounts') {
      return { ok: false, error: issue.message, fieldErrors: { [key]: issue.message } }
    }
    return { ok: false, error: 'Missing required fields: name, company', fieldErrors: {} }
  }
  const body = top.data as Record<string, unknown> & z.output<typeof newCompanyBodySchema>

  const docInput: Record<string, unknown> = {}
  for (const k of DOCUMENT_KEYS) if (body[k] !== undefined) docInput[k] = body[k]
  const docs = parseWith(companyPatchSchema, docInput)
  if (!docs.ok) return docs
  const documents: Record<string, unknown> = { ...docs.data }
  const cnpj = typeof documents.document_cnpj === 'string' ? documents.document_cnpj : null
  if (cnpj && !documents.person_type) documents.person_type = digitsOf(cnpj).length === 11 ? 'F' : 'J'
  const vat = typeof documents.vat_number === 'string' ? documents.vat_number : null

  const accountSchema = bankAccountSchemaFor(typeof body.country === 'string' ? body.country : null)
  const holders: NewCompanyRegister['holders'] = []
  for (const [i, h] of body.titulares.entries()) {
    const parsed = parseWith(titularInputSchema, h)
    if (!parsed.ok) return failAt(`Holder ${i + 1}`, `titulares.${i}`, parsed)
    const nested = rows.safeParse(h && typeof h === 'object' ? (h as Record<string, unknown>).bank_accounts : null)
    if (!nested.success) return { ok: false, error: `Holder ${i + 1}: ${nested.error.issues[0]?.message}`, fieldErrors: {} }
    for (const [j, a] of nested.data.entries()) {
      const acc = parseWith(accountSchema, a)
      if (!acc.ok) return failAt(`Holder ${i + 1}, bank account ${j + 1}`, `titulares.${i}.bank_accounts.${j}`, acc)
    }
    holders.push({ data: parsed.data, accounts: nested.data })
  }
  for (const [i, a] of body.bank_accounts.entries()) {
    const acc = parseWith(accountSchema, a)
    if (!acc.ok) return failAt(`Bank account ${i + 1}`, `bank_accounts.${i}`, acc)
  }

  return { ok: true, value: { body, documents, taxId: cnpj ?? vat, holders, accounts: body.bank_accounts } }
}

const CANDIDATE_COLUMNS = 'id, name, fantasy_name, document_cnpj, vat_number'
const CANDIDATE_LIMIT = 50

const str = (v: unknown) => (typeof v === 'string' ? v : null)

/**
 * The companies the new one might be. SERVICE ROLE: a confined laboratory
 * cannot see them. The database cannot run the name normalization, so this
 * fetches broadly (tax-id variants on document_cnpj and vat_number; the
 * unaccented name_search / fantasy_name_search columns by the longest name
 * token and by all tokens in order, 50 rows each) and decideCompanyMatch
 * decides. The rows never leave the server: callers get the decision only.
 */
async function fetchMatchCandidates(service: AnyClient, input: { name: string; taxId: string | null }): Promise<MatchCandidate[]> {
  const base = () => service.from('companies').select(CANDIDATE_COLUMNS)
  const reads: PromiseLike<{ data: unknown; error: { code?: string } | null }>[] = []
  if (digitsOf(input.taxId).length >= TAX_ID_MIN_DIGITS) {
    const variants = docVariants(input.taxId)
    reads.push(base().in('document_cnpj', variants).limit(CANDIDATE_LIMIT))
    reads.push(base().in('vat_number', variants).limit(CANDIDATE_LIMIT))
  }
  // Tokens are letters and digits only, so they are safe inside or() and ilike.
  const token = longestNameToken(input.name)
  if (token) {
    reads.push(base().or(`name_search.ilike.%${token}%,fantasy_name_search.ilike.%${token}%`).order('name').limit(CANDIDATE_LIMIT))
  }
  const pattern = nameTokensPattern(input.name)
  if (pattern && pattern !== `%${token}%`) {
    reads.push(base().or(`name_search.ilike.${pattern},fantasy_name_search.ilike.${pattern}`).order('name').limit(CANDIDATE_LIMIT))
  }
  const results = await Promise.all(reads)
  const out: MatchCandidate[] = []
  for (const r of results) {
    if (r.error) throw new Error(`company candidates could not be read (${r.error.code ?? 'error'})`)
    for (const row of (Array.isArray(r.data) ? r.data : []) as Record<string, unknown>[]) {
      out.push({
        id: String(row.id), name: str(row.name) ?? '', fantasy_name: str(row.fantasy_name),
        document_cnpj: str(row.document_cnpj), vat_number: str(row.vat_number),
      })
    }
  }
  return out
}

/** Link or create, for every caller (HQ too: no duplicate of a company that exists). Throws when the lookup fails. */
export async function findCompanyMatch(service: AnyClient, input: { name: string; taxId: string | null }): Promise<MatchDecision> {
  return decideCompanyMatch(input, await fetchMatchCandidates(service, input))
}

/** SERVICE ROLE (authenticated users have no insert policy on company_labs).
 *  An existing row is kept as it is, so a lab that created the company and
 *  adds it again keeps created_company. */
export async function linkCompanyToLab(
  service: AnyClient, companyId: string, laboratoryId: string, createdCompany: boolean, userId: string,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const { error } = await service.from('company_labs').upsert(
    { company_id: companyId, laboratory_id: laboratoryId, created_company: createdCompany, created_by: userId },
    { onConflict: 'company_id,laboratory_id', ignoreDuplicates: true },
  )
  return { error: error ?? null }
}

/**
 * The holders and bank accounts of the form, saved with the caller's SESSION
 * client after the company exists or is linked (the holder and account
 * policies need the company_labs row). `country` is the company record's;
 * `ownerLabId` is ownerLabFor(scope). A titular_id in the body is ignored: an
 * account belongs to the company, or to the holder it was sent under.
 * Returns one message per row that was not saved; the others are.
 */
export async function saveRegisterRows(
  supabase: AnyClient, companyId: string, country: string | null,
  reg: Pick<NewCompanyRegister, 'holders' | 'accounts'>, userId: string, ownerLabId: string | null,
): Promise<string[]> {
  const errors: string[] = []
  const schema = bankAccountSchemaFor(country)
  const saveAccounts = async (raws: unknown[], titularId: string | null, label: (j: number) => string) => {
    for (const [j, raw] of raws.entries()) {
      const parsed = parseWith(schema, raw)
      if (!parsed.ok) { errors.push(`${label(j)}: ${parsed.error}`); continue }
      const { error } = await insertBankAccountRow(supabase, companyId, { ...parsed.data, titular_id: titularId }, userId, ownerLabId)
      if (error) errors.push(`${label(j)}: ${mapRegisterError(error).body.error}`)
    }
  }
  await saveAccounts(reg.accounts, null, (j) => `Bank account ${j + 1}`)
  for (const [i, h] of reg.holders.entries()) {
    const { data, error } = await insertTitularRow(supabase, companyId, h.data, userId, ownerLabId)
    if (error || !data) {
      errors.push(`Holder ${i + 1}: ${mapRegisterError(error ?? {}).body.error}`)
      continue
    }
    await saveAccounts(h.accounts, String(data.id), (j) => `Holder ${i + 1}, bank account ${j + 1}`)
  }
  return errors
}
