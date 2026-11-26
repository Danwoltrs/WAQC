// Copy of sys api/companies/[id]/titulares/[titularId], keep in step. Auth is QC's (staff gate).
import { NextResponse, type NextRequest } from 'next/server'
import { TITULAR_COLUMNS } from '@/types/company-register'
import { parseRegisterPatch, titularInputSchema, UUID_RE } from '@/lib/company-register/schema'
import { failRegister, normaliseTitular, requireRegisterStaff } from '@/lib/company-register/server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string; titularId: string }> }
const notFound = () => NextResponse.json({ error: 'Holder not found' }, { status: 404 })

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRegisterStaff()
  if (!gate.ok) return gate.res
  const { id, titularId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(titularId)) return notFound()
  const p = parseRegisterPatch(await req.json().catch(() => null), titularInputSchema)
  if (p.kind === 'invalid') return NextResponse.json({ error: p.error, fieldErrors: p.fieldErrors }, { status: 400 })
  if (p.kind === 'primary') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  const patch = { ...(p.kind === 'active' ? { is_active: p.is_active } : p.data), updated_by: gate.userId }
  const { data, error } = await gate.supabase
    .from('company_titulares').update(patch).eq('id', titularId).eq('company_id', id).select(TITULAR_COLUMNS).maybeSingle()
  if (error) return failRegister(error)
  if (!data) return notFound()
  return NextResponse.json({ row: normaliseTitular(data) })
}
