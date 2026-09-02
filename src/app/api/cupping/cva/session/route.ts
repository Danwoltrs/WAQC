import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    // Accept a single sample_id (back-compat) or a sample_ids array (multi-sample tabs).
    const ids: string[] = Array.isArray(body?.sample_ids)
      ? body.sample_ids.filter(Boolean)
      : body?.sample_id
        ? [body.sample_id]
        : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'sample_id or sample_ids required' }, { status: 400 })
    }

    // Bind the ROSTER written at assignment (lib/cupping/roster.ts): one
    // session per lot, shared by everybody cupping it. Until 2026-09-01 this
    // route minted a session per cupper, which is why a specialty lot's
    // cuppers could never be compared and why assertCanFinalize's
    // isSingleCupperSession always fired, collapsing the two-cupper minimum
    // to one.
    //
    // Matching is "the roster that holds this lot", not an exact sample-set
    // match: a roster accumulates sample_ids as more lots are assigned to the
    // same panel, so an exact match would miss it the moment a second lot
    // joined.
    const { data: candidates } = await admin
      .from('cupping_sessions')
      .select('id, sample_ids, cupper_ids')
      .eq('session_type', 'cva')
      .eq('status', 'setup')
      .overlaps('sample_ids', ids)
      .order('created_at', { ascending: false })
      .limit(50)

    // Somebody opening a lot they were never assigned is not silently added to
    // another panel — they get their own session, as before.
    const roster = (candidates ?? []).find((c: any) =>
      ((c.cupper_ids ?? []) as string[]).includes(user.id),
    )
    if (roster) {
      return NextResponse.json({ session_id: (roster as any).id })
    }

    // Carry the first sample's lab onto the session when available.
    const { data: sample } = await admin
      .from('samples')
      .select('laboratory_id')
      .eq('id', ids[0])
      .single()

    // Born 'setup', like a roster: a lot cupped without a prior assignment
    // still ends up with the one shared session everything else now expects.
    const { data: created, error } = await admin
      .from('cupping_sessions')
      .insert({
        session_type: 'cva',
        status: 'setup',
        created_by: user.id,
        participants: [user.id],
        cupper_ids: [user.id],
        sample_ids: ids,
        laboratory_id: (sample as any)?.laboratory_id ?? null,
        min_cuppers_required: 1,
        allow_single_cupper: true,
      } as any)
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ session_id: created.id })
  } catch (error) {
    console.error('POST /api/cupping/cva/session', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
