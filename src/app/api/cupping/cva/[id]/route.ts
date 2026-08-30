import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { computeAssessmentScore } from '@/lib/cva/scoring'
import { createEmptyAssessment, type CvaAssessment } from '@/types/cva'
import { isUUID, slugToTrackingNumber, trackingNumberToSlug } from '@/lib/utils'
import { resolveSampleReference } from '@/lib/sample-reference'
import { CVA_SESSION_TYPE, excludeRosterSessions } from '@/lib/cupping-protocol-scope'
import { buildOrEq } from '@/lib/search/or-filter'
import { canActorFinalize, type FinalizeActor, type FinalizeSession } from '@/lib/cupping/finalize-gate'
import { isRosterSession } from '@/lib/cupping/roster'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface SessionCtx {
  sampleIds: string[]
  /** Raw roster/role fields, shaped for canActorFinalize — nothing here is protocol-specific. */
  finalizeSession: FinalizeSession
}

/** Columns a journey URL may carry, in the order the lot itself is referenced. */
const REFERENCE_COLUMNS = [
  'exporter_sample_number',
  'container_nr',
  'ico_number',
  'tracking_number',
] as const

/** The route param is either the session UUID or a slug of the lot's own
    reference (the exporter's sample number, the container, the ICO) — the
    journey URL shows what the counterparty calls the lot, never the internal
    SAN- lab number. Links minted before that still carry the lab number, so
    tracking_number stays resolvable. A slug resolves to the newest CVA session
    containing a matching sample — never a roster (status 'setup'). */
async function resolveSessionId(param: string): Promise<string | null> {
  const raw = decodeURIComponent(param)
  if (isUUID(raw)) return raw
  const reference = slugToTrackingNumber(raw)
  const { data: sampleRows } = await admin
    .from('samples')
    .select('id')
    .or(buildOrEq([...REFERENCE_COLUMNS], reference))
    .limit(10)
  const sampleIds = ((sampleRows ?? []) as any[]).map((s) => s.id).filter(Boolean)
  if (sampleIds.length === 0) return null

  // A reference is not guaranteed unique the way the lab number is, so take the
  // newest CVA session across every sample that answers to it.
  let best: { id: string; created_at: string } | null = null
  for (const sampleId of sampleIds) {
    const { data: sessions } = await excludeRosterSessions(
      admin
        .from('cupping_sessions')
        .select('id, created_at')
        .eq('session_type', CVA_SESSION_TYPE),
    )
      .contains('sample_ids', [sampleId])
      .order('created_at', { ascending: false })
      .limit(1)
    const found = (sessions?.[0] as any) ?? null
    if (found && (!best || found.created_at > best.created_at)) best = found
  }
  return best?.id ?? null
}

async function loadSession(sessionId: string): Promise<SessionCtx | null> {
  const { data: session } = await admin
    .from('cupping_sessions')
    .select(
      'id, sample_ids, cupper_ids, master_cupper_id, min_cuppers_required, allow_single_cupper, session_type, status'
    )
    .eq('id', sessionId)
    .single()
  if (!session) return null
  // A roster is not a journey session — it holds who is assigned and no
  // scores — so a uuid link cannot reach one either, only the slug path.
  if (isRosterSession(session as any)) return null
  const sampleIds = ((session as any).sample_ids ?? []) as string[]
  if (sampleIds.length === 0) return null
  return { sampleIds, finalizeSession: session as any }
}

