import { NextResponse, type NextRequest } from 'next/server'
import { companyPatchSchema, COMPANY_COLUMNS } from '@/lib/company-register/company-schema'
import { parseWith, UUID_RE } from '@/lib/company-register/schema'
import { canEditCompany, failRegister, requireRegisterStaff } from '@/lib/company-register/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ error: 'Company not found' }, { status: 404 })

/** The company and whether the caller may edit its own fields. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()
  const { data, error } = await gate.supabase.from('companies').select(COMPANY_COLUMNS).eq('id', id).maybeSingle()
  if (error) return failRegister(error)
  if (!data) return notFound()
  const canEdit = await canEditCompany(gate.supabase, gate.userId, id)
  return NextResponse.json({ company: data, canEditCompany: canEdit })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id } = await params
  if (!UUID_RE.test(id)) return notFound()
  if (!(await canEditCompany(gate.supabase, gate.userId, id))) {
    return NextResponse.json({ error: 'This company belongs to another laboratory: it can be viewed, not changed' }, { status: 403 })
  }
  const parsed = parseWith(companyPatchSchema, await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, fieldErrors: parsed.fieldErrors }, { status: 400 })
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  const { data, error } = await gate.supabase
    .from('companies').update(parsed.data).eq('id', id).select(COMPANY_COLUMNS).maybeSingle()
  if (error) return failRegister(error)
  if (!data) return notFound()
  return NextResponse.json({ company: data })
}
