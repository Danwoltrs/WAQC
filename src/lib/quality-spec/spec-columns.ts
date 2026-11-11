/**
 * The quality_templates columns a client spec version carries in
 * `client_quality_versions.spec.template`. The SQL snapshot function
 * `client_quality_spec_snapshot` (migration 20261111000001) must capture every
 * one of them; spec-columns.test.ts guards that the two lists stay in step.
 */
export const SPEC_TEMPLATE_COLUMNS = [
  'parameters',
  'methodology',
  'cva_min_score',
  'requires_descriptors',
  'cva_score_spread_max',
  'cupping_scale_min',
  'cupping_scale_max',
  'cupping_discrepancy_threshold',
  'defect_thresholds_primary',
  'defect_thresholds_secondary',
  'max_taints_allowed',
  'max_faults_allowed',
  'screen_size_requirements',
] as const

export type SpecTemplateColumn = (typeof SPEC_TEMPLATE_COLUMNS)[number]
