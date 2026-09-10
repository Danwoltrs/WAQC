import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { evaluateSampleCompliance } from '@/lib/compliance'
import { evaluateTolerance } from '@/lib/tolerance/evaluate'
import { computeIssuedValues, type IssuedValues, type IssuedResult } from '@/lib/tolerance/issued-values'
import { groupSampleIds, resolveLabSourceId } from '@/lib/sample-group'
import type { ToleranceItem } from '@/lib/tolerance/types'
import { screenGramsToPercent } from '@/lib/quality-resolvers'
import type { ScreenLimit } from '@/lib/tolerance/normalize-distribution'
import type { DefectLimits } from '@/lib/tolerance/normalize-defects'
import type { DefectConfig } from '@/types/defect-configuration'
import type { ComplianceInputs, GreenBeanData } from '@/lib/compliance-criteria'

export interface DecisionRow {
  metrics: ToleranceItem[]
  issued_values: IssuedValues
  comments: string[]
  request_additional_sample: boolean
  decided_by: string
}

/** Pure: shape the audit row. Exported so it can be tested without a database. */
export function buildDecision(args: {
  items: ToleranceItem[]
  issued: IssuedValues
  comments: string[]
  requestAdditionalSample: boolean
  userId: string
}): DecisionRow {
  return {
    metrics: args.items,
    issued_values: args.issued,
    comments: args.comments.map((c) => c.trim()).filter(Boolean),
    request_additional_sample: args.requestAdditionalSample,
    decided_by: args.userId,
  }
}

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * Template constraints → the flat {screen_size, min, max} shape the adjuster takes.
 *
 * The gate evaluates the legacy shape and the constraint shape INDEPENDENTLY
 * (criteria 6 and 6b in compliance-criteria.ts) and requires both to pass. So
 * where a size appears in both, the adjuster must satisfy the STRICTER of the
 * two — the highest minimum and the lowest maximum. Letting one format
 * overwrite the other would aim the adjustment at a limit the gate does not
 * enforce, and the proof step would then refuse a decision the banner had
 * already offered.
 */
export function toScreenLimits(parameters: Record<string, any>, template: Record<string, any>): ScreenLimit[] {
  const out = new Map<string, ScreenLimit>()
  const tightenMin = (size: string, v: number) => {
    const cur = out.get(size) ?? { screen_size: size }
    out.set(size, { ...cur, min: cur.min === undefined ? v : Math.max(cur.min, v) })
  }
  const tightenMax = (size: string, v: number) => {
    const cur = out.get(size) ?? { screen_size: size }
    out.set(size, { ...cur, max: cur.max === undefined ? v : Math.min(cur.max, v) })
  }

  // Legacy shape: { "18": { min_percent, max_percent } }
  const legacy = template.screen_size_requirements as Record<string, any> | null
  if (legacy && typeof legacy === 'object') {
    for (const [size, req] of Object.entries(legacy)) {
      if (req?.min_percent !== undefined) tightenMin(size, req.min_percent)
      if (req?.max_percent !== undefined) tightenMax(size, req.max_percent)
    }
  }
  // Constraint shape: parameters.screen_size_requirements.constraints[]
  // 'exact' is deliberately skipped: evaluateTolerance never offers an exact
  // constraint, so there is nothing for the adjuster to aim at.
  for (const c of parameters?.screen_size_requirements?.constraints ?? []) {
    if (c.constraint_type === 'minimum' || c.constraint_type === 'range') {
      if (c.min_value !== undefined) tightenMin(c.screen_size, c.min_value)
    }
    if (c.constraint_type === 'maximum' || c.constraint_type === 'range') {
      if (c.max_value !== undefined) tightenMax(c.screen_size, c.max_value)
    }
  }
  return [...out.values()]
}

