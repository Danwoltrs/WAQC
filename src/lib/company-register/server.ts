// Copy of sys src/lib/internal-market/register-server.ts (clearPrimary,
// restorePrimary, accountFullPatch, titularBelongs, mapRegisterError) and of
// register.ts (normaliseTitular, normaliseAccount), keep in step.
// Auth is QC's own: requireRegisterStaff (isStaffSampleManager), not sys modules.
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import type { BankAccount, PixKeyType, Titular } from '@/types/company-register'
import type { BankAccountInput } from './schema'

// The generated types know neither company_titulares nor the live bank columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** One primary per holder (the company's own accounts, titular_id null, count as one holder):
 *  clear the holder's current primary (except `exceptId`) before setting one.
 *  Returns the ids it cleared so a failed follow-up write can restore them. */
export async function clearPrimary(
  supabase: AnyClient, companyId: string, titularId: string | null, exceptId?: string,
): Promise<{ error: PgErrorLike | null; clearedIds: string[] }> {
  let q = supabase.from('company_bank_accounts').update({ is_primary: false }).eq('company_id', companyId).eq('is_primary', true)
  q = titularId ? q.eq('titular_id', titularId) : q.is('titular_id', null)
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
