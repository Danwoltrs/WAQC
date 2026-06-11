import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { computeAssessmentScore } from '@/lib/cva/scoring'
import { createEmptyAssessment, type CvaAssessment } from '@/types/cva'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

interface SessionCtx {
  sampleIds: string[]
}

async function loadSession(sessionId: string): Promise<SessionCtx | null> {
  const { data: session } = await admin
    .from('cupping_sessions')
    .select('id, sample_ids, session_type, status')
    .eq('id', sessionId)
    .single()
  if (!session) return null
  const sampleIds = ((session as any).sample_ids ?? []) as string[]
  if (sampleIds.length === 0) return null
  return { sampleIds }
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

    const { id: sessionId } = await params
    const ctx = await loadSession(sessionId)
    if (!ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const { data: sampleRows } = await admin
      .from('samples')
      .select('id, tracking_number, status, quality_spec_id')
      .in('id', ctx.sampleIds)

    const specIds = Array.from(
      new Set((sampleRows ?? []).map((s: any) => s.quality_spec_id).filter(Boolean))
    ) as string[]
    const passMarks = await loadPassMarks(specIds)

    const { data: scoreRows } = await admin
      .from('cupping_scores')
      .select('sample_id, scores')
      .eq('session_id', sessionId)
      .eq('cupper_id', user.id)
      .in('sample_id', ctx.sampleIds)
    const assessmentBySample = new Map<string, CvaAssessment>()
    for (const r of (scoreRows ?? []) as any[]) {
      if (r.scores) assessmentBySample.set(r.sample_id, r.scores as CvaAssessment)
    }

    // Preserve session order; fall back to the raw id if the sample row is missing.
    const byId = new Map<string, any>((sampleRows ?? []).map((s: any) => [s.id, s]))
    const samples = ctx.sampleIds.map((id) => {
      const s = byId.get(id)
      const pm = s?.quality_spec_id ? passMarks.get(s.quality_spec_id) : undefined
      return {
        id,
        tracking_number: s?.tracking_number ?? id,
        status: s?.status ?? null,
        min_score: pm?.min_score ?? null,
        requires_descriptors: pm?.requires_descriptors ?? false,
      }
    })
    const assessments: Record<string, CvaAssessment> = {}
    for (const id of ctx.sampleIds) {
      assessments[id] = assessmentBySample.get(id) ?? createEmptyAssessment()
    }

    return NextResponse.json({ samples, assessments }, { headers: { 'Cache-Control': 'no-store' } })
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

    const { id: sessionId } = await params
    const ctx = await loadSession(sessionId)
    if (!ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

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

    const { data: existing } = await admin
      .from('cupping_scores')
      .select('id')
      .eq('session_id', sessionId)
      .eq('sample_id', sampleId)
      .eq('cupper_id', user.id)
      .maybeSingle()

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

    if (existing) {
      const { error } = await admin.from('cupping_scores').update(rowData as any).eq('id', (existing as any).id)
      if (error) throw error
    } else {
      const { error } = await admin.from('cupping_scores').insert(rowData as any)
      if (error) throw error
    }

    return NextResponse.json({ ok: true, cva_score: live.score, complete: live.complete })
  } catch (error) {
    console.error('PUT /api/cupping/cva/[id]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
