// Copy of sys api/companies/[id]/bank-accounts/[accountId], keep in step. Auth is QC's (staff gate).
import { NextResponse, type NextRequest } from 'next/server'
import { BANK_ACCOUNT_COLUMNS } from '@/types/company-register'
import { bankAccountInputSchema, parseRegisterPatch, UUID_RE } from '@/lib/company-register/schema'
import {
  accountFullPatch, clearPrimary, failRegister, normaliseAccount, requireRegisterStaff, restorePrimary, titularBelongs,
} from '@/lib/company-register/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string; accountId: string }> }
const notFound = () => NextResponse.json({ error: 'Account not found' }, { status: 404 })

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id, accountId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(accountId)) return notFound()

  const { data: current, error: readErr } = await gate.supabase
    .from('company_bank_accounts').select('id, titular_id, is_active').eq('id', accountId).eq('company_id', id).maybeSingle()
  if (readErr) return failRegister(readErr)
  if (!current) return notFound()

  const raw: unknown = await req.json().catch(() => null)
  const sentPrimary = !!raw && typeof raw === 'object' && !Array.isArray(raw) && 'is_primary' in raw
  const p = parseRegisterPatch(raw, bankAccountInputSchema)
  if (p.kind === 'invalid') return NextResponse.json({ error: p.error, fieldErrors: p.fieldErrors }, { status: 400 })

  let patch: Record<string, unknown>
  let clearedIds: string[] = []
  if (p.kind === 'active') {
    // A deactivated account cannot stay the holder's primary.
    patch = p.is_active ? { is_active: true } : { is_active: false, is_primary: false }
  } else if (p.kind === 'primary') {
    const { error, clearedIds: ids } = await clearPrimary(gate.supabase, id, current.titular_id ?? null, accountId)
    if (error) return failRegister(error)
    clearedIds = ids
    patch = { is_primary: true, is_active: true }
  } else {
    if (p.data.titular_id && !(await titularBelongs(gate.supabase, id, p.data.titular_id))) {
      return NextResponse.json({ error: 'The holder does not belong to this company' }, { status: 400 })
    }
    const full = accountFullPatch(p.data, sentPrimary, current.is_active !== false)
    if (full.clear) {
      const { error, clearedIds: ids } = await clearPrimary(gate.supabase, id, p.data.titular_id, accountId)
      if (error) return failRegister(error)
      clearedIds = ids
    }
    patch = full.patch
  }

  const { data, error } = await gate.supabase
    .from('company_bank_accounts').update({ ...patch, updated_by: gate.userId })
    .eq('id', accountId).eq('company_id', id).select(BANK_ACCOUNT_COLUMNS).single()
  if (error) {
    await restorePrimary(gate.supabase, clearedIds)
    return failRegister(error)
  }
  return NextResponse.json({ row: normaliseAccount(data) })
}
