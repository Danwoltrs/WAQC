// The save sequence of POST /api/clients (add a company), spec 2026-11-24
// decision 3: parse the body, find the company if it already exists, check
// every bank account against that company's country, link a confined
// laboratory to it, then save the holders and bank accounts.
//
// Server only. The SERVICE-ROLE client is used for: the candidates (a confined
// laboratory cannot see them; only a company id and, for the account rules, its
// country come out, and neither goes into a response), the company_labs insert,
// undoWrites (deleting exactly what a failed request wrote), and
// settleLinkedCompany (is_qc_client, is_active and added role tags on a
// linked company). Every other write runs with the caller's session so the
// database rules apply.
import { z } from 'zod'
import { companyPatchSchema } from './company-schema'
import { digitsOf, docVariants } from './docs'
import {
  decideCompanyMatch, longestNameToken, nameTokensPattern, TAX_ID_MIN_DIGITS,
  type MatchCandidate, type MatchDecision,
} from './match'
import {
  bankAccountSchemaFor, parseWith, titularInputSchema, type BankAccountInput, type TitularInput,
} from './schema'
import { insertBankAccountRow, insertTitularRow, mapRegisterError, restorePrimary, type AnyClient } from './server'
import { QC_COMPANY_ROLES, UNKNOWN_COMPANY_ROLE } from './roles'

/** Holders, and bank accounts per list, one form may carry. */
export const MAX_REGISTER_ROWS = 20

const rows = z.array(z.unknown()).max(MAX_REGISTER_ROWS, `At most ${MAX_REGISTER_ROWS} rows`).nullish().transform((v) => v ?? [])
const text = (max: number) => z.string({ invalid_type_error: 'Must be text' }).max(max, `At most ${max} characters`).nullish()
const flag = z.boolean({ invalid_type_error: 'Must be true or false' }).nullish()
/** Only the allowlisted roles (roles.ts); any issue on these keys is UNKNOWN_COMPANY_ROLE. */
const roleList = <T extends readonly [string, ...string[]]>(allowed: T) => z.array(z.enum(allowed)).max(30).nullish()
const ROLE_KEYS = new Set(['client_types', 'company_types', 'trading_roles'])

/** The add-company body: every field that reaches the companies row is typed
 *  here, so a bad one fails before anything is written. The QC settings keys
 *  pass through to splitClientPayload (their write is undone on failure). */
const newCompanyBodySchema = z
  .object({
    name: z.string().max(300).transform((v) => v.trim()).refine((v) => v !== ''),
    company: z.string().max(300).transform((v) => v.trim()).refine((v) => v !== ''),
    fantasy_name: text(300),
    email: text(320),
    phone: text(60),
    country: text(100),
    street: text(300),
    street_number: text(30),
    neighbourhood: text(120),
    address: text(300),
    neighborhood: text(120),
    city: text(120),
    state: text(60),
    zip_code: text(20),
    client_types: roleList(QC_COMPANY_ROLES.clientTypes),
    company_types: roleList(QC_COMPANY_ROLES.companyTypes),
    trading_roles: roleList(QC_COMPANY_ROLES.tradingRoles),
    is_qc_client: flag,
    qc_enabled: flag,
    is_active: flag,
    legacy_client_id: z.number({ invalid_type_error: 'Must be a number' }).int().nullish(),
    logo_url: text(2000),
    notes: text(5000),
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
  /** Holders, with their bank accounts still raw (see parseRegisterAccounts). */
  holders: { data: TitularInput; accounts: unknown[] }[]
  /** The company's own accounts, raw: their rules depend on the company's country, known after matching. */
  accounts: unknown[]
}

/** The holders and bank accounts, all valid, ready to write. */
export interface RegisterRows {
  holders: { data: TitularInput; accounts: BankAccountInput[] }[]
  accounts: BankAccountInput[]
}

type Fail = { ok: false; error: string; fieldErrors: Record<string, string> }

const failAt = (label: string, path: string, r: Fail): Fail => ({
  ok: false,
  error: `${label}: ${r.error}`,
  fieldErrors: Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [`${path}.${k}`, v])),
})

/** Validate the body before anything is read or written: name, the company
 *  fields, the documents and every holder. The bank accounts are checked by
 *  parseRegisterAccounts once the company's country is known, also before
 *  any write. */
