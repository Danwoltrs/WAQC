import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveSampleId } from '@/lib/sample-utils'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { isValidEmail } from '@/lib/html'

interface RecipientInput {
  client_id: string
  contact_emails?: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Select clause for joining the client display info — references companies
// post-consolidation. Aliased back to `client:` so downstream consumers don't
// need to know about the renamed source.
const RECIPIENT_SELECT = `
  id, client_id, contact_emails, status, comments,
  sent_at, responded_at, responded_by, created_at, updated_at,
  client:companies!sample_recipients_client_id_fkey(id, fantasy_name, name, country, email)
`.trim()

/**
 * Cap on incoming recipient data — defence against payload abuse / accidental
 * fan-out emails.
 */
const MAX_RECIPIENTS_PER_SAMPLE = 50
const MAX_EMAILS_PER_RECIPIENT = 10

/**
 * GET /api/samples/[id]/recipients
 * List recipients for a sample (joined with client info).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const resolved = await resolveSampleId(supabase as any, id)
    if (!resolved.id) {
      return NextResponse.json({ error: resolved.error || 'Sample not found' }, { status: 404 })
    }

    const access = await canUserManageSample(supabase as any, user.id, resolved.id)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await (supabase as any)
      .from('sample_recipients')
      .select(RECIPIENT_SELECT)
      .eq('sample_id', resolved.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('GET recipients error:', error)
      return NextResponse.json({ error: 'Failed to load recipients' }, { status: 500 })
    }

    return NextResponse.json({ recipients: data || [] })
  } catch (err: any) {
    console.error('GET /recipients exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/samples/[id]/recipients
 * Replace the recipient set for a sample. Body: { recipients: [{ client_id, contact_emails? }] }
 * Existing rows for the same (sample_id, client_id) are upserted (status preserved if already past 'pending');
 * recipients absent from the body are removed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const resolved = await resolveSampleId(supabase as any, id)
    if (!resolved.id) {
      return NextResponse.json({ error: resolved.error || 'Sample not found' }, { status: 404 })
    }

    const access = await canUserManageSample(supabase as any, user.id, resolved.id)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const rawRecipients: unknown = Array.isArray(body?.recipients) ? body.recipients : []

    // Validate and normalize input
    const recipients: RecipientInput[] = []
    for (const r of rawRecipients as any[]) {
      if (!r || typeof r !== 'object') continue
      if (typeof r.client_id !== 'string' || !UUID_RE.test(r.client_id)) continue

      const rawEmails = Array.isArray(r.contact_emails) ? r.contact_emails : []
      const emails = rawEmails
        .filter((e: unknown) => isValidEmail(e))
        .slice(0, MAX_EMAILS_PER_RECIPIENT) as string[]

      recipients.push({ client_id: r.client_id, contact_emails: emails })
    }

    if (recipients.length > MAX_RECIPIENTS_PER_SAMPLE) {
      return NextResponse.json({
        error: `Too many recipients (max ${MAX_RECIPIENTS_PER_SAMPLE})`,
      }, { status: 400 })
    }

    const incomingClientIds = new Set(recipients.map(r => r.client_id))

    // Remove rows that are no longer in the incoming set.
    if (incomingClientIds.size > 0) {
      await (supabase as any)
        .from('sample_recipients')
        .delete()
        .eq('sample_id', resolved.id)
        .not('client_id', 'in', `(${Array.from(incomingClientIds).map(c => `"${c}"`).join(',')})`)
    } else {
      await (supabase as any)
        .from('sample_recipients')
        .delete()
        .eq('sample_id', resolved.id)
    }

    // Upsert each recipient. Don't overwrite status/comments if a row already exists.
    const rows = recipients.map(r => ({
      sample_id: resolved.id,
      client_id: r.client_id,
      contact_emails: r.contact_emails || [],
    }))

    if (rows.length > 0) {
      const { error: upsertError } = await (supabase as any)
        .from('sample_recipients')
        .upsert(rows, { onConflict: 'sample_id,client_id', ignoreDuplicates: false })

      if (upsertError) {
        console.error('POST recipients upsert error:', upsertError)
        return NextResponse.json({ error: 'Failed to save recipients', details: upsertError.message }, { status: 500 })
      }
    }

    const { data: refreshed } = await (supabase as any)
      .from('sample_recipients')
      .select(RECIPIENT_SELECT)
      .eq('sample_id', resolved.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ recipients: refreshed || [] }, { status: 201 })
  } catch (err: any) {
    console.error('POST /recipients exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/samples/[id]/recipients
 * Update a single recipient row's status / comments.
 * Body: { recipient_id, status?, comments?, responded_at? }
 *
 * Note: responded_by is forced to the calling user — clients cannot impersonate
 * other users when marking a response.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const resolved = await resolveSampleId(supabase as any, id)
    if (!resolved.id) {
      return NextResponse.json({ error: resolved.error || 'Sample not found' }, { status: 404 })
    }

    const access = await canUserManageSample(supabase as any, user.id, resolved.id)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { recipient_id, status, comments, responded_at } = body || {}

    if (!recipient_id || typeof recipient_id !== 'string' || !UUID_RE.test(recipient_id)) {
      return NextResponse.json({ error: 'recipient_id required (UUID)' }, { status: 400 })
    }

    const VALID_STATUSES = ['pending', 'approved', 'rejected', 'no_response']
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    const update: Record<string, any> = {}
    if (status !== undefined) {
      update.status = status
      // Default responded_at to now when a non-pending status is set without explicit timestamp.
      if (status !== 'pending') {
        update.responded_at = responded_at || new Date().toISOString()
        // responded_by is always the caller — no impersonation
        update.responded_by = user.id
      }
    }
    if (comments !== undefined) update.comments = comments

    const { data, error } = await (supabase as any)
      .from('sample_recipients')
      .update(update)
      .eq('id', recipient_id)
      .eq('sample_id', resolved.id)
      .select(RECIPIENT_SELECT)
      .single()

    if (error) {
      console.error('PATCH recipients error:', error)
      return NextResponse.json({ error: 'Failed to update recipient', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ recipient: data })
  } catch (err: any) {
    console.error('PATCH /recipients exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
