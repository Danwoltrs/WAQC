/**
 * Who gets a WAQC profile when they first sign in (spec §4.1–4.2). The same
 * rule lives in the SQL trigger handle_new_user (migration 20261014000002):
 *   * external users (sys user_profiles.user_type = 'external' and status not
 *     'pending'): never. A 'pending' row is the sign-up trigger's default-deny
 *     placeholder, not an external account
 *   * a pending STAFF invitation: the profile it describes
 *   * an @wolthers.com email: lab_personnel at Santos (three admins by email)
 *   * anyone else: nothing — no access to WAQC
 * Client logins come from portal_invitations and never get a profile.
 */

export const EXTERNAL_QC_ROLES = ['client', 'supplier', 'buyer'] as const
export const ADMIN_EMAILS = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com']

export function isExternalQcRole(role: string | null | undefined): boolean {
  return !!role && (EXTERNAL_QC_ROLES as readonly string[]).includes(role)
}

export interface StaffInvitationRow {
  id: string
  first_name: string | null
  last_name: string | null
  qc_role: string
  laboratory_id: string | null
  is_cupper: boolean | null
  is_q_grader: boolean | null
  qc_enabled: boolean | null
}

export interface NewProfileFields {
  first_name: string
  last_name: string
  full_name: string
  qc_role: string
  qc_enabled: boolean
  is_cupper: boolean
  is_q_grader: boolean
  is_global_admin: boolean
  laboratory_id: string | null
}

export function decideNewProfile(args: {
  email: string
  userType: string | null
  /** sys user_profiles.status; 'pending' makes an external row a placeholder. */
  userStatus?: string | null
  invitation: StaffInvitationRow | null
  metadataName: string | null
  santosLabId: string | null
}): NewProfileFields | null {
  if (args.userType === 'external' && args.userStatus !== 'pending') return null
  const email = args.email.trim().toLowerCase()
  const localPart = email.split('@')[0] ?? ''

  const inv = args.invitation && !isExternalQcRole(args.invitation.qc_role) ? args.invitation : null
  if (inv) {
    const first = inv.first_name ?? ''
    const last = inv.last_name ?? ''
    return {
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim() || localPart,
      qc_role: inv.qc_role,
      qc_enabled: inv.qc_enabled ?? true,
      is_cupper: inv.is_cupper ?? false,
      is_q_grader: inv.is_q_grader ?? false,
      is_global_admin: inv.qc_role === 'global_admin' || inv.qc_role === 'global_quality_admin',
      laboratory_id: inv.laboratory_id ?? args.santosLabId,
    }
  }

  if (!email.endsWith('@wolthers.com')) return null
  const isAdmin = ADMIN_EMAILS.includes(email)
  const fullName = args.metadataName?.trim() || localPart
  const [first, ...rest] = fullName.split(' ')
  return {
    first_name: first ?? '',
    last_name: rest.join(' '),
    full_name: fullName,
    qc_role: isAdmin ? 'global_admin' : 'lab_personnel',
    qc_enabled: true,
    is_cupper: false,
    is_q_grader: false,
    is_global_admin: isAdmin,
    laboratory_id: args.santosLabId,
  }
}
