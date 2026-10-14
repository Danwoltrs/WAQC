// src/lib/portal/accept-invitation.ts
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  claimInvitation, escapeLike, normalizeEmail, findInvitationByToken, invitationState, recordAcceptedUser, releaseInvitation,
} from './portal-invitations'
import { setQcAccess } from './qc-grants'
import { recordQcTeamActivity } from './team-activity'
import { loadCompanyName } from './invite-service'
import { accountStatusRefusal } from './account-status'
import { normalizeQcKeys } from './qc-keys'

/**
 * Accepting a QC portal invitation (spec §6.4). The login is created here,
 * server-side, so the shared Supabase sign-up setting never matters. The
 * invitation is claimed before anything is created; every refusal or failure
 * after the claim releases it, so the link works again.
 *
 * QC access is the person's qc_portal_access row (ruling R11); sys's company
 * grants are never read or written. user_profiles is written only when the
 * profile is not active yet: an active external profile belongs to sys.
 */

export const INVALID_INVITATION = 'This invitation is no longer valid. Ask the person who invited you to send a new one.'

export function microsoftSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN === 'true'
}

export interface InvitationDescription {
  email: string
  firstName: string
  companyName: string
  inviterName: string
  expiresAt: string
  microsoft: boolean
}

export async function describeInvitation(admin: SupabaseClient<any>, token: string): Promise<InvitationDescription | null> {
  const invitation = await findInvitationByToken(admin, token)
  if (!invitation || invitationState(invitation, new Date()) !== 'usable') return null
  const [companyName, { data: inviter }] = await Promise.all([
    loadCompanyName(admin, invitation.company_id),
    admin.from('user_profiles').select('full_name').eq('id', invitation.invited_by).maybeSingle(),
  ])
  return {
    email: invitation.email,
    firstName: invitation.first_name,
    companyName: companyName ?? '',
    inviterName: inviter?.full_name || 'Wolthers QC',
    expiresAt: invitation.expires_at,
    microsoft: microsoftSignInEnabled(),
  }
}

const gone = () => ({ status: 410, body: { error: INVALID_INVITATION } })

/** A password nobody knows: replaces a pre-registrant's password when the person chose Microsoft. */
function randomSecret(): string {
  return randomBytes(32).toString('base64url')
}

export async function acceptInvitation(
  admin: SupabaseClient<any>,
  input: { token: string; method: 'password' | 'microsoft'; password: string | null },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = new Date()
  const invitation = await findInvitationByToken(admin, input.token)
  if (!invitation || invitationState(invitation, now) !== 'usable') return gone()

  if (input.method === 'microsoft' && !microsoftSignInEnabled()) {
    return { status: 400, body: { error: 'Choose a password to continue' } }
  }
  const password = input.method === 'password' ? input.password ?? '' : null
  if (password !== null && (password.length < 8 || password.length > 72)) {
    return { status: 400, body: { error: 'Use a password of 8 to 72 characters' } }
  }

  if (!(await claimInvitation(admin, { invitationId: invitation.id, now }))) return gone()

  const refuse = async (error: string) => {
    await releaseInvitation(admin, invitation.id)
    return { status: 409, body: { error } }
  }

  try {
    const fullName = `${invitation.first_name} ${invitation.last_name}`.trim()
    const profileName = fullName || invitation.email
    const { data: found, error: accountError } = await admin
      .from('user_profiles')
      .select('id, email, user_type, status')
      .ilike('email', escapeLike(invitation.email))
      .maybeSingle()
    if (accountError) throw accountError
    // ilike is case-insensitive; only the exact address is this person's account.
    const account = found && normalizeEmail(String(found.email ?? '')) === normalizeEmail(invitation.email) ? found : null
    if (account && account.user_type !== 'external') {
      return await refuse('This email belongs to a Wolthers account. Please contact Wolthers.')
    }
    const statusRefusal = accountStatusRefusal(account?.status)
    if (statusRefusal) return await refuse(statusRefusal)

    let userId: string
    if (account) {
      userId = account.id
      const { data: login, error: loginError } = await admin.auth.admin.getUserById(userId)
      if (loginError || !login?.user) throw loginError ?? new Error('login not found')
      if (!login.user.email_confirmed_at) {
        // Nobody ever confirmed this address: whoever registered it first must
        // not keep a working password.
        const { error } = await admin.auth.admin.updateUserById(userId, { password: password ?? randomSecret(), email_confirm: true })
        if (error) throw error
      } else if (password !== null) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
        if (error) throw error
      }
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: invitation.email,
        email_confirm: true,
        ...(password !== null ? { password } : {}),
        user_metadata: { full_name: fullName },
      })
      if (error || !data?.user) throw error ?? new Error('createUser returned no user')
      userId = data.user.id
    }

    // An active external profile (someone who already uses the sys portal)
    // stays exactly as it is: its type, status and name belong to sys.
    // Otherwise the sign-up trigger wrote external / pending (or nothing):
    // make it external / active.
    if (account?.status !== 'active') {
      const { data: updated, error: updateError } = await admin
        .from('user_profiles')
        .update({ user_type: 'external', status: 'active', is_active: true, full_name: profileName })
        .eq('id', userId)
        .select('id')
      if (updateError) throw updateError
      if (!updated || updated.length === 0) {
        const { error } = await admin.from('user_profiles').insert({
          id: userId, email: invitation.email, full_name: profileName, user_type: 'external', status: 'active',
          is_active: true, permissions: [], department_ids: [],
        })
        if (error) throw error
      }
    }

    // QC access is the qc_portal_access row; sys's company grants are never touched.
    const keys = normalizeQcKeys(invitation)
    await setQcAccess(admin, {
      userId,
      companyId: invitation.company_id,
      keys,
      manageUsers: invitation.is_company_admin === true && invitation.invited_by_kind === 'staff',
      createdBy: invitation.invited_by,
    })
    await recordAcceptedUser(admin, { invitationId: invitation.id, userId })
    // The link is spent from here on: nothing below may fail the request.
    try {
      await recordQcTeamActivity(admin, {
        actorUserId: userId, actorName: profileName, companyId: invitation.company_id,
        companyName: (await loadCompanyName(admin, invitation.company_id)) ?? '',
        action: 'team_invite_accepted', targetEmail: invitation.email, targetUserId: userId, keysAfter: keys,
      })
    } catch (error) {
      console.error('[portal] accepted invitation, but the activity log failed:', error)
    }
    return { status: 200, body: { ok: true, email: invitation.email, method: input.method } }
  } catch (error) {
    console.error('[portal] accepting invitation failed:', error)
    await releaseInvitation(admin, invitation.id)
    return { status: 500, body: { error: 'Something went wrong. Please try the link again in a minute.' } }
  }
}
