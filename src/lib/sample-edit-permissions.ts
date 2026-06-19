/**
 * Sample / certificate edit permissions — single source of truth.
 *
 * Two independent gates, both enforced server-side:
 *   1. Role gate — only master cuppers and global admins may edit a sample at
 *      any stage. Regular lab personnel can create but never edit.
 *   2. Content lock — informational for non-editors only. "Lock-sensitive"
 *      (quality) fields freeze 7 days after certificate generation for regular
 *      lab personnel, but EDITORS (master cuppers / global admins) bypass the
 *      lock and may edit every field at any time (product decision 2026-06-19).
 *      "Always-editable" (commercial / logistics) fields ignore the lock too.
 *
 * See docs/superpowers/specs/2026-06-02-master-cupper-edit-permissions-design.md
 */

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type LockReason =
  | 'not_locked'
  | 'within_7_days'
  | 'locked_after_scan'
  | 'locked_after_7_days'

export interface EditorProfile {
  is_master_cupper?: boolean | null
  is_global_admin?: boolean | null
  qc_role?: string | null
}

export interface LockableSample {
  locked?: boolean | null
  scanned_at?: string | null
  certificate_generated_at?: string | null
}

export interface ContentLockState {
  contentLocked: boolean
  reason: LockReason
  lockExpiresAt: string | null
  message: string
}

/**
 * Fields editable at any time by an editor — commercial / logistics data that
 * does not affect the quality assessment. No time lock.
 */
export const ALWAYS_EDITABLE_FIELDS: ReadonlySet<string> = new Set([
  // Counterparties
  'seller_id',
  'exporter_id',
  'importer_id',
  'roaster_id',
  'end_client_id',
  'client_id',
  'supplier',
  'supplier_type',
  'same_seller_shipper',
  'importer_is_qc_client',
  // Contract numbers
  'contract_number',
  'wolthers_contract_nr',
  'exporter_contract_nr',
  'buyer_contract_nr',
  'roaster_contract_nr',
  'seller_contract_nr',
  'shipper_contract_nr',
  'qc_client_contract_nr',
  'end_client_contract_nr',
  'supplier_contract_nr',
  // Logistics
  'container_nr',
  'ico_number',
  'shipment_month',
  'storage_position',
  // Physical bag quantities (commercial, per master cupper 2026-06-02)
  'bags',
  'bag_type',
  'bag_weight_kg',
  'bags_quantity_mt',
  'bag_count',
  'equivalent_60kg_bags',
  // Workflow / assignment
  'workflow_stage',
  'status',
  'assigned_to',
  'laboratory_id',
])

/**
 * Fields frozen after the 7-day window — quality content that defines the certificate.
 */
export const LOCK_SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'quality_spec_id',
  'quality_name',
  'origin',
  'micro_origin',
  'crop_year',
  'processing_method',
  'certifications',
  'sample_type',
])

/** Master cuppers and global admins are the only sample editors. */
export function isSampleEditor(profile: EditorProfile | null | undefined): boolean {
  if (!profile) return false
  return (
    profile.is_master_cupper === true ||
    profile.is_global_admin === true ||
    profile.qc_role === 'global_admin'
  )
}

/** Whether a field is frozen once the content lock applies. */
export function isLockSensitiveField(field: string): boolean {
  return LOCK_SENSITIVE_FIELDS.has(field)
}

/**
 * Whether lock-sensitive (quality) content may be written for this sample.
 *
 * Editors (master cuppers / global admins) bypass the content lock entirely —
 * they may correct quality data at any time (product decision 2026-06-19).
 * Non-editors may write only while the content is not locked (pre-certificate
 * or within the 7-day window), which preserves the normal cupping workflow for
 * lab personnel entering scores before a certificate exists.
 */
export function canEditLockedContent(
  profile: EditorProfile | null | undefined,
  sample: LockableSample
): boolean {
  if (isSampleEditor(profile)) return true
  return !computeContentLock(sample).contentLocked
}

/**
 * Compute the content-lock state for a sample using the established rules.
 * Mirrors the original logic in /api/cupping/check-edit-permission.
 */
export function computeContentLock(sample: LockableSample): ContentLockState {
  // Rule 1: locked after OCR scan
  if (sample.locked && sample.scanned_at) {
    return {
      contentLocked: true,
      reason: 'locked_after_scan',
      lockExpiresAt: null,
      message:
        'Sample is locked after OCR scan validation. Quality fields can no longer be edited.',
    }
  }

  // Rule 2: no certificate yet
  if (!sample.certificate_generated_at) {
    return {
      contentLocked: false,
      reason: 'not_locked',
      lockExpiresAt: null,
      message: 'No certificate has been generated yet. All fields can be edited.',
    }
  }

  // Rule 3 & 4: 7-day window from certificate generation
  const certificateTime = new Date(sample.certificate_generated_at)
  const lockExpiry = new Date(certificateTime.getTime() + SEVEN_DAYS_MS)
  const now = new Date()

  if (now < lockExpiry) {
    return {
      contentLocked: false,
      reason: 'within_7_days',
      lockExpiresAt: lockExpiry.toISOString(),
      message: `Quality fields can be edited within 7 days of certificate generation. Lock expires at ${lockExpiry.toLocaleString()}.`,
    }
  }

  return {
    contentLocked: true,
    reason: 'locked_after_7_days',
    lockExpiresAt: lockExpiry.toISOString(),
    message:
      '7 days have elapsed since certificate generation. Quality fields are locked; commercial and logistics fields remain editable.',
  }
}

export interface AuthorizeResult {
  ok: boolean
  status: number
  error?: string
}

/**
 * Authorize a sample edit given the editing user's profile, the sample's lock
 * state, and the list of fields being changed.
 *
 * - Non-editors are rejected (403).
 * - When content is locked, any lock-sensitive field in the change set is
 *   rejected (423). Always-editable fields still pass.
 */
export function authorizeSampleEdit(opts: {
  profile: EditorProfile | null | undefined
  sample: LockableSample
  changedFields: string[]
}): AuthorizeResult {
  const { profile } = opts

  if (!isSampleEditor(profile)) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: Only master cuppers and global admins can edit samples.',
    }
  }

  // Editors may edit every field at any time. The 7-day / post-scan content
  // lock no longer freezes quality fields for editors (product decision
  // 2026-06-19). The role gate above remains the only restriction.
  return { ok: true, status: 200 }
}

/**
 * Require that the user is an editor and (optionally) that quality content is
 * not locked — for content sub-routes (assessment, cupping scores, quality spec)
 * that write lock-sensitive data exclusively.
 */
export function authorizeContentEdit(opts: {
  profile: EditorProfile | null | undefined
  sample: LockableSample
}): AuthorizeResult {
  const { profile } = opts

  if (!isSampleEditor(profile)) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: Only master cuppers and global admins can edit samples.',
    }
  }

  // Editors bypass the content lock — quality data is editable at any time
  // (product decision 2026-06-19). Role gate above is the only restriction.
  return { ok: true, status: 200 }
}
