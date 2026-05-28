import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveSampleId } from '@/lib/sample-utils'

interface RecipientInput {
  client_id: string
  contact_emails?: string[]
}

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

    const { data, error } = await (supabase as any)
      .from('sample_recipients')
      .select('id, client_id, contact_emails, status, comments, sent_at, responded_at, responded_by, created_at, updated_at, client:clients(id, company, fantasy_name, country, email)')
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

    const body = await request.json()
    const recipients: RecipientInput[] = Array.isArray(body?.recipients) ? body.recipients : []

    const incomingClientIds = new Set(recipients.map(r => r.client_id).filter(Boolean))

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
    const rows = recipients
      .filter(r => r.client_id)
      .map(r => ({
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
      .select('id, client_id, contact_emails, status, comments, sent_at, responded_at, responded_by, created_at, updated_at, client:clients(id, company, fantasy_name, country, email)')
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
 * Body: { recipient_id, status?, comments?, responded_at?, responded_by? }
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

    const body = await request.json()
    const { recipient_id, status, comments, responded_at, responded_by } = body || {}

    if (!recipient_id) {
      return NextResponse.json({ error: 'recipient_id required' }, { status: 400 })
    }

    const VALID_STATUSES = ['pending', 'approved', 'rejected', 'no_response']
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    const update: Record<string, any> = {}
    if (status !== undefined) {
      update.status = status
      // Default responded_at to now when a non-pending status is set without explicit timestamp.
      if (status !== 'pending' && !responded_at) {
        update.responded_at = new Date().toISOString()
      }
      if (status !== 'pending' && !responded_by) {
        update.responded_by = user.id
      }
    }
    if (comments !== undefined) update.comments = comments
    if (responded_at !== undefined) update.responded_at = responded_at
    if (responded_by !== undefined) update.responded_by = responded_by

    const { data, error } = await (supabase as any)
      .from('sample_recipients')
      .update(update)
      .eq('id', recipient_id)
      .eq('sample_id', resolved.id)
      .select('id, client_id, contact_emails, status, comments, sent_at, responded_at, responded_by, created_at, updated_at, client:clients(id, company, fantasy_name, country, email)')
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
