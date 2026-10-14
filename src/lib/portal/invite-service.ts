// src/lib/portal/invite-service.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { isExternalQcRole } from '@/lib/auth/new-profile'
import { readQcAccess, setQcAccess, type QcAccess } from './qc-grants'
import {
  InvitationConflictError, cancelInvitation, createPortalInvitation, escapeLike, isValidEmail, normalizeEmail, reissueInvitation,
  type PortalInvitationRow,
} from './portal-invitations'
import {
  buildPortalInviteEmail, portalInviteLink, portalSignInLink, sendPortalHouseCopy, sendPortalInviteEmail,
} from './invite-email'
import { recordQcTeamActivity } from './team-activity'
import { normalizeQcKeys, qcKeysOf, type QcKeySet } from './qc-keys'
import { accountStatusRefusal } from './account-status'
import { teamGuard } from './team-rules'

/**
 * One invite path for staff (/clients/[id]) and company admins (/portal/team),
 * spec §6.1–6.2:
 *   * a Wolthers or partner account, or any @wolthers.com address: refused
 *   * an existing external account: by status (account-status.ts) — active
 *     gets its qc_portal_access row for this company + an access email (its
 *     user_profiles row and any sys grant stay as they are); disabled /
 *     invited: 409
 *   * a company admin's invite of an existing account first passes the team
 *     guard, and someone already on the team is edited in the team list
 *   * anyone else: a portal_invitations row + an invitation email
 * Every email goes to the person alone; head office gets a link-free copy.
 * A lookup error invites nobody (fail closed). QC access is only ever the
 * qc_portal_access row (ruling R11); sys's company grants are never read.
 */

export type InviteOutcome =
  | { outcome: 'invited'; invitationId: string; emailSent: boolean }
  | { outcome: 'access_added'; userId: string; emailSent: boolean }
  | { outcome: 'refused'; status: 400 | 403 | 409 | 500; error: string }

function refused(status: 400 | 403 | 409 | 500, error: string): InviteOutcome {
  return { outcome: 'refused', status, error }
}

const LOOKUP_FAILED = 'This email could not be checked. Please try again.'

export async function loadCompanyName(admin: SupabaseClient<any>, companyId: string): Promise<string | null> {
  const { data } = await admin.from('companies').select('id, name, fantasy_name').eq('id', companyId).maybeSingle()
  return data ? companyDisplayName(data) : null
}

async function trySend(to: string, mail: Parameters<typeof sendPortalInviteEmail>[1]): Promise<boolean> {
  try {
    await sendPortalInviteEmail(to, mail)
    return true
  } catch (error) {
    console.error('[portal] invitation email failed:', error)
    return false
  }
}

