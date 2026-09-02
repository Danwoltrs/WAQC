import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { panelStats, DEFAULT_SPREAD_MAX, type PanelScore } from '@/lib/cupping/cva-panel'
import { parseCvaNumber } from '@/lib/cupping/cva-cupping-data'
import { computeAssessmentScore } from '@/lib/cva/scoring'
import { resolveLabSourceId } from '@/lib/sample-group'
import { CVA_PROTOCOL } from '@/lib/cupping-protocol-scope'
import type { CvaAssessment } from '@/types/cva'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/cupping/cva/panel?session_id=&sample_id=
 *
 * Everybody's CVA score for one lot in one session, with the spread between
 * them — the specialty answer to the commodity scores/aggregate route.
 *
 * BLIND: a caller whose own eight sections are not all rated gets their own
 * row and nothing else. Anchoring to a colleague's number is exactly what a
 * panel exists to prevent, so the rule lives here rather than in the step that
 * renders it.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const sampleId = searchParams.get('sample_id')
    if (!sessionId || !sampleId) {
      return NextResponse.json({ error: 'session_id and sample_id are required' }, { status: 400 })
    }

    const { data: session } = await admin
      .from('cupping_sessions')
      .select('id, sample_ids, cupper_ids, guest_cuppers, master_cupper_id')
      .eq('id', sessionId)
      .single()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Sessions and scores hang off the lab unit; a contract sibling reports the
    // cupping of the row it points at.
    const labId = await resolveLabSourceId(admin, sampleId)
    if (!((session as any).sample_ids ?? []).includes(labId)) {
      return NextResponse.json({ error: 'Sample is not part of this session' }, { status: 400 })
    }

    const { data: scoreRows } = await (admin as any)
      .from('cupping_scores')
      .select('cupper_id, cva_score, scores')
      .eq('session_id', sessionId)
      .eq('sample_id', labId)
      .eq('protocol', CVA_PROTOCOL)
      .order('updated_at', { ascending: false })

    // Newest row wins per cupper: autosave rewrites in place, but a legacy
    // duplicate would otherwise appear as two people.
    const byCupper = new Map<string, any>()
    for (const row of (scoreRows ?? []) as any[]) {
      if (row.cupper_id && !byCupper.has(row.cupper_id)) byCupper.set(row.cupper_id, row)
    }

    const isComplete = (row: any): boolean => {
      const a = row?.scores as CvaAssessment | undefined
      if (!a || typeof a !== 'object') return false
      return computeAssessmentScore(a).complete
    }

    const mine = byCupper.get(user.id)
    const blind = !isComplete(mine)

    const cupperIds = Array.from(byCupper.keys())
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, is_master_cupper')
      .in('id', cupperIds.length > 0 ? cupperIds : ['00000000-0000-0000-0000-000000000000'])

    const profileById = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]))

    // The certificate asserts the master cupper's reading; the session's own
    // designation wins, else whichever assigned cupper carries the flag. Same
    // rule scores/aggregate applies, and the same id pickAuthoritativeCvaRow
    // consumes — so the Panel and the certificate can never name different
    // people as authoritative.
    const authoritativeCupperId: string | null =
      ((session as any).master_cupper_id as string | null) ??
      (((profiles ?? []) as any[]).find((p) => p.is_master_cupper === true)?.id ?? null)

    const visibleIds = blind ? cupperIds.filter((id) => id === user.id) : cupperIds

    const cuppers = visibleIds.map((id) => {
      const row = byCupper.get(id)
      const assessment = (row?.scores ?? null) as CvaAssessment | null
      return {
        cupper_id: id,
        full_name: profileById.get(id)?.full_name ?? 'Unknown cupper',
        cva_score: parseCvaNumber(row?.cva_score),
        sections: assessment?.sections ?? null,
        is_master: id === authoritativeCupperId,
        is_you: id === user.id,
        complete: isComplete(row),
      }
    })

    // The threshold travels with the quality, like the pass mark does.
    let threshold = DEFAULT_SPREAD_MAX
    const { data: sample } = await admin
      .from('samples')
      .select('quality_spec_id')
      .eq('id', labId)
      .single()
    if ((sample as any)?.quality_spec_id) {
      const { data: spec } = await admin
        .from('client_qualities')
        .select('template:quality_templates(cva_score_spread_max)')
        .eq('id', (sample as any).quality_spec_id)
        .single()
      const configured = parseCvaNumber((spec as any)?.template?.cva_score_spread_max)
      if (configured != null) threshold = configured
    }

    // Statistics describe the WHOLE panel, so they are withheld entirely while
    // blind — a mean and a spread would leak the very numbers being withheld.
    const stats = blind
      ? { recorded: 0, mean: null, spread: 0, flagged: false, outliers: [] as string[] }
      : panelStats(
          cuppers.map((c): PanelScore => ({ cupper_id: c.cupper_id, cva_score: c.cva_score })),
          threshold,
        )

    return NextResponse.json({
      blind,
      cuppers,
      guests: ((session as any).guest_cuppers ?? []) as { id: string; name: string }[],
      threshold,
      authoritative_cupper_id: authoritativeCupperId,
      ...stats,
    })
  } catch (error) {
    console.error('GET /api/cupping/cva/panel', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
