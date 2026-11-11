import type { SpecTemplateColumn } from './spec-columns'

export interface SpecSnapshot {
  template: { parameters: Record<string, any> } & Partial<Record<SpecTemplateColumn, any>>
  /** Null when the client quality's column is NULL (never coalesced, R19). */
  custom_parameters: Record<string, any> | null
  cups_per_sample: number | null
  discrepancy_threshold: number | null
}

export interface VersionRow {
  id: string
  client_quality_id: string
  version_no: number
  effective_from: string // YYYY-MM-DD
  spec: SpecSnapshot
  source: 'migration' | 'client' | 'wolthers'
  note: string | null
  created_by: string | null
  created_at: string
  applied_at: string | null
  notified_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_note: string | null
}

/** Same shape the readers join today as `client_qualities(..., template:quality_templates(...))`. */
export interface ResolvedSpec {
  id: string
  custom_name: string | null
  quality_code: string | null
  template_id: string | null
  cups_per_sample: number | null
  discrepancy_threshold: number | null
  /** Null when the client quality's column is NULL, live or in the snapshot (R19). */
  custom_parameters: Record<string, any> | null
  /** Null only on the live fallback for a quality without a template (as the live join returns it). */
  template: ({ id: string | null; name: string | null; name_en: string | null; description: string | null } & SpecSnapshot['template']) | null
  version: { id: string; versionNo: number; effectiveFrom: string; pinned: boolean } | null
}

/** cancel_note record_client_quality_version writes on a client version a Wolthers change cancelled. */
export const WOLTHERS_CANCEL_NOTE = 'Cancelled when Wolthers changed this specification'