/** Resolve each sample's pass mark (quality_templates.cva_min_score) via its quality_spec. */
async function loadPassMarks(qualitySpecIds: string[]) {
  const out = new Map<string, { min_score: number | null; requires_descriptors: boolean }>()
  if (qualitySpecIds.length === 0) return out
  const { data: cqs } = await admin
    .from('client_qualities')
    .select('id, template_id')
    .in('id', qualitySpecIds)
  const templateBySpec = new Map<string, string>()
  const templateIds: string[] = []
  for (const cq of (cqs ?? []) as any[]) {
    if (cq.template_id) {
      templateBySpec.set(cq.id, cq.template_id)
      templateIds.push(cq.template_id)
    }
  }
  if (templateIds.length === 0) return out
  const { data: templates } = await admin
    .from('quality_templates')
    .select('id, cva_min_score, requires_descriptors')
    .in('id', templateIds)
  const byTemplate = new Map<string, any>()
  for (const t of (templates ?? []) as any[]) byTemplate.set(t.id, t)
  for (const [specId, templateId] of templateBySpec) {
    const t = byTemplate.get(templateId)
    out.set(specId, {
      min_score: t?.cva_min_score != null ? Number(t.cva_min_score) : null,
      requires_descriptors: !!t?.requires_descriptors,
    })
  }
  return out
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: idParam } = await params
    const sessionId = await resolveSessionId(idParam)
    const ctx = sessionId ? await loadSession(sessionId) : null
    if (!sessionId || !ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    // Same permission rule the finalize route enforces, asked read-only: this
    // only decides whether the journey should offer a Certify step, so a
    // missing profile just means no affordance rather than a failed load.
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper, is_global_admin, is_q_grader, qc_role')
      .eq('id', user.id)
      .single()
    const canFinalize = profile ? canActorFinalize(ctx.finalizeSession, profile as FinalizeActor) : false

    const { data: sampleRows } = await admin
      .from('samples')
      .select(
        'id, tracking_number, sample_type, exporter_sample_number, container_nr, ico_number, status, quality_spec_id'
      )
      .in('id', ctx.sampleIds)

    const specIds = Array.from(
      new Set((sampleRows ?? []).map((s: any) => s.quality_spec_id).filter(Boolean))
    ) as string[]
    const passMarks = await loadPassMarks(specIds)

    // Newest first so that, if a legacy duplicate row exists for a (sample,cupper),
    // the latest write wins deterministically (keep-first below).
    const { data: scoreRows } = await admin
      .from('cupping_scores')
      .select('sample_id, scores, updated_at')
      .eq('session_id', sessionId)
      .eq('cupper_id', user.id)
      .in('sample_id', ctx.sampleIds)
      .order('updated_at', { ascending: false })
    const assessmentBySample = new Map<string, CvaAssessment>()
    for (const r of (scoreRows ?? []) as any[]) {
      if (r.scores && !assessmentBySample.has(r.sample_id)) {
        assessmentBySample.set(r.sample_id, r.scores as CvaAssessment)
      }
    }

    // Preserve session order; fall back to the raw id if the sample row is missing.
    const byId = new Map<string, any>((sampleRows ?? []).map((s: any) => [s.id, s]))
    const samples = ctx.sampleIds.map((id) => {
      const s = byId.get(id)
      const pm = s?.quality_spec_id ? passMarks.get(s.quality_spec_id) : undefined
      // The journey never renders tracking_number: the cupper and the exporter
      // both know this lot by its own reference, so that is what ships.
      const ref = resolveSampleReference(s ?? {})
      return {
        id,
        reference: ref.primary || id,
        reference_secondary: ref.secondary,
        reference_slug: trackingNumberToSlug(ref.primary || ''),
        status: s?.status ?? null,
        min_score: pm?.min_score ?? null,
        requires_descriptors: pm?.requires_descriptors ?? false,
      }
    })
    const assessments: Record<string, CvaAssessment> = {}
    for (const id of ctx.sampleIds) {
      assessments[id] = assessmentBySample.get(id) ?? createEmptyAssessment()
    }

    return NextResponse.json(
      // session_id is the resolved database id — the route param above may be a
      // slug of the lot's own reference (see resolveSessionId), which the
      // finalize route does NOT resolve. Callers that POST to finalize must use
      // this value, not the raw route param.
      { session_id: sessionId, samples, assessments, can_finalize: canFinalize },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('GET /api/cupping/cva/[id]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: idParam } = await params
    const sessionId = await resolveSessionId(idParam)
    const ctx = sessionId ? await loadSession(sessionId) : null
    if (!sessionId || !ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const body = await request.json()
    const sampleId: string | undefined = body?.sample_id
    const incoming = body?.assessment as CvaAssessment | undefined
    if (!sampleId || !incoming) {
      return NextResponse.json({ error: 'sample_id and assessment required' }, { status: 400 })
    }
    if (!ctx.sampleIds.includes(sampleId)) {
      return NextResponse.json({ error: 'Sample not in session' }, { status: 400 })
    }

    // Re-verify the score server-side — never trust the client's number.
    const live = computeAssessmentScore(incoming)
    const payload: CvaAssessment = {
      ...incoming,
      protocol: 'cva',
      score: live.complete ? live.score : 0,
      u: live.u,
      d: live.d,
    }

    const rowData = {
      session_id: sessionId,
      sample_id: sampleId,
      cupper_id: user.id,
      scores: payload,
      protocol: 'cva',
      cva_score: live.complete ? live.score : null,
      entry_method: 'manual',
      updated_at: new Date().toISOString(),
    }

    // Resilient upsert without depending on a DB unique constraint: list all matching
    // rows (newest first — tolerates legacy duplicates without throwing like
    // .maybeSingle() would), update the latest, and prune any older duplicates so the
    // table self-heals back to one row per (session, sample, cupper).
    const findLatest = async () => {
      const { data } = await admin
        .from('cupping_scores')
        .select('id')
        .eq('session_id', sessionId)
        .eq('sample_id', sampleId)
        .eq('cupper_id', user.id)
        .order('updated_at', { ascending: false })
      return (data ?? []) as { id: string }[]
    }

    let rows = await findLatest()
    if (rows.length > 0) {
      const { error } = await admin.from('cupping_scores').update(rowData as any).eq('id', rows[0].id)
      if (error) throw error
      if (rows.length > 1) {
        await admin.from('cupping_scores').delete().in('id', rows.slice(1).map((r) => r.id))
      }
    } else {
      const { error } = await admin.from('cupping_scores').insert(rowData as any)
      if (error) {
        // A concurrent insert (or a DB unique index) may have won the race — fall back
        // to updating whatever row now exists instead of surfacing a 500.
        rows = await findLatest()
        if (rows.length > 0) {
          const { error: upErr } = await admin.from('cupping_scores').update(rowData as any).eq('id', rows[0].id)
          if (upErr) throw upErr
        } else {
          throw error
        }
      }
    }

    return NextResponse.json({ ok: true, cva_score: live.score, complete: live.complete })
  } catch (error) {
    console.error('PUT /api/cupping/cva/[id]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
