import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isRosterSession, type GuestCupper } from '@/lib/cupping/roster'

/**
 * POST /api/cupping/sample-assignments
 * Returns a map of sample_id -> { cuppers, session_id } for all samples that have active cupping sessions.
 * Body: { sample_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const sampleIds: string[] = body.sample_ids || []
    if (sampleIds.length === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Fetch cupping sessions (any non-cancelled status means cuppers are assigned)
    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('id, session_type, status, cupper_ids, guest_cuppers, sample_ids')
      .in('status', ['setup', 'active', 'review', 'completed'])
      .order('created_at', { ascending: false })

    if (sessionsError || !sessions || sessions.length === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Collect all unique cupper IDs across matching sessions
    const allCupperIds = new Set<string>()
    const sampleSessionMap: Record<string, { sessionId: string; cupperIds: string[]; guests: GuestCupper[] }> = {}

    // Rosters (specialty lots, 'cva' + 'setup') carry the assignment; a newer
    // per-cupper journey session holding the same lot must not shadow them.
    const ordered = [...sessions.filter(isRosterSession), ...sessions.filter((s) => !isRosterSession(s))]

    for (const session of ordered) {
      const sessionSampleIds = (session.sample_ids as string[]) || []
      const sessionCupperIds = (session.cupper_ids as string[]) || []
      // jsonb comes back typed Json; it is written by mergeGuests so the shape holds
      const sessionGuests = (Array.isArray(session.guest_cuppers) ? session.guest_cuppers : []) as unknown as GuestCupper[]

      for (const sampleId of sessionSampleIds) {
        if (sampleIds.includes(sampleId) && (sessionCupperIds.length > 0 || sessionGuests.length > 0)) {
          // First hit wins: rosters first, then newest session (ordered by created_at desc)
          if (!sampleSessionMap[sampleId]) {
            sampleSessionMap[sampleId] = {
              sessionId: session.id,
              cupperIds: sessionCupperIds,
              guests: sessionGuests,
            }
            sessionCupperIds.forEach(id => allCupperIds.add(id))
          }
        }
      }
    }

    if (Object.keys(sampleSessionMap).length === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Fetch all cupper profiles in one query (a guests-only roster has none)
    let cupperProfiles: Array<{ id: string; full_name: string; email: string }> = []
    if (allCupperIds.size > 0) {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(allCupperIds))
      if (profilesError) {
        return NextResponse.json({ assignments: {} })
      }
      cupperProfiles = data || []
    }

    const profileMap = new Map(cupperProfiles.map(p => [p.id, p]))

    // Build the response map
    const assignments: Record<string, {
      cuppers: Array<{ id: string; full_name: string; email: string }>
      session_id: string
      guests: GuestCupper[]
    }> = {}

    for (const [sampleId, info] of Object.entries(sampleSessionMap)) {
      assignments[sampleId] = {
        cuppers: info.cupperIds
          .map(id => profileMap.get(id))
          .filter(Boolean) as Array<{ id: string; full_name: string; email: string }>,
        session_id: info.sessionId,
        guests: info.guests,
      }
    }

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('Error in POST /api/cupping/sample-assignments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
