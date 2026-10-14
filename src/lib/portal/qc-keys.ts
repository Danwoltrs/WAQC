/**
 * QC keys on sys's external_user_company_grants rows (spec §5). QC owns every
 * key that starts with `qc_`; sys owns every other key and never adds or
 * removes a qc_ key (sys keepForeignKeys).
 *
 * QC's company admin is `qc_manage_users`, a QC key. sys's `manage_users` is
 * sys's own: WAQC never grants it, removes it or reads it as QC admin
 * (decision 5, revised 2026-10-14 after sys D3 let any sys portal admin grant
 * manage_users). Only Wolthers staff set qc_manage_users, through the explicit
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

/** The grantable QC keys a grant row holds (the admin flag is read with isCompanyAdmin). */
export function qcKeysOf(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): QcKeySet {
  return normalizeQcKeys({ views: grant.views ?? [], capabilities: grant.capabilities ?? [] })
}

/** A grant opens the QC portal only with at least one QC view. */
export function hasQcView(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean {
  return qcKeysOf(grant).views.length > 0
}

/** Any qc_ key on the row, the admin key included. */
export function holdsQcKey(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean {
  return (grant.views ?? []).some(isQcKey) || (grant.capabilities ?? []).some(isQcKey)
}

/**
 * The only kind of row that gives QC portal access: a direct grant (not a
 * source = 'group' copy, which sys's 0770 trigger makes of a sister
 * company's grant) holding a QC view. QC access is granted per company.
 */
export function isQcAccessRow(row: {
  source?: string | null
  views?: readonly string[] | null
  capabilities?: readonly string[] | null
}): boolean {
  return row.source !== 'group' && hasQcView(row)
}

/**
 * Replace the QC part of a key array; every other key stays, in its order.
 * qc_manage_users is a QC key like any other: a caller that wants to keep it
 * passes it in nextQc.
 */
export function mergeQcKeys(existing: readonly string[] | null | undefined, nextQc: readonly string[]): string[] {
  const kept = (existing ?? []).filter((k) => !isQcKey(k))
  const qc = nextQc.filter(isQcKey)
  return [...kept, ...qc.filter((k, i) => qc.indexOf(k) === i)]
}

/** QC company admin. sys's manage_users does not count. */
export function isCompanyAdmin(grant: { capabilities?: readonly string[] | null }): boolean {
  return (grant.capabilities ?? []).includes(QC_MANAGE_USERS)
}
