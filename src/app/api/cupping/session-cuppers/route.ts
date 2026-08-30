import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { pickRosterSession, type GuestCupper, type RosterSessionRow } from '@/lib/cupping/roster'

/**
 * GET /api/cupping/session-cuppers?sample_ids=...&sample_ids=...
 * Returns the cuppers (roster order) and guests on the session holding the given samples; a specialty roster is preferred over journey sessions.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sampleIds = request.nextUrl.searchParams.getAll('sample_ids')
    if (sampleIds.length === 0) {
      return NextResponse.json({ cuppers: [], guests: [] })
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('id, session_type, status, cupper_ids, guest_cuppers, sample_ids')
      .in('status', ['setup', 'active', 'review', 'completed'])
      .order('created_at', { ascending: false })

    if (sessionsError || !sessions) {
      return NextResponse.json({ cuppers: [], guests: [] })
    }

    // A roster (specialty lots: 'cva' + 'setup') wins over the newer per-cupper
    // journey sessions holding the same lot — it is the one that knows everybody.
    // The generated row types say Json for the jsonb columns; the roster helper wants them shaped.
    const matching = pickRosterSession(sessions as unknown as RosterSessionRow[], sampleIds)
    if (!matching) {
      return NextResponse.json({ cuppers: [], guests: [] })
    }

    const cupperIds = (matching.cupper_ids ?? []) as string[]
    const guests: GuestCupper[] = Array.isArray(matching.guest_cuppers) ? matching.guest_cuppers : []

    let cuppers: { id: string; full_name: string; email: string }[] = []
    if (cupperIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', cupperIds)
      if (profilesError) {
        return NextResponse.json({ cuppers: [], guests, session_id: matching.id })
      }
      // Roster order, not the database's: the printed stacks follow it.
      const order = new Map(cupperIds.map((id, i) => [id, i]))
      cuppers = [...(profiles ?? [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    }

    return NextResponse.json({ cuppers, guests, session_id: matching.id })
  } catch (error) {
    console.error('Error in GET /api/cupping/session-cuppers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
