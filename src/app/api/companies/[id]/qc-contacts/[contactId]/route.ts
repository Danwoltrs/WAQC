import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { setQcCertTag, updateQcContactFields, type QcContactFields } from '@/lib/qc-contacts/upsert'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { contactId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | (QcContactFields & { preferredLanguage?: string | null })
    | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  try {
    const contact = await updateQcContactFields(adminClient(), contactId, {
      name: body.name,
      nickname: body.nickname,
      email: body.email,
      phone: body.phone,
      whatsapp: body.whatsapp,
      preferredLanguage: body.preferredLanguage,
      isGroup: body.isGroup,
    })
    return NextResponse.json({ contact })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to update contact' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { contactId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await setQcCertTag(adminClient(), contactId, false) // untag only — never deletes the row
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to remove contact' }, { status: 400 })
  }
}
