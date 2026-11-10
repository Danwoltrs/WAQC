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
 * Sets or clears the QC certificates column of the sys contact matrix. Every
 * other tag is left exactly as sys wrote it, and every other column is
 * refused: those are edited in sys.
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
    return NextResponse.json({ error: 'Only QC certificates can be changed here' }, { status: 400 })
  }

  const db = adminClient()
  // Compare-and-swap: sys writes other tags to the same array, so the update
  // only lands if the array is still what we read. On a clash, re-read and
  // try again rather than overwrite a concurrent sys change.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: contact, error } = await db
      .from('contacts')
      .select('id, company_id, is_active, routing_purposes')
      .eq('id', contactId)
      .maybeSingle()
    if (error) {
      console.error('contact purposes PATCH read error:', error)
      return NextResponse.json({ error: 'Failed to load the contact' }, { status: 500 })
    }
    // The contact must belong to the company in the URL and still be active.
    if (!contact || contact.company_id !== id || !contact.is_active) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const current = (contact.routing_purposes as string[] | null) ?? null
    const next = setPurpose(current, body.purpose, body.on)
    let update = db.from('contacts').update({ routing_purposes: next }).eq('id', contactId)
    update = current == null
      ? update.is('routing_purposes', null)
      // Purpose keys are snake_case words (sys check constraint), safe in an array literal.
      : update.filter('routing_purposes', 'eq', `{${current.join(',')}}`)
    const { data: updated, error: upErr } = await update.select('id, routing_purposes')
    if (upErr) {
      console.error('contact purposes PATCH update error:', upErr)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }
    if (updated && updated.length === 1) return NextResponse.json({ contact: updated[0] })
  }
  return NextResponse.json(
    { error: 'This contact was changed elsewhere at the same moment. Try again.' },
    { status: 409 },
  )
}
