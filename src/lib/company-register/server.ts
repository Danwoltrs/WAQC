// Copy of sys src/lib/internal-market/register-server.ts (clearPrimary,
// restorePrimary, accountFullPatch, titularBelongs, mapRegisterError) and of
// register.ts (normaliseTitular, normaliseAccount), keep in step.
// Auth is QC's own: requireRegisterStaff (isStaffSampleManager), not sys modules.
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { loadLabScope, ownerLabFor, readsAllLabs } from '@/lib/auth/lab-scope'
import { BANK_ACCOUNT_COLUMNS, TITULAR_COLUMNS, type BankAccount, type PixKeyType, type Titular } from '@/types/company-register'
import type { BankAccountInput, TitularInput } from './schema'

// The generated types know neither company_titulares nor the live bank columns.
export type AnyClient = any
interface PgErrorLike { code?: string; message?: string }

export type StaffGate =
  | { ok: true; supabase: SupabaseClient & AnyClient; userId: string }
  | { ok: false; res: NextResponse }

/** Any active QC login (spec decision 1): 401 without a session, 403 for non-staff. */
export async function requireRegisterStaff(): Promise<StaffGate> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, supabase, userId: user.id }
}

export function mapRegisterError(err: PgErrorLike): { status: number; body: { error: string } } {
  if (err.code === '42501') return { status: 403, body: { error: 'Not allowed' } }
  if (err.code === '22P02') return { status: 404, body: { error: 'Not found' } }
  if (err.code === '23514') return { status: 400, body: { error: 'Enter the account number or the PIX key' } }
  return { status: 400, body: { error: err.message || 'Could not save' } }
}

export const failRegister = (err: PgErrorLike) => {
  const { status, body } = mapRegisterError(err)
  return NextResponse.json(body, { status })
}

/** One primary per holder (the company's own accounts, titular_id null, count as one holder)
 *  and per owner: clear the holder's current primary (except `exceptId`) before setting one.
 *  Only rows with the same `owner_lab_id` as the account being made primary
 *  (`ownerLabId`, null for sys / Santos) are cleared: each laboratory keeps
 *  its own primary, so HQ setting one never clears a confined lab's, nor the
 *  other way round. Returns the ids it cleared so a failed follow-up write can
 *  restore them (restorePrimary works on those ids, so it stays owner-scoped). */
export async function clearPrimary(
  supabase: AnyClient, companyId: string, titularId: string | null, ownerLabId: string | null, exceptId?: string,
): Promise<{ error: PgErrorLike | null; clearedIds: string[] }> {
  let q = supabase.from('company_bank_accounts').update({ is_primary: false }).eq('company_id', companyId).eq('is_primary', true)
  q = titularId ? q.eq('titular_id', titularId) : q.is('titular_id', null)
  // owner_lab_id IS NOT DISTINCT FROM ownerLabId
  q = ownerLabId === null ? q.is('owner_lab_id', null) : q.eq('owner_lab_id', ownerLabId)
  if (exceptId) q = q.neq('id', exceptId)
  const { data, error } = await q.select('id')
  const clearedIds = ((data ?? []) as { id: string }[]).map((r) => r.id)
  return { error: error ?? null, clearedIds }
}

/** Undo clearPrimary after the write that was meant to follow it failed. */
export async function restorePrimary(supabase: AnyClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('company_bank_accounts').update({ is_primary: true }).in('id', ids)
  // The holder is left with no primary until someone sets one again.
  if (error) console.error('[companies] restorePrimary failed, primary not restored', { ids, error })
}

type InsertResult = { data: Record<string, unknown> | null; error: PgErrorLike | null }

/** `owner_lab_id` undefined leaves it to the database trigger (session writes);
 *  a value (ownerLabFor(scope), null for HQ) is written as given. */
const withOwner = (row: Record<string, unknown>, ownerLabId: string | null | undefined) =>
  ownerLabId === undefined ? row : { ...row, owner_lab_id: ownerLabId }

/** Insert one holder of `companyId`, returning TITULAR_COLUMNS. */
export async function insertTitularRow(
  supabase: AnyClient, companyId: string, data: TitularInput, userId: string, ownerLabId?: string | null,
): Promise<InsertResult> {
  const { data: row, error } = await supabase
    .from('company_titulares')
    .insert(withOwner({ ...data, company_id: companyId, created_by: userId, updated_by: userId }, ownerLabId))
    .select(TITULAR_COLUMNS).single()
  return { data: row ?? null, error: error ?? null }
}

/** Insert one account of `companyId`: a primary one first clears its holder's
 *  current primary, which is restored when the insert fails. The caller has
 *  checked that `row.titular_id` (if any) belongs to the company.
 *  `clearedIds` (on success) lets a caller undo the swap later. */
