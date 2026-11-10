import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { isQcEditablePurpose, setPurpose } from '@/lib/contacts/people'

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * PATCH /api/companies/[id]/people/[contactId]/purposes  { purpose, on }
 * Sets or clears ONE Quality column of the sys contact matrix. Every other tag
 * is left exactly as sys wrote it. Trading and Logistics columns are refused:
 * those are edited in sys.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const { id, contactId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { purpose?: unknown; on?: unknown } | null
  if (!body || !isQcEditablePurpose(body.purpose) || typeof body.on !== 'boolean') {
    return NextResponse.json({ error: 'Only the Quality columns can be changed here' }, { status: 400 })
  }

  const db = adminClient()
  const { data: contact, error } = await db
    .from('contacts')
    .select('id, company_id, routing_purposes')
    .eq('id', contactId)
    .maybeSingle()
  if (error) {
    console.error('contact purposes PATCH read error:', error)
    return NextResponse.json({ error: 'Failed to load the contact' }, { status: 500 })
  }
  // The contact must belong to the company in the URL.
  if (!contact || contact.company_id !== id) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const next = setPurpose(contact.routing_purposes as string[] | null, body.purpose, body.on)
  const { data: updated, error: upErr } = await db
    .from('contacts')
    .update({ routing_purposes: next })
    .eq('id', contactId)
    .select('id, routing_purposes')
    .single()
  if (upErr) {
    console.error('contact purposes PATCH update error:', upErr)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
  return NextResponse.json({ contact: updated })
}
