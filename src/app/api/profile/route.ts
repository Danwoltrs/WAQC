import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderAndStoreSignatures } from '@/lib/signatures/context'

/**
 * GET /api/profile
 * Returns the current user's profile, including all signature-related
 * fields. The cached email_signature_html is returned so the settings
 * page can show the live preview without re-rendering on the client.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id, qc_role, laboratory_id, full_name, email,
        is_q_grader, is_master_cupper, is_cupper, is_global_admin,
        title, phone, whatsapp, teams_email,
        email_signature_html, email_signature_compact_html
      `)
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError)
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Error in GET /api/profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Only signature-related fields are settable through this endpoint —
// role/permissions stay locked to admin-only flows elsewhere.
const SETTABLE_FIELDS = ['title', 'phone', 'whatsapp', 'teams_email'] as const

/**
 * PATCH /api/profile
 * Update signature-related profile fields, then re-render and persist
 * both signature variants. Returns the updated profile + the rendered
 * HTML so the settings page can refresh its preview without an extra
 * GET round trip.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const updates: Record<string, string | null> = {}
    for (const field of SETTABLE_FIELDS) {
      if (field in body) {
        const raw = body[field]
        if (raw === null || raw === undefined) {
          updates[field] = null
        } else if (typeof raw === 'string') {
          const trimmed = raw.trim()
          updates[field] = trimmed.length > 0 ? trimmed : null
        } else {
          return NextResponse.json(
            { error: `${field} must be a string or null` },
            { status: 400 }
          )
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (updateError) {
        console.error('[profile] PATCH update failed:', updateError)
        return NextResponse.json(
          { error: 'Failed to update profile', details: updateError.message },
          { status: 500 }
        )
      }
    }

    // Re-render and persist the signature HTML. Done after the update so
    // it reflects whatever the user just typed.
    const rendered = await renderAndStoreSignatures(supabase, user.id)

    // Return the fresh profile so the client can update its state.
    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        id, qc_role, laboratory_id, full_name, email,
        is_q_grader, is_master_cupper, is_cupper, is_global_admin,
        title, phone, whatsapp, teams_email,
        email_signature_html, email_signature_compact_html
      `)
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      profile,
      signature: rendered
        ? { full: rendered.full, compact: rendered.compact }
        : null,
    })
  } catch (error) {
    console.error('Error in PATCH /api/profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
