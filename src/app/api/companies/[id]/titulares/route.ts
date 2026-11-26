// Copy of sys api/companies/[id]/titulares, keep in step. Auth is QC's (staff gate).
import { NextResponse, type NextRequest } from 'next/server'
import { TITULAR_COLUMNS } from '@/types/company-register'
import { titularInputSchema, parseWith, UUID_RE } from '@/lib/company-register/schema'
import { failRegister, insertTitularRow, normaliseTitular, requireRegisterStaff } from '@/lib/company-register/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ error: 'Company not found' }, { status: 404 })

/** Every holder of the company (inactive too: the screen filters). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()
  const { data, error } = await gate.supabase
    .from('company_titulares').select(TITULAR_COLUMNS).eq('company_id', id).order('name')
  if (error) return failRegister(error)
  return NextResponse.json({ rows: (data ?? []).map(normaliseTitular) })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()
  const parsed = parseWith(titularInputSchema, await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, fieldErrors: parsed.fieldErrors }, { status: 400 })
  // owner_lab_id is stamped by the database trigger for session-client writes.
  const { data, error } = await insertTitularRow(gate.supabase, id, parsed.data, gate.userId)
  if (error || !data) return failRegister(error ?? {})
  return NextResponse.json({ row: normaliseTitular(data) }, { status: 201 })
}
