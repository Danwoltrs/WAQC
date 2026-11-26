// Copy of sys api/companies/[id]/bank-accounts, keep in step. Auth is QC's (staff gate).
import { NextResponse, type NextRequest } from 'next/server'
import { BANK_ACCOUNT_COLUMNS } from '@/types/company-register'
import { bankAccountSchemaFor, parseWith, UUID_RE } from '@/lib/company-register/schema'
import {
  failRegister, insertBankAccountRow, loadCompanyCountry, normaliseAccount, requireRegisterStaff, titularBelongs,
} from '@/lib/company-register/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ error: 'Company not found' }, { status: 404 })

/** Every account of the company, oldest first (inactive too: callers filter). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()
  const { data, error } = await gate.supabase
    .from('company_bank_accounts').select(BANK_ACCOUNT_COLUMNS).eq('company_id', id).order('created_at')
  if (error) return failRegister(error)
  return NextResponse.json({ rows: (data ?? []).map(normaliseAccount) })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()
  const company = await loadCompanyCountry(gate.supabase, id)
  if (!company.found) return company.error ? failRegister(company.error) : notFound()
  const parsed = parseWith(bankAccountSchemaFor(company.country), await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, fieldErrors: parsed.fieldErrors }, { status: 400 })
  const row = parsed.data
  if (row.titular_id && !(await titularBelongs(gate.supabase, id, row.titular_id))) {
    return NextResponse.json({ error: 'The holder does not belong to this company' }, { status: 400 })
  }
  // owner_lab_id is stamped by the database trigger for session-client writes.
  const { data, error } = await insertBankAccountRow(gate.supabase, id, row, gate.userId)
  if (error || !data) return failRegister(error ?? {})
  return NextResponse.json({ row: normaliseAccount(data) }, { status: 201 })
}
