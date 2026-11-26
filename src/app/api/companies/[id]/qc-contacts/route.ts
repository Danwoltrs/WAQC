import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { isValidEmail } from '@/lib/html'
import { splitQcContacts, QC_CONTACT_COLUMNS, type QcContactRecord } from '@/lib/qc-contacts/tags'
import { upsertQcRecipient } from '@/lib/qc-contacts/upsert'
import { loadLabScope, ownerLabFor, readsAllLabs } from '@/lib/auth/lab-scope'
import { fetchOwnedContacts } from '@/lib/qc-contacts/owned-rows'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const owner = ownerLabFor(await loadLabScope(supabase, user.id))
  let data: QcContactRecord[]
  try {
    data = await fetchOwnedContacts<QcContactRecord>(adminClient(), [id], owner, {
      taggedOnly: true,
      columns: QC_CONTACT_COLUMNS,
    })
  } catch (error) {
    console.error('qc-contacts GET error:', error)
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 })
  }
  const { people, groups } = splitQcContacts(data)
  return NextResponse.json({ people, groups })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string; name?: string | null; nickname?: string | null; isGroup?: boolean
    phone?: string | null; whatsapp?: string | null; preferredLanguage?: string | null
  } | null
  const email = body?.email?.trim()
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const scope = await loadLabScope(supabase, user.id)
  // Mirrors the database's with_check: a confined lab adds contacts only to a
  // company it is linked to (company_labs).
  if (!readsAllLabs(scope)) {
    const { data: link, error: linkError } = await adminClient()
      .from('company_labs')
      .select('company_id')
      .eq('company_id', id)
      .eq('laboratory_id', scope.ownLabId!)
      .limit(1)
    if (linkError) return NextResponse.json({ error: 'Failed to check the company' }, { status: 500 })
    if (!link || link.length === 0) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }
  const owner = ownerLabFor(scope)
  try {
    const contact = await upsertQcRecipient(
      adminClient(),
      id,
      {
        email,
        name: body?.name ?? null,
        nickname: body?.nickname ?? null,
        isGroup: !!body?.isGroup,
        phone: body?.phone ?? null,
        whatsapp: body?.whatsapp ?? null,
        preferredLanguage: body?.preferredLanguage ?? null,
      },
      user.id,
      owner,
    )
    return NextResponse.json({ contact })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to add contact' }, { status: 400 })
  }
}