export async function insertBankAccountRow(
  supabase: AnyClient, companyId: string, row: BankAccountInput, userId: string, ownerLabId?: string | null,
): Promise<InsertResult & { clearedIds: string[] }> {
  let clearedIds: string[] = []
  if (row.is_primary) {
    // The new row's owner: as given, else what the trigger will stamp
    // (qc_read_scope_lab(), which ownerLabFor mirrors for staff).
    let owner: string | null
    try {
      owner = ownerLabId !== undefined ? ownerLabId : ownerLabFor(await loadLabScope(supabase, userId))
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'Could not read the laboratory scope' }, clearedIds: [] }
    }
    const cleared = await clearPrimary(supabase, companyId, row.titular_id, owner)
    if (cleared.error) return { data: null, error: cleared.error, clearedIds: [] }
    clearedIds = cleared.clearedIds
  }
  const { data, error } = await supabase
    .from('company_bank_accounts')
    .insert(withOwner({ ...row, company_id: companyId, created_by: userId, updated_by: userId }, ownerLabId))
    .select(BANK_ACCOUNT_COLUMNS).single()
  if (error) {
    await restorePrimary(supabase, clearedIds)
    return { data: null, error, clearedIds: [] }
  }
  return { data: data ?? null, error: null, clearedIds }
}

/** Full-row account edit: is_primary is written only when the body carried it,
 *  and an inactive account is never primary (and never displaces one). */
export function accountFullPatch(
  data: BankAccountInput, sentPrimary: boolean, storedActive: boolean,
): { patch: Record<string, unknown>; clear: boolean } {
  const { is_primary, ...rest } = data
  const patch: Record<string, unknown> = { ...rest }
  if (!storedActive) {
    patch.is_primary = false
    return { patch, clear: false }
  }
  if (sentPrimary) patch.is_primary = is_primary
  return { patch, clear: sentPrimary && is_primary }
}

/** The company's own country, read under the caller's session. `found: false` when the row is missing or hidden by RLS. */
export async function loadCompanyCountry(
  supabase: AnyClient, companyId: string,
): Promise<{ found: false; error: PgErrorLike | null } | { found: true; country: string | null }> {
  const { data, error } = await supabase.from('companies').select('id, country').eq('id', companyId).maybeSingle()
  if (error || !data) return { found: false, error: error ?? null }
  return { found: true, country: typeof data.country === 'string' ? data.country : null }
}

export async function titularBelongs(supabase: AnyClient, companyId: string, titularId: string): Promise<boolean> {
  const { data } = await supabase.from('company_titulares').select('id').eq('id', titularId).eq('company_id', companyId).maybeSingle()
  return !!data
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export function normaliseTitular(raw: Record<string, unknown>): Titular {
  return {
    id: String(raw.id),
    company_id: String(raw.company_id),
    person_type: raw.person_type === 'J' ? 'J' : 'F',
    name: str(raw.name) ?? '',
    cpf_cnpj: str(raw.cpf_cnpj), rg: str(raw.rg), ie_ipr: str(raw.ie_ipr), farm_line: str(raw.farm_line),
    address: str(raw.address), zip: str(raw.zip), city: str(raw.city), state: str(raw.state), notes: str(raw.notes),
    is_active: raw.is_active !== false,
    owner_lab_id: str(raw.owner_lab_id),
  }
}

export function normaliseAccount(raw: Record<string, unknown>): BankAccount {
  return {
    id: String(raw.id),
    company_id: String(raw.company_id),
    titular_id: str(raw.titular_id),
    bank_name: str(raw.bank_name), routing_code: str(raw.routing_code), branch: str(raw.branch),
    account_number: str(raw.account_number),
    account_type: raw.account_type === 'corrente' || raw.account_type === 'poupanca' ? raw.account_type : null,
    pix_key: str(raw.pix_key),
    pix_key_type: (str(raw.pix_key_type) as PixKeyType | null) ?? null,
    label: str(raw.label),
    is_primary: raw.is_primary === true,
    is_active: raw.is_active !== false,
    owner_lab_id: str(raw.owner_lab_id),
  }
}

/** May the caller edit the company's own fields (name, address, documents)?
 *  Mirrors the companies UPDATE policy companies_lab_scope_update: a caller who
 *  reads every lab (HQ, global admin, no lab) may; a confined lab only for a
 *  company it created (company_labs.created_company). Holders and bank accounts
 *  are open to every QC login and do not depend on this. */
export async function canEditCompany(supabase: AnyClient, userId: string, companyId: string): Promise<boolean> {
  const scope = await loadLabScope(supabase, userId)
  if (readsAllLabs(scope)) return true
  const { data } = await supabase
    .from('company_labs').select('created_company')
    .eq('company_id', companyId).eq('laboratory_id', scope.ownLabId).eq('created_company', true).limit(1)
  return Array.isArray(data) && data.length > 0
}
