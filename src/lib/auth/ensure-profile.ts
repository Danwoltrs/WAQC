import type { SupabaseClient } from '@supabase/supabase-js'
import { decideNewProfile, EXTERNAL_QC_ROLES, type StaffInvitationRow } from './new-profile'

const PROFILE_COLUMNS = 'id, email, full_name, qc_role, qc_enabled, is_global_admin, laboratory_id'
const INVITATION_COLUMNS = 'id, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled'
const EXTERNAL_LIST = `(${EXTERNAL_QC_ROLES.join(',')})`

/**
 * Make sure a signed-in user has the WAQC profile the rule in
 * decideNewProfile gives them — and nothing when it gives none. Service-role
 * client only. Used by /auth/callback and /api/profiles/ensure.
 */
export async function ensureWaqcProfile(
  admin: SupabaseClient<any>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null },
  invitationToken?: string | null,
): Promise<{ profile: Record<string, any> | null; created: boolean }> {
  const { data: existing } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
  if (existing) return { profile: existing, created: false }

  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { profile: null, created: false }

  const { data: userProfile } = await admin.from('user_profiles').select('user_type').eq('id', user.id).maybeSingle()
  const userType: string | null = userProfile?.user_type ?? null
  if (userType === 'external') return { profile: null, created: false }

  let invitation: StaffInvitationRow | null = null
  if (invitationToken) {
    const { data } = await admin
      .from('user_invitations')
      .select(INVITATION_COLUMNS)
      .eq('invitation_token', invitationToken)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .not('qc_role', 'in', EXTERNAL_LIST)
      .maybeSingle()
    invitation = (data as StaffInvitationRow | null) ?? null
  }
  if (!invitation) {
    const { data } = await admin
      .from('user_invitations')
      .select(INVITATION_COLUMNS)
      .ilike('email', email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .not('qc_role', 'in', EXTERNAL_LIST)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    invitation = (data as StaffInvitationRow | null) ?? null
  }

  const { data: santos } = await admin.from('laboratories').select('id').eq('code', 'SANTOS_HQ').maybeSingle()
  const meta = user.user_metadata ?? {}
  const fields = decideNewProfile({
    email,
    userType,
    invitation,
    metadataName: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
    santosLabId: santos?.id ?? null,
  })
  if (!fields) return { profile: null, created: false }

  const { data: created, error } = await admin
    .from('profiles')
    .insert({ id: user.id, email, ...fields })
    .select(PROFILE_COLUMNS)
    .maybeSingle()
  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
      return { profile: raced ?? null, created: false }
    }
    throw error
  }

  if (invitation) {
    await admin
      .from('user_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
  }
  return { profile: created ?? null, created: true }
}
