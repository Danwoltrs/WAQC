// src/lib/portal/team-rules.ts
import { isCompanyAdmin } from './qc-keys'
import type { QcAccess } from './qc-grants'

/**
 * What a company admin may not do on /portal/team (spec §6.2): act on
 * themselves or on another QC company admin (staff do that). The target is
 * the person's qc_portal_access row on this company; sys's admin status
 * (manage_users) plays no part.
 */

export type TeamRefusal = { status: 403 | 404; error: string }

const NOT_A_MEMBER: TeamRefusal = { status: 404, error: 'This person has no QC portal access here' }

/** For any write that touches an existing row, invites included. No row is no refusal. */
export function teamGuard(
  args: { selfId: string; targetId: string; target: QcAccess | null },
): { status: 403; error: string } | null {
  if (args.selfId === args.targetId) return { status: 403, error: 'You cannot change your own access' }
  if (args.target && isCompanyAdmin(args.target)) return { status: 403, error: 'Only Wolthers can change a company admin' }
  return null
}

/** For PATCH and DELETE on a member: the guard, and the person must have a QC access row here. */
export function teamTargetError(args: { selfId: string; targetId: string; target: QcAccess | null }): TeamRefusal | null {
  const refusal = teamGuard(args)
  if (refusal) return refusal
  if (!args.target) return NOT_A_MEMBER
  return null
}
