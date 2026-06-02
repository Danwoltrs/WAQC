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

async function loadContext(sessionId: string) {
  const { data: session } = await admin
    .from('cupping_sessions')
    .select('id, sample_ids, session_type, status')
    .eq('id', sessionId)
    .single()
  if (!session) return null
  const sampleId = (session as any).sample_ids?.[0] as string | undefined
  if (!sampleId) return null
  const { data: sample } = await admin
    .from('samples')
    .select('id, tracking_number, status')
    .eq('id', sampleId)
    .single()
  return { session, sampleId, sample }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: sessionId } = await params
    const ctx = await loadContext(sessionId)
    if (!ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const { data: row } = await admin
      .from('cupping_scores')
      .select('scores')
      .eq('session_id', sessionId)
      .eq('sample_id', ctx.sampleId)
      .eq('cupper_id', user.id)
      .maybeSingle()

    const assessment = ((row as any)?.scores as CvaAssessment) ?? createEmptyAssessment()
    return NextResponse.json({ sample: ctx.sample, assessment }, { headers: { 'Cache-Control': 'no-store' } })
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
    const ctx = await loadContext(sessionId)
    if (!ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const incoming = (await request.json()) as CvaAssessment
    // Re-verify the score server-side — never trust the client's number.
    const live = computeAssessmentScore(incoming)
    const payload: CvaAssessment = {
      ...incoming,
      protocol: 'cva',
      score: live.score,
      u: live.u,
      d: live.d,
    }

    const { data: existing } = await admin
      .from('cupping_scores')
      .select('id')
      .eq('session_id', sessionId)
      .eq('sample_id', ctx.sampleId)
      .eq('cupper_id', user.id)
      .maybeSingle()

    const rowData = {
      session_id: sessionId,
      sample_id: ctx.sampleId,
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
