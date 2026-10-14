/**
 * QC access keys (spec §5). They live in WAQC's own table qc_portal_access
 * (one row per person and company, qc_ keys only; ruling R11 of 2026-10-14),
 * never in sys's company grants: sys opens a company's data to anyone with a
 * grant row for it, so a QC-only grant row would leak sys data.
 *
 * QC's company admin is `qc_manage_users`, a QC key. sys's `manage_users` is
 * sys's own: WAQC never grants it, removes it or reads it as QC admin
 * (decision 5). Only Wolthers staff set qc_manage_users, through the explicit
 * company-admin flag; it never comes out of normalizeQcKeys or clampQcKeys.
 */

export const QC_VIEWS = [
  'qc_samples',
  'qc_certificates',
  'qc_dashboard',
  'qc_supplier_review',
  'qc_reports',
  'qc_specs',
  'qc_cupping',
] as const
export type QcView = (typeof QC_VIEWS)[number]

export const QC_CAPABILITIES = ['qc_spec_edit', 'qc_cupping_score'] as const
export type QcCapability = (typeof QC_CAPABILITIES)[number]

/** QC company admin: manages the company's QC team. Staff-granted only. */
export const QC_MANAGE_USERS = 'qc_manage_users'

export interface QcKeySet {
  views: QcView[]
  capabilities: QcCapability[]
}

export const QC_KEY_LABELS: Record<QcView | QcCapability, string> = {
  qc_samples: 'Samples and contracts',
  qc_certificates: 'Certificates',
  qc_dashboard: 'Dashboard',
  qc_supplier_review: 'Supplier review',
  qc_reports: 'Reports',
  qc_specs: 'Quality specs',
  qc_cupping: 'Cupping sessions',
  qc_spec_edit: 'Create and edit quality specs',
  qc_cupping_score: 'Score in cupping sessions',
}

export type QcPresetKey = 'full' | 'cupper' | 'viewer'

export const QC_PRESETS: { key: QcPresetKey; label: string; keys: QcKeySet }[] = [
  { key: 'full', label: 'Full', keys: { views: [...QC_VIEWS], capabilities: [...QC_CAPABILITIES] } },
  {
    key: 'cupper',
    label: 'Cupper',
    keys: { views: ['qc_samples', 'qc_certificates', 'qc_cupping'], capabilities: ['qc_cupping_score'] },
  },
  {
    key: 'viewer',
    label: 'Viewer',
    keys: { views: ['qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_reports'], capabilities: [] },
  },
]

export function isQcKey(key: string): boolean {
  return key.startsWith('qc_')
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Known grantable QC keys only, in registry order, without duplicates. Never the admin key. */
export function normalizeQcKeys(input: { views?: unknown; capabilities?: unknown }): QcKeySet {
  const views = new Set(strings(input.views))
  const capabilities = new Set(strings(input.capabilities))
  return {
    views: QC_VIEWS.filter((k) => views.has(k)),
    capabilities: QC_CAPABILITIES.filter((k) => capabilities.has(k)),
  }
}

/**
 * What a company admin may hand out: the requested QC keys that the admin
 * holds. Neither admin key is in QC_CAPABILITIES, so none can come out of here.
 */
export function clampQcKeys(
  requested: QcKeySet,
  ceiling: { views?: readonly string[] | null; capabilities?: readonly string[] | null },
): QcKeySet {
  const views = new Set(ceiling.views ?? [])
  const capabilities = new Set(ceiling.capabilities ?? [])
  const wanted = normalizeQcKeys(requested)
  return {
    views: wanted.views.filter((k) => views.has(k)),
    capabilities: wanted.capabilities.filter((k) => capabilities.has(k)),
  }
}

/** The grantable QC keys of a QC access row (the admin flag is read with isCompanyAdmin). */
export function qcKeysOf(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): QcKeySet {
  return normalizeQcKeys({ views: grant.views ?? [], capabilities: grant.capabilities ?? [] })
}

/** A QC access row opens the portal only with at least one QC view. */
export function hasQcView(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean {
  return qcKeysOf(grant).views.length > 0
}

/** QC company admin. sys's manage_users does not count. */
export function isCompanyAdmin(grant: { capabilities?: readonly string[] | null }): boolean {
  return (grant.capabilities ?? []).includes(QC_MANAGE_USERS)
}
