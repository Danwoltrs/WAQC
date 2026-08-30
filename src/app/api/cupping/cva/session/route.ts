import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set([...a, ...b]).size === a.length

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

    // Reuse a CVA session this cupper already owns that holds exactly this set —
    // including one already 'completed': a specialty lot's two-part gate (cup +
    // green bean) often leaves the cup approved but the sample "pending", with
    // nothing to auto-certify it once grading lands (autoCertifyIfReady needs
    // commodity score rows, which a specialty lot never has). Re-opening this
    // lot from the picker is the only way it ever gets certified, so a
    // 'completed' session must be found here too — otherwise this query comes
    // back empty, a brand-new EMPTY session gets minted below, and the
    // finalize gate then 400s with "0 of 1 required cuppers" because the new
    // session has none of the old one's cupping_scores rows.
    const { data: candidates } = await admin
      .from('cupping_sessions')
      .select('id, sample_ids')
      .eq('session_type', 'cva')
      .eq('created_by', user.id)
      // Never 'setup': that is a ROSTER (who is assigned, staff + guests,
      // written at assignment — lib/cupping/roster.ts). Reusing one would hand
      // this cupper a session whose cupper_ids feed the finalize gate.
      .in('status', ['active', 'review', 'completed'])
      .order('created_at', { ascending: false })
      .limit(25)

    const match = (candidates ?? []).find((c: any) => sameSet((c.sample_ids ?? []) as string[], ids))
    if (match) {
      return NextResponse.json({ session_id: (match as any).id })
    }

    // Carry the first sample's lab onto the session when available.
    const { data: sample } = await admin
      .from('samples')
      .select('laboratory_id')
      .eq('id', ids[0])
      .single()

    const { data: created, error } = await admin
      .from('cupping_sessions')
      .insert({
        session_type: 'cva',
        status: 'active',
        created_by: user.id,
        participants: [user.id],
        cupper_ids: [user.id],
        sample_ids: ids,
        laboratory_id: (sample as any)?.laboratory_id ?? null,
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