async function computeIssuedValuesForSample(
  db: ReturnType<typeof admin>,
  labSourceId: string,
  qualitySpecId: string | null,
): Promise<IssuedResult> {
  if (!qualitySpecId) return { ok: false, reason: 'This sample has no quality spec' }

  const { data: spec } = await db
    .from('client_qualities')
    .select(`id, template:quality_templates(
      parameters, defect_thresholds_primary, defect_thresholds_secondary,
      max_taints_allowed, max_faults_allowed, screen_size_requirements
    )`)
    .eq('id', qualitySpecId)
    .single()
  const template = (spec as any)?.template
  if (!template) return { ok: false, reason: 'Quality template not found' }
  const parameters = (template.parameters ?? {}) as Record<string, any>

  const { data: assessment } = await db
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', labSourceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const greenBean = ((assessment as any)?.green_bean_data ?? null) as GreenBeanData | null

  // Precedence MUST match the gate exactly (compliance-criteria.ts, criteria 3-5).
  // The gate reads the template column first for primary/secondary, but reads
  // `parameters.defect_thresholds_total` first for the total — an asymmetry that
  // looks like a typo and is not. Inverting either one would let the adjuster aim
  // at a limit the gate does not enforce, and the proof step would then refuse a
  // decision the banner had already offered.
  const thresholds = parameters?.defect_configuration?.thresholds ?? {}
  const defectLimits: DefectLimits = {
    max_primary: template.defect_thresholds_primary ?? thresholds.max_primary ?? undefined,
    max_secondary: template.defect_thresholds_secondary ?? thresholds.max_secondary ?? undefined,
    max_total: parameters.defect_thresholds_total ?? thresholds.max_total ?? undefined,
  }
  const defectConfigs = (parameters?.defect_configuration?.defects ?? []) as DefectConfig[]
  const defectCounts =
    ((greenBean?.defects as any)?.counts as Record<string, number> | undefined) ?? null

  const inputs: ComplianceInputs = {
    parameters,
    template: {
      defect_thresholds_primary: template.defect_thresholds_primary ?? null,
      defect_thresholds_secondary: template.defect_thresholds_secondary ?? null,
      max_taints_allowed: template.max_taints_allowed ?? null,
      max_faults_allowed: template.max_faults_allowed ?? null,
      screen_size_requirements: template.screen_size_requirements ?? null,
    },
    cuppingScores: [],
    masterCupperId: null,
    greenBean,
  }

  return computeIssuedValues({
    inputs,
    screenPercentages: screenGramsToPercent(greenBean?.screen_sizes),
    screenLimits: toScreenLimits(parameters, template),
    defectCounts,
    defectConfigs,
    defectLimits,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Service-role bypasses RLS, so getUser() alone would be an IDOR: a /portal
  // client shares the same Supabase auth.
  if (!(await isStaffSampleManager(supabase as any, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const comments: string[] = Array.isArray(body?.comments) ? body.comments : []
  const requestAdditionalSample = body?.request_additional_sample !== false

  const db = admin()
  const labSourceId = await resolveLabSourceId(db, id)

  const { data: sample } = await db
    .from('samples').select('id, quality_spec_id').eq('id', labSourceId).single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

  // Recompute server-side. Client-supplied issued values are never trusted.
  const criteria = await evaluateSampleCompliance(db as any, labSourceId, sample.quality_spec_id)
  const assessment = evaluateTolerance(criteria)
  if (!assessment.offered) {
    return NextResponse.json(
      { error: 'This sample is not within tolerance', blockedBy: assessment.blockedBy },
      { status: 409 },
    )
  }

  const issuedResult = await computeIssuedValuesForSample(db, labSourceId, sample.quality_spec_id)
  if (!issuedResult.ok) {
    return NextResponse.json({ error: issuedResult.reason }, { status: 409 })
  }

  const decision = buildDecision({
    items: assessment.items,
    issued: issuedResult.issued,
    comments,
    requestAdditionalSample,
    userId: user.id,
  })

  const { error: insertError } = await db
    .from('sample_tolerance_approvals')
    .insert({ sample_id: labSourceId, ...decision })
  if (insertError) {
    console.error('[approve-with-comments] insert', insertError)
    return NextResponse.json({ error: 'Could not record the decision' }, { status: 500 })
  }

  // The whole group is approved, exactly as an ordinary approval — which is what
  // lets the certificate trigger, the sys write-back and the billing feed run
  // untouched.
  const groupIds = await groupSampleIds(db, labSourceId)
  const { error: updateError } = await db
    .from('samples')
    .update({ status: 'approved', approved_with_comments: true })
    .in('id', groupIds)
  if (updateError) {
    console.error('[approve-with-comments] update', updateError)
    return NextResponse.json({ error: 'Could not approve the sample' }, { status: 500 })
  }

  return NextResponse.json({ data: { approved: groupIds.length, issued: issuedResult.issued } })
}

/**
 * GET /api/samples/[id]/tolerance
 *
 * The grading page cannot compute a tolerance assessment itself — it holds
 * only its own ad-hoc {errors, violatedScreens} shape, never
 * ComplianceCriterion[]. Deriving criteria client-side would duplicate the
 * approval gate, which is the one thing this design exists to avoid. So this
 * read-only companion reuses the same helpers the POST uses, and is advisory
 * only: the POST recomputes everything again, so this preview can never widen
 * what is approvable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase as any, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = admin()
  const labSourceId = await resolveLabSourceId(db, id)
  const { data: sample } = await db
    .from('samples').select('id, quality_spec_id').eq('id', labSourceId).single()
  if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

  const criteria = await evaluateSampleCompliance(db as any, labSourceId, sample.quality_spec_id)
  const assessment = evaluateTolerance(criteria)
  // Only compute the preview when the banner would actually be offered.
  const issued = assessment.offered
    ? await computeIssuedValuesForSample(db, labSourceId, sample.quality_spec_id)
    : null

  return NextResponse.json({
    data: {
      assessment,
      issued: issued?.ok ? issued.issued : null,
      // When the values cannot be issued the banner must not be offered at all.
      blocked: issued && !issued.ok ? issued.reason : null,
    },
  })
}
