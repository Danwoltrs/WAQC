import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

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
      .select('id, cupper_ids, sample_ids, status')
      .in('status', ['active', 'review', 'completed'])
      .order('created_at', { ascending: false })

    if (sessionsError || !sessions || sessions.length === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Collect all unique cupper IDs across matching sessions
    const allCupperIds = new Set<string>()
    const sampleSessionMap: Record<string, { sessionId: string; cupperIds: string[] }> = {}

    for (const session of sessions) {
      const sessionSampleIds = (session.sample_ids as string[]) || []
      const sessionCupperIds = (session.cupper_ids as string[]) || []

      for (const sampleId of sessionSampleIds) {
        if (sampleIds.includes(sampleId) && sessionCupperIds.length > 0) {
          // Use the most recent session (already ordered by created_at desc)
          if (!sampleSessionMap[sampleId]) {
            sampleSessionMap[sampleId] = {
              sessionId: session.id,
              cupperIds: sessionCupperIds,
            }
            sessionCupperIds.forEach(id => allCupperIds.add(id))
          }
        }
      }
    }

    if (allCupperIds.size === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Fetch all cupper profiles in one query
    const { data: cupperProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(allCupperIds))

    if (profilesError) {
      return NextResponse.json({ assignments: {} })
    }

    const profileMap = new Map((cupperProfiles || []).map(p => [p.id, p]))

    // Build the response map
    const assignments: Record<string, {
      cuppers: Array<{ id: string; full_name: string; email: string }>
      session_id: string
    }> = {}

    for (const [sampleId, info] of Object.entries(sampleSessionMap)) {
      assignments[sampleId] = {
        cuppers: info.cupperIds
          .map(id => profileMap.get(id))
          .filter(Boolean) as Array<{ id: string; full_name: string; email: string }>,
        session_id: info.sessionId,
      }
    }

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('Error in POST /api/cupping/sample-assignments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
