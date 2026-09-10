import type { SupabaseClient } from '@supabase/supabase-js'
import { screenGramsToPercent } from '@/lib/quality-resolvers'
import { computeIssuedValues, type IssuedResult } from '@/lib/tolerance/issued-values'
import type { ScreenLimit } from '@/lib/tolerance/normalize-distribution'
import type { DefectLimits } from '@/lib/tolerance/normalize-defects'
import type { DefectConfig } from '@/types/defect-configuration'
import type { ComplianceInputs, GreenBeanData } from '@/lib/compliance-criteria'

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

/**
 * Reads the quality template and latest green-bean data for a lab-source
 * sample, derives the limits the approval gate would enforce (same
 * precedence, see `toScreenLimits` above and the comment below on defects),
 * and produces + proves the issued values.
 *
 * Shared by `POST /api/samples/[id]/approve-with-comments` and
 * `GET /api/samples/[id]/tolerance` so the two routes can never derive
 * different limits, or different issued values, for the same lot.
 */
export async function computeIssuedValuesForSample(
  db: SupabaseClient<any>,
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
