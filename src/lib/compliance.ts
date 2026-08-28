import { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateCompliance,
  criteriaToViolations,
  type ComplianceCriterion,
  type ComplianceInputs,
  type QualityTemplateParameters,
  type TemplateThresholds,
  type GreenBeanData,
} from '@/lib/compliance-criteria'
import type { CuppingScoreRow } from '@/lib/quality-resolvers'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { resolveLabSourceId } from '@/lib/sample-group'

export interface QualityComplianceResult {
  approved: boolean
  violations: string[]
}

/**
 * Evaluate quality compliance against quality specifications.
 *
 * Fetches what the rules need, then hands off to evaluateCompliance. The rules
 * themselves live in compliance-criteria.ts so the public certificate page can
 * apply exactly the same ones — a page that says "passes" over a certificate
 * this gate rejected is the worst bug available here.
 */
export async function evaluateQualityCompliance(
  supabase: SupabaseClient,
  sampleId: string,
  qualitySpecId: string | null,
  assignedCupperIds?: string[]
): Promise<QualityComplianceResult> {
  const criteria = await evaluateSampleCompliance(supabase, sampleId, qualitySpecId, assignedCupperIds)
  const violations = criteriaToViolations(criteria)
  return { approved: violations.length === 0, violations }
}

/**
 * The same evaluation, returning every criterion rather than only the failures.
 * The public certificate page renders the full list.
 */
export async function evaluateSampleCompliance(
  supabase: SupabaseClient,
  sampleId: string,
  qualitySpecId: string | null,
  assignedCupperIds?: string[]
): Promise<ComplianceCriterion[]> {
  // No quality spec means no thresholds to check.
  if (!qualitySpecId) {
    console.log('No quality spec assigned, auto-approving')
    return []
  }

  const { data: qualitySpec, error: specError } = await supabase
    .from('client_qualities')
    .select(`
      id,
      custom_name,
      template:quality_templates(
        id,
        name,
        parameters,
        defect_thresholds_primary,
        defect_thresholds_secondary,
        max_taints_allowed,
        max_faults_allowed,
        screen_size_requirements
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (specError || !qualitySpec?.template) {
    console.log('Quality spec or template not found, auto-approving')
    return []
  }

  const template = qualitySpec.template as any
  const parameters = (template.parameters as QualityTemplateParameters) || {}

  // A contract sibling has no scores, assessment or session of its own: the
  // lot was cupped once, on the lab unit it points at. Evaluate that row —
  // otherwise a sibling's certificate would be judged against nothing and pass.
  sampleId = await resolveLabSourceId(supabase, sampleId)

  // Commodity rows only — a CVA blob would be read as attribute scores.
  let scoreQuery = excludeCvaScores(supabase
    .from('cupping_scores')
    .select('scores, defects, cupper_id, session_id')
    .eq('sample_id', sampleId))

  if (assignedCupperIds && assignedCupperIds.length > 0) {
    scoreQuery = scoreQuery.in('cupper_id', assignedCupperIds)
  }

  const { data: cuppingScores } = await scoreQuery

  const { data: qualityAssessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // The master cupper's record overrides the others wherever it exists.
  let masterCupperId: string | null = null
  if (cuppingScores && cuppingScores.length > 0) {
    const { data: sampleSession } = await excludeCvaSessions(supabase
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sampleId])
      .in('status', ['setup', 'active', 'review', 'completed']))
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    masterCupperId = sampleSession?.master_cupper_id || null
  }

  const inputs: ComplianceInputs = {
    parameters,
    template: {
      defect_thresholds_primary: template.defect_thresholds_primary ?? null,
      defect_thresholds_secondary: template.defect_thresholds_secondary ?? null,
      max_taints_allowed: template.max_taints_allowed ?? null,
      max_faults_allowed: template.max_faults_allowed ?? null,
      screen_size_requirements: template.screen_size_requirements ?? null,
    } satisfies TemplateThresholds,
    cuppingScores: (cuppingScores || []) as unknown as CuppingScoreRow[],
    masterCupperId,
    greenBean: (qualityAssessment?.green_bean_data as GreenBeanData) ?? null,
  }

  return evaluateCompliance(inputs)
}

/**
 * Check if a quality spec has validation rules (a template with parameters).
 * Used to determine if manual decision should be allowed.
 */
export async function checkHasValidationRules(
  supabase: SupabaseClient,
  qualitySpecId: string | null
): Promise<boolean> {
  if (!qualitySpecId) {
    return false
  }

  const { data: qualitySpec, error } = await supabase
    .from('client_qualities')
    .select(`
      id,
      template:quality_templates(
        id,
        parameters
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (error || !qualitySpec?.template) {
    return false
  }

  const template = qualitySpec.template as any
  const parameters = template.parameters

  if (!parameters || typeof parameters !== 'object') {
    return false
  }

  return Boolean(
    parameters.cupping_attributes ||
    parameters.defect_limits ||
    parameters.screen_sizes ||
    parameters.screen_size_requirements?.constraints?.length ||
    parameters.taint_fault_configuration?.rules ||
    parameters.moisture_min !== undefined ||
    parameters.moisture_max !== undefined ||
    parameters.max_quakers !== undefined
  )
}
