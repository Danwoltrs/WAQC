import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/cupping/session-cuppers?sample_ids=...&sample_ids=...
 * Returns the cuppers assigned to an active cupping session containing the given samples.
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
      return NextResponse.json({ cuppers: [] })
    }

    // Find cupping sessions that contain any of the selected samples
    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('id, cupper_ids, sample_ids, status')
      .in('status', ['setup', 'active', 'review', 'completed'])
      .order('created_at', { ascending: false })

    if (sessionsError || !sessions || sessions.length === 0) {
      return NextResponse.json({ cuppers: [] })
    }

    // Find the session that contains any of the selected sample IDs
    const matchingSession = sessions.find((session: any) => {
      const sessionSampleIds = (session.sample_ids as string[]) || []
      return sampleIds.some(id => sessionSampleIds.includes(id))
    })

    if (!matchingSession || !matchingSession.cupper_ids || (matchingSession.cupper_ids as string[]).length === 0) {
      return NextResponse.json({ cuppers: [] })
    }

    const cupperIds = matchingSession.cupper_ids as string[]

    // Fetch cupper profiles
    const { data: cupperProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', cupperIds)

    if (profilesError) {
      return NextResponse.json({ cuppers: [] })
    }

    return NextResponse.json({
      cuppers: cupperProfiles || [],
      session_id: matchingSession.id,
    })
  } catch (error) {
    console.error('Error in GET /api/cupping/session-cuppers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
