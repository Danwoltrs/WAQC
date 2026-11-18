import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { serviceRoleClient } from '@/lib/supabase-service'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import {
  SAVED_DESTINATION_COLUMNS,
  listDestinationOptions,
  planSampleAddressSave,
  rowToDestination,
  staffDestinationInputSchema,
  type SampleAddressRow,
} from '@/lib/seller-requests/destinations'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

type Ctx = { params: Promise<{ id: string }> }

async function staffUser(): Promise<{ res: NextResponse } | { userId: string }> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id as string }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await staffUser()
  if ('res' in gate) return gate.res
  const { id } = await params
  const sp = req.nextUrl.searchParams
  try {
    const options = await listDestinationOptions(serviceRoleClient(), {
      clientId: id,
      importerId: sp.get('importerId'),
      roasterId: sp.get('roasterId'),
    })
    return NextResponse.json({ options })
  } catch (err) {
    console.error('sample-destinations GET error:', err)
    return NextResponse.json({ error: 'Could not load the sample destinations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await staffUser()
  if ('res' in gate) return gate.res
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a sample destination' }, { status: 400 })
  }
  const parsed = staffDestinationInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid sample destination' }, { status: 400 })
  }

  const admin = serviceRoleClient()
  const { data: company } = await admin.from('companies').select('id, name, fantasy_name').eq('id', id).maybeSingle()
  const ownerName = companyDisplayName((company ?? null) as never)

  const { data: onFile, error: onFileErr } = await admin
    .from('company_addresses')
    .select(SAVED_DESTINATION_COLUMNS)
    .eq('company_id', id)
    .eq('kind', 'sample')
  if (onFileErr) {
    console.error('sample-destinations read failed:', onFileErr.message)
    return NextResponse.json({ error: 'Could not save the destination' }, { status: 500 })
  }
  const plan = planSampleAddressSave((onFile ?? []) as unknown as SampleAddressRow[], parsed.data.lines)
  if (plan.action === 'full') return NextResponse.json({ error: plan.error }, { status: 400 })
  if (plan.action === 'repeat') {
    return NextResponse.json({ destination: rowToDestination(plan.row, ownerName), duplicate: true })
  }

  const insert = (by: string | null) =>
    admin
      .from('company_addresses')
      .insert({ ...parsed.data, company_id: id, kind: 'sample', created_by: by, updated_by: by })
      .select(SAVED_DESTINATION_COLUMNS)
      .single()
  let { data, error } = await insert(gate.userId)
  // created_by / updated_by reference sys user_profiles(id); a WAQC-only user has no row there.
  if (error?.code === '23503') ({ data, error } = await insert(null))
  if (error || !data) {
    console.error('sample-destinations insert failed:', error?.message ?? 'no row returned')
    return NextResponse.json({ error: 'Could not save the destination' }, { status: 500 })
  }
  return NextResponse.json({ destination: rowToDestination(data as unknown as SampleAddressRow, ownerName), duplicate: false })
}