export async function inviteToCompany(
  admin: SupabaseClient<any>,
  args: {
    companyId: string
    email: string
    firstName: string
    lastName: string
    keys: QcKeySet
    isCompanyAdmin: boolean
    inviter: { userId: string; name: string; kind: 'staff' | 'manager' }
  },
): Promise<InviteOutcome> {
  const email = normalizeEmail(args.email)
  const keys = normalizeQcKeys(args.keys)
  if (!isValidEmail(email)) return refused(400, 'Enter a valid email address')
  if (email.endsWith('@wolthers.com')) return refused(400, 'Wolthers addresses cannot be invited as clients')
  if (!args.firstName.trim()) return refused(400, 'Enter a first name')
  if (keys.views.length === 0) return refused(400, 'Choose at least one page')
  const isCompanyAdmin = args.inviter.kind === 'staff' && args.isCompanyAdmin

  const companyName = await loadCompanyName(admin, args.companyId)
  if (!companyName) return refused(400, 'Company not found')

  let pattern: string
  try {
    pattern = escapeLike(email)
  } catch {
    return refused(400, 'Enter a valid email address')
  }
  let accountRead, staffRead
  try {
    ;[accountRead, staffRead] = await Promise.all([
      admin.from('user_profiles').select('id, email, user_type, status').ilike('email', pattern).maybeSingle(),
      admin.from('profiles').select('id, email, qc_role').ilike('email', pattern).maybeSingle(),
    ])
  } catch {
    return refused(500, LOOKUP_FAILED)
  }
  if (accountRead.error || staffRead.error) return refused(500, LOOKUP_FAILED)
  // ilike is a lookup, not proof: only an exactly equal normalized address counts as the same account.
  const sameEmail = (row: { email?: string | null } | null) => !!row && normalizeEmail(row.email ?? '') === email
  const account = (sameEmail(accountRead.data) ? accountRead.data : null) as
    { id: string; user_type: string | null; status: string | null } | null
  const staffProfile = (sameEmail(staffRead.data) ? staffRead.data : null) as { id: string; qc_role: string | null } | null
  const isStaffProfile = !!staffProfile?.qc_role && !isExternalQcRole(staffProfile.qc_role)
  if (isStaffProfile || (account && account.user_type !== 'external')) {
    return refused(409, 'This email belongs to a Wolthers or partner account and cannot be invited as a client')
  }
  const statusRefusal = accountStatusRefusal(account?.status)
  if (statusRefusal) return refused(409, statusRefusal)

  if (account && account.status === 'active') {
    if (args.inviter.kind === 'manager') {
      let existing: QcAccess | null
      try {
        existing = await readQcAccess(admin, account.id, args.companyId)
      } catch {
        return refused(500, LOOKUP_FAILED)
      }
      const guard = teamGuard({ selfId: args.inviter.userId, targetId: account.id, target: existing })
      if (guard) return refused(guard.status, guard.error)
      if (existing) {
        return refused(409, 'This person is already on the team. Edit their access in the team list.')
      }
    }

    // The account is active: its user_profiles row (and any sys grant) stays
    // exactly as it is. QC access is its qc_portal_access row.
    let result: Awaited<ReturnType<typeof setQcAccess>>
    try {
      result = await setQcAccess(admin, {
        userId: account.id,
        companyId: args.companyId,
        keys,
        manageUsers: isCompanyAdmin ? true : undefined,
        createdBy: args.inviter.userId,
      })
    } catch (error) {
      console.error('[portal] writing QC access failed:', error)
      return refused(500, 'Access could not be saved. Please try again.')
    }
    const mail = buildPortalInviteEmail({
      kind: 'access_added', firstName: args.firstName, companyName, inviterName: args.inviter.name,
      keys, isCompanyAdmin, link: portalSignInLink(args.companyId), expiresAt: null,
    })
    const emailSent = await trySend(email, mail)
    await sendPortalHouseCopy({ kind: 'access_added', inviterName: args.inviter.name, email, companyName, keys, isCompanyAdmin })
    await recordQcTeamActivity(admin, {
      actorUserId: args.inviter.userId, actorName: args.inviter.name, companyId: args.companyId, companyName,
      action: 'team_update', targetEmail: email, targetUserId: account.id,
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
    })
    return { outcome: 'access_added', userId: account.id, emailSent }
  }

  let created: Awaited<ReturnType<typeof createPortalInvitation>>
  try {
    created = await createPortalInvitation(admin, {
      companyId: args.companyId, email, firstName: args.firstName, lastName: args.lastName, keys,
      isCompanyAdmin, invitedBy: args.inviter.userId, invitedByKind: args.inviter.kind,
    })
  } catch (error) {
    if (error instanceof InvitationConflictError) {
      return refused(409, 'An invitation for this address was just created; refresh')
    }
    console.error('[portal] creating invitation failed:', error)
    return refused(500, 'The invitation could not be saved. Please try again.')
  }
  const { invitation, token } = created
  const mail = buildPortalInviteEmail({
    kind: 'invitation', firstName: args.firstName, companyName, inviterName: args.inviter.name,
    keys, isCompanyAdmin, link: portalInviteLink(token), expiresAt: invitation.expires_at,
  })
  const emailSent = await trySend(email, mail)
  await sendPortalHouseCopy({ kind: 'invitation', inviterName: args.inviter.name, email, companyName, keys, isCompanyAdmin })
  await recordQcTeamActivity(admin, {
    actorUserId: args.inviter.userId, actorName: args.inviter.name, companyId: args.companyId, companyName,
    action: 'team_invite', targetEmail: email, keysAfter: keys,
  })
  return { outcome: 'invited', invitationId: invitation.id, emailSent }
}

export function inviteOutcomeResponse(outcome: InviteOutcome): NextResponse {
  if (outcome.outcome === 'refused') return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json(outcome)
}

/** New token + 7 more days for a pending invitation, emailed again (and head office told, link-free). */
export async function resendInvitation(
  admin: SupabaseClient<any>,
  args: { invitation: PortalInvitationRow; companyName: string; inviterName: string; actorUserId: string },
): Promise<{ emailSent: boolean } | null> {
  const fresh = await reissueInvitation(admin, { invitationId: args.invitation.id, companyId: args.invitation.company_id })
  if (!fresh) return null
  const keys = normalizeQcKeys(fresh.invitation)
  const mail = buildPortalInviteEmail({
    kind: 'invitation', firstName: fresh.invitation.first_name, companyName: args.companyName, inviterName: args.inviterName,
    keys, isCompanyAdmin: fresh.invitation.is_company_admin, link: portalInviteLink(fresh.token), expiresAt: fresh.invitation.expires_at,
  })
  const emailSent = await trySend(fresh.invitation.email, mail)
  await sendPortalHouseCopy({
    kind: 'resend', inviterName: args.inviterName, email: fresh.invitation.email, companyName: args.companyName,
    keys, isCompanyAdmin: fresh.invitation.is_company_admin,
  })
  await recordQcTeamActivity(admin, {
    actorUserId: args.actorUserId, actorName: args.inviterName, companyId: args.invitation.company_id, companyName: args.companyName,
    action: 'team_invite', targetEmail: fresh.invitation.email, keysAfter: keys,
  })
  return { emailSent }
}

/** Cancel a pending invitation of this company and log it (staff and team routes). Null when there was none. */
export async function cancelAndLogInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string; actorUserId: string; actorName: string },
): Promise<PortalInvitationRow | null> {
  const cancelled = await cancelInvitation(admin, { invitationId: args.invitationId, companyId: args.companyId })
  if (!cancelled) return null
  await recordQcTeamActivity(admin, {
    actorUserId: args.actorUserId, actorName: args.actorName, companyId: args.companyId,
    companyName: (await loadCompanyName(admin, args.companyId)) ?? '', action: 'team_invite_revoked',
    targetEmail: cancelled.email, keysBefore: normalizeQcKeys(cancelled), keysAfter: null,
  })
  return cancelled
}
