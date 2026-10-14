/**
 * Who may create (or resend) a staff invitation, and for which role and lab.
 *
 * `/api/users/invite` writes `user_invitations` with the service role, which
 * skips the table's insert policy, and `/api/*` is public in middleware. So
 * this check is the only thing between the internet and an invitation that
 * the sign-up trigger turns into a profile with that role. It mirrors the
 * database rules: `invitations_insert_policy` (global admin or lab quality
 * manager) and `can_update_profile` (a lab quality manager manages
 * lab_personnel and lab_finance_manager in their own lab).
 */

import { isExternalQcRole } from './new-profile'

const KNOWN_ROLES = new Set([
  'lab_personnel',
  'lab_finance_manager',
  'lab_quality_manager',
  'santos_hq_finance',
  'global_finance_admin',
  'global_quality_admin',
  'global_admin',
  'client',
  'supplier',
  'buyer',
])

const GLOBAL_ADMIN_ROLES = new Set(['global_admin', 'global_quality_admin'])

/** Roles a lab quality manager may hand out, always into their own lab. */
const LAB_MANAGER_INVITABLE_ROLES = new Set(['lab_personnel', 'lab_finance_manager'])

export interface InviterProfile {
  qc_role: string | null
  is_global_admin: boolean | null
  laboratory_id: string | null
}

export interface InviteTarget {
  qc_role: string
  laboratory_id: string | null
}

export type InvitePermission =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 403; error: string }

export function checkInvitePermission(
  inviter: InviterProfile | null,
  target: InviteTarget,
): InvitePermission {
  if (!inviter) return { ok: false, status: 401, error: 'Unauthorized' }

  if (!KNOWN_ROLES.has(target.qc_role)) {
    return { ok: false, status: 400, error: `Unknown role: ${target.qc_role}` }
  }

  if (inviter.is_global_admin === true || GLOBAL_ADMIN_ROLES.has(inviter.qc_role ?? '')) {
    if (isExternalQcRole(target.qc_role)) {
      return { ok: false, status: 400, error: 'Client logins are invited from the client page (Portal access)' }
    }
    return { ok: true }
  }

  if (inviter.qc_role === 'lab_quality_manager') {
    if (!LAB_MANAGER_INVITABLE_ROLES.has(target.qc_role)) {
      return { ok: false, status: 403, error: 'Lab admins can invite Lab Personnel and Lab Finance Managers only' }
    }
    if (!inviter.laboratory_id || target.laboratory_id !== inviter.laboratory_id) {
      return { ok: false, status: 403, error: 'Lab admins can invite into their own laboratory only' }
    }
    return { ok: true }
  }

  return { ok: false, status: 403, error: 'Only administrators can invite users' }
}
