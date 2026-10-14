import type { SupabaseClient } from '@supabase/supabase-js'
import { decideNewProfile, EXTERNAL_QC_ROLES, type StaffInvitationRow } from './new-profile'

const PROFILE_COLUMNS = 'id, email, full_name, qc_role, qc_enabled, is_global_admin, laboratory_id'
const INVITATION_COLUMNS = 'id, email, first_name, last_name, qc_role, laboratory_id, is_cupper, is_q_grader, qc_enabled'
const EXTERNAL_LIST = `(${EXTERNAL_QC_ROLES.join(',')})`

/**
 * Make sure a signed-in user has the WAQC profile the rule in
 * decideNewProfile gives them — and nothing when it gives none. Service-role
 * client only. Used by /auth/callback and /api/profiles/ensure. The invited
 * email must equal the sign-in email, and the sign-in email must be confirmed.
 * A failed user_profiles read throws (fail closed).
 */
export async function ensureWaqcProfile(
  admin: SupabaseClient<any>,
  user: { id: string; email?: string | null; email_confirmed_at?: string | null; user_metadata?: Record<string, any> | null },
): Promise<{ profile: Record<string, any> | null; created: boolean }> {
  const { data: existing } = await admin.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
  if (existing) return { profile: existing, created: false }

  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { profile: null, created: false }

  if (!user.email_confirmed_at) return { profile: null, created: false }

  const { data: userProfile, error: upError } = await admin
    .from('user_profiles').select('user_type, status').eq('id', user.id).maybeSingle()
  if (upError) throw upError
  const userType: string | null = userProfile?.user_type ?? null
  // An external row (the sign-up placeholder is 'pending') blocks the
  // @wolthers.com branch; any other status blocks everything. Pending rows
  // may still be claimed through an exact staff invitation (decideNewProfile).
  if (userType === 'external' && userProfile?.status !== 'pending') return { profile: null, created: false }

  let invitation: StaffInvitationRow | null = null
  if (!email.includes('*')) {
    const { data } = await admin
      .from('user_invitations')
      .select(INVITATION_COLUMNS)
      .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .not('qc_role', 'in', EXTERNAL_LIST)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = data as (StaffInvitationRow & { email: string | null }) | null
    if (row && row.email?.trim().toLowerCase() === email) invitation = row
  }

  const { data: santos } = await admin.from('laboratories').select('id').eq('code', 'SANTOS_HQ').maybeSingle()
  const meta = user.user_metadata ?? {}
  const fields = decideNewProfile({
    email,
    userType,
    userStatus: userProfile?.status ?? null,
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