export function parseNewCompanyRegister(raw: unknown): { ok: true; value: NewCompanyRegister } | Fail {
  const top = newCompanyBodySchema.safeParse(raw)
  if (!top.success) {
    // A role that is not on the allowlist wins over any other problem in the body.
    const roleIssue = top.error.issues.find((i) => ROLE_KEYS.has(String(i.path[0])))
    if (roleIssue) {
      return { ok: false, error: UNKNOWN_COMPANY_ROLE, fieldErrors: { [String(roleIssue.path[0])]: UNKNOWN_COMPANY_ROLE } }
    }
    const issue = top.error.issues[0]
    const key = issue?.path.map(String).join('.') ?? ''
    if (!issue || issue.path.length === 0 || key === 'name' || key === 'company') {
      return { ok: false, error: 'Missing required fields: name, company', fieldErrors: {} }
    }
    return { ok: false, error: `${key}: ${issue.message}`, fieldErrors: { [key]: issue.message } }
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

  const holders: NewCompanyRegister['holders'] = []
  for (const [i, h] of body.titulares.entries()) {
    const parsed = parseWith(titularInputSchema, h)
    if (!parsed.ok) return failAt(`Holder ${i + 1}`, `titulares.${i}`, parsed)
    const nested = rows.safeParse(h && typeof h === 'object' ? (h as Record<string, unknown>).bank_accounts : null)
    if (!nested.success) return { ok: false, error: `Holder ${i + 1}: ${nested.error.issues[0]?.message}`, fieldErrors: {} }
    holders.push({ data: parsed.data, accounts: nested.data })
  }

  return { ok: true, value: { body, documents, taxId: cnpj ?? vat, holders, accounts: body.bank_accounts } }
}

/**
 * Every bank account of the form against the rules of `country`: the matched
 * company's on a link, the body's on a create. Run before any write. A titular_id
 * in the body is ignored: an account belongs to the company, or to the holder
 * it was sent under.
 */
export function parseRegisterAccounts(
  reg: Pick<NewCompanyRegister, 'holders' | 'accounts'>, country: string | null,
): { ok: true; value: RegisterRows } | Fail {
  const schema = bankAccountSchemaFor(country)
  const parseList = (raws: unknown[], label: (j: number) => string, path: (j: number) => string) => {
    const out: BankAccountInput[] = []
    for (const [j, raw] of raws.entries()) {
      const r = parseWith(schema, raw)
      if (!r.ok) return failAt(label(j), path(j), r)
      out.push({ ...r.data, titular_id: null })
    }
    return { ok: true as const, value: out }
  }
  const accounts = parseList(reg.accounts, (j) => `Bank account ${j + 1}`, (j) => `bank_accounts.${j}`)
  if (!accounts.ok) return accounts
  const holders: RegisterRows['holders'] = []
  for (const [i, h] of reg.holders.entries()) {
    const own = parseList(h.accounts, (j) => `Holder ${i + 1}, bank account ${j + 1}`, (j) => `titulares.${i}.bank_accounts.${j}`)
    if (!own.ok) return own
    holders.push({ data: h.data, accounts: own.value })
  }
  return { ok: true, value: { holders, accounts: accounts.value } }
}

const CANDIDATE_COLUMNS = 'id, name, fantasy_name, document_cnpj, vat_number, country'
const CANDIDATE_LIMIT = 50

const str = (v: unknown) => (typeof v === 'string' ? v : null)

/**
 * The companies the new one might be. SERVICE ROLE: a confined laboratory
 * cannot see them. The database cannot run the normalization, so this fetches
 * broadly (tax-id variants on document_cnpj and vat_number, the tax-id digits
 * in order with anything between them; the unaccented name_search /
 * fantasy_name_search columns by the longest name token and by all tokens in
 * order; 50 rows each) and decideCompanyMatch decides. The rows never leave
 * the server: callers get the decision only.
 */
async function fetchMatchCandidates(
  service: AnyClient, input: { name: string; taxId: string | null },
): Promise<(MatchCandidate & { country: string | null })[]> {
  const base = () => service.from('companies').select(CANDIDATE_COLUMNS)
  const reads: PromiseLike<{ data: unknown; error: { code?: string } | null }>[] = []
  const digits = digitsOf(input.taxId)
  if (digits.length >= TAX_ID_MIN_DIGITS) {
    const variants = docVariants(input.taxId)
    reads.push(base().in('document_cnpj', variants).limit(CANDIDATE_LIMIT))
    reads.push(base().in('vat_number', variants).limit(CANDIDATE_LIMIT))
    // Tax ids outside Brazil have no one format (DK12345678, 900.123.456-7,
    // "NL… / EORI: NL…"): the typed digits in order, anything between them.
    // decideCompanyMatch still links on equal digits only. Digits are safe
    // inside or() and ilike. document_cnpj too unless it is a CPF / CNPJ
    // length, which docVariants already covers.
    const spread = `%${digits.split('').join('%')}%`
    const columns = digits.length === 11 || digits.length === 14 ? ['vat_number'] : ['vat_number', 'document_cnpj']
    reads.push(base().or(columns.map((c) => `${c}.ilike.${spread}`).join(',')).limit(CANDIDATE_LIMIT))
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
  const out: (MatchCandidate & { country: string | null })[] = []
  for (const r of results) {
    if (r.error) throw new Error(`company candidates could not be read (${r.error.code ?? 'error'})`)
    for (const row of (Array.isArray(r.data) ? r.data : []) as Record<string, unknown>[]) {
      out.push({
        id: String(row.id), name: str(row.name) ?? '', fantasy_name: str(row.fantasy_name),
        document_cnpj: str(row.document_cnpj), vat_number: str(row.vat_number), country: str(row.country),
      })
    }
  }
  return out
}

/** A link carries the matched company's country, read with the service role:
 *  server-side only, for the bank-account rules. Never put it in a response. */
export type CompanyMatch = { kind: 'link'; companyId: string; country: string | null } | { kind: 'create' }

/** Link or create, for every caller (HQ too: no duplicate of a company that exists). Throws when the lookup fails. */
export async function findCompanyMatch(service: AnyClient, input: { name: string; taxId: string | null }): Promise<CompanyMatch> {
  const candidates = await fetchMatchCandidates(service, input)
  const decision: MatchDecision = decideCompanyMatch(input, candidates)
  if (decision.kind === 'create') return decision
  const matched = candidates.find((c) => c.id === decision.companyId)
  return { kind: 'link', companyId: decision.companyId, country: matched?.country ?? null }
}

type PgError = { code?: string; message?: string }

/** SERVICE ROLE (authenticated users have no insert policy on company_labs).
 *  An existing row is kept as it is, so a lab that created the company and
 *  adds it again keeps created_company. `createdLinkId` is the new row's id,
 *  null when the lab was linked before this request. */
export async function linkCompanyToLab(
  service: AnyClient, companyId: string, laboratoryId: string, createdCompany: boolean, userId: string,
): Promise<{ error: PgError | null; createdLinkId: string | null }> {
  const { data, error } = await service.from('company_labs').upsert(
    { company_id: companyId, laboratory_id: laboratoryId, created_company: createdCompany, created_by: userId },
    { onConflict: 'company_id,laboratory_id', ignoreDuplicates: true },
  ).select('id')
  if (error) return { error, createdLinkId: null }
  const inserted = (Array.isArray(data) ? data : []) as { id: string }[]
  return { error: null, createdLinkId: inserted.length === 1 ? String(inserted[0].id) : null }
}

/**
 * The stored tags exactly as they are (order, values, any role QC may not
 * set, even a non-string entry), then each wanted tag they lack. Null when
 * nothing is missing, or when the stored value is not a list (never rewritten).
 */
function addTags(stored: unknown, want: readonly string[]): unknown[] | null {
  const have: unknown[] | null = stored == null ? [] : Array.isArray(stored) ? stored : null
  if (have === null) return null
  const missing = [...new Set(want)].filter((t) => !have.includes(t))
  return missing.length > 0 ? [...have, ...missing] : null
}
const SETTLE_ATTEMPTS = 3

export interface SettleResult {
  error: string | null
  /** What this request changed (nothing when it was already so). */
  flagged: boolean
  reactivated: boolean
  tagsAdded: boolean
}

/**
 * The last step of a link, one SERVICE-ROLE write (a confined lab may not
 * update a company it only linked to): is_qc_client false -> true when the
 * request enrols it (spec Piece 1b, "a QC client somewhere"), is_active false
 * -> true (adding it in QC puts it back in use; the pickers list active
 * companies only), and the requested role tags appended (already allowlisted
 * by the body schema, roles.ts; a stored tag is never removed, reordered or
 * rewritten). The
 * patch is worked out from a fresh read, so what is already set needs no
 * write and counts as success; the write is guarded on updated_at, so a
 * concurrent change is read again instead of overwritten (no lost tag).
 */
export async function settleLinkedCompany(
  service: AnyClient, companyId: string, want: { qcClient: boolean; companyTypes: string[]; tradingRoles: string[] },
): Promise<SettleResult> {
  const none = { flagged: false, reactivated: false, tagsAdded: false }
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    const { data: row, error } = await service
      .from('companies').select('is_qc_client, is_active, company_types, trading_roles, updated_at')
      .eq('id', companyId).maybeSingle()
    if (error || !row) return { error: `company not readable (${error?.code ?? 'missing'})`, ...none }
    const patch: Record<string, unknown> = {}
    if (want.qcClient && row.is_qc_client !== true) patch.is_qc_client = true
    if (row.is_active !== true) patch.is_active = true
    const types = addTags(row.company_types, want.companyTypes)
    if (types) patch.company_types = types
    const roles = addTags(row.trading_roles, want.tradingRoles)
    if (roles) patch.trading_roles = roles
    if (Object.keys(patch).length === 0) return { error: null, ...none }
    const { data: updated, error: updateError } = await service
      .from('companies').update(patch).eq('id', companyId).eq('updated_at', row.updated_at).select('id')
    if (updateError) return { error: `company not updated (${updateError.code ?? 'error'})`, ...none }
    if (Array.isArray(updated) && updated.length === 1) {
      return {
        error: null,
        flagged: 'is_qc_client' in patch,
        reactivated: 'is_active' in patch,
        tagsAdded: 'company_types' in patch || 'trading_roles' in patch,
      }
    }
    // Changed by someone else between the read and the write: read again.
  }
  return { error: 'company kept changing', ...none }
}

/** What one add-company request wrote on an existing company, so a failure
 *  can take exactly that back (and nothing that existed before). */
export interface WriteLog {
  /** company_labs row this request inserted. */
  linkId: string | null
  /** qc_client_settings row this request inserted (an updated one is not listed). */
  settings: { companyId: string; laboratoryId: string } | null
  holderIds: string[]
  accountIds: string[]
  /** Accounts whose primary flag a new primary account took. */
  clearedPrimaryIds: string[]
}

export const emptyWriteLog = (): WriteLog => ({ linkId: null, settings: null, holderIds: [], accountIds: [], clearedPrimaryIds: [] })

/**
 * Undo a failed add-company request on an existing company. SERVICE ROLE for
 * the deletes (a lab never deletes holders, accounts or company_labs rows),
 * each by the id or key this request wrote; the primary flags it cleared are
 * put back with the session that cleared them. Accounts go before holders
 * (titular_id), the link last. Failures are logged by code, never by row.
 */
export async function undoWrites(service: AnyClient, supabase: AnyClient, log: WriteLog): Promise<void> {
  const report = (what: string, error: PgError | null | undefined) => {
    if (error) console.error(`[clients] undo of ${what} failed:`, error.code ?? error.message)
  }
  if (log.accountIds.length > 0) {
    report('bank accounts', (await service.from('company_bank_accounts').delete().in('id', log.accountIds)).error)
  }
  if (log.holderIds.length > 0) {
    report('holders', (await service.from('company_titulares').delete().in('id', log.holderIds)).error)
  }
  await restorePrimary(supabase, log.clearedPrimaryIds)
  if (log.settings) {
    report('settings', (await service.from('qc_client_settings').delete()
      .eq('company_id', log.settings.companyId).eq('laboratory_id', log.settings.laboratoryId)).error)
  }
  if (log.linkId) report('company_labs link', (await service.from('company_labs').delete().eq('id', log.linkId)).error)
}

/**
 * The holders and bank accounts, already valid (parseRegisterAccounts),
 * saved with the caller's SESSION client after the company exists or is
 * linked (the holder and account policies need the company_labs row).
 * `ownerLabId` is ownerLabFor(scope). Stops at the first row the database
 * refuses; every row written is recorded in `log`.
 */
export async function saveRegisterRows(
  supabase: AnyClient, companyId: string, reg: RegisterRows, userId: string, ownerLabId: string | null, log: WriteLog,
): Promise<{ error: { status: number; message: string } | null }> {
  const failed = (label: string, error: PgError) => {
    const { status, body } = mapRegisterError(error)
    return { error: { status, message: `${label}: ${body.error}` } }
  }
  const saveAccounts = async (list: BankAccountInput[], titularId: string | null, label: (j: number) => string) => {
    for (const [j, row] of list.entries()) {
      const r = await insertBankAccountRow(supabase, companyId, { ...row, titular_id: titularId }, userId, ownerLabId)
      if (r.error || !r.data) return failed(label(j), r.error ?? {})
      log.accountIds.push(String(r.data.id))
      log.clearedPrimaryIds.push(...r.clearedIds)
    }
    return { error: null }
  }
  const own = await saveAccounts(reg.accounts, null, (j) => `Bank account ${j + 1}`)
  if (own.error) return own
  for (const [i, h] of reg.holders.entries()) {
    const { data, error } = await insertTitularRow(supabase, companyId, h.data, userId, ownerLabId)
    if (error || !data) return failed(`Holder ${i + 1}`, error ?? {})
    log.holderIds.push(String(data.id))
    const theirs = await saveAccounts(h.accounts, String(data.id), (j) => `Holder ${i + 1}, bank account ${j + 1}`)
    if (theirs.error) return theirs
  }
  return { error: null }
}
