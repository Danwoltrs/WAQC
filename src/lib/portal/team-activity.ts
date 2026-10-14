// src/lib/portal/team-activity.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import type { QcKeySet } from './qc-keys'
import { TEAM_ACTION_VERBS, type QcTeamAction } from './team-action-labels'

export type { QcTeamAction }

/**
 * Every QC team change is written to sys's portal_activity (payload.app =
 * 'qc') and announced to WAQC global admins in-app (spec §6.8). Logging must
 * never fail the action it records.
 *
 * portal_activity.user_id is NOT NULL and references user_profiles. WAQC
 * staff often have no user_profiles row, and WAQC never creates one for them
 * (an internal row would open sys). So the row is written under the actor
 * when they have a user_profiles row, else under the target member, else not
 * at all (the portal_invitations row is then the record). The actor's id and
 * name always travel in the payload.
 */

const TITLES: Record<QcTeamAction, string> = {
  team_invite: 'Portal invitation sent',
  team_invite_revoked: 'Portal invitation cancelled',
  team_invite_accepted: 'Portal invitation accepted',
  team_update: 'Portal access changed',
  team_remove: 'Portal access removed',
}

export interface QcTeamActivityInput {
  actorUserId: string
  actorName: string
  companyId: string
  companyName: string
  action: QcTeamAction
  targetEmail: string
  /** The member acted on, when the action is on an existing account (members always have a user_profiles row). */
  targetUserId?: string | null
  keysBefore?: QcKeySet | null
  keysAfter?: QcKeySet | null
}

export function describeTeamActivity(input: QcTeamActivityInput): string {
  const preposition = input.action === 'team_invite' ? 'to' : 'on'
  return `${input.actorName} ${TEAM_ACTION_VERBS[input.action]} ${input.targetEmail} ${preposition} the QC portal for ${input.companyName}`
}

export async function recordQcTeamActivity(admin: SupabaseClient<any>, input: QcTeamActivityInput): Promise<void> {
  try {
    const { data: actorProfile } = await admin.from('user_profiles').select('id').eq('id', input.actorUserId).maybeSingle()
    const logAs = actorProfile ? input.actorUserId : input.targetUserId ?? null
    if (logAs) {
      const { error } = await admin.from('portal_activity').insert({
        user_id: logAs,
        company_id: input.companyId,
        action: input.action,
        payload: {
          app: 'qc',
          actor_user_id: input.actorUserId,
          actor_name: input.actorName,
          target_email: input.targetEmail,
          keys_before: input.keysBefore ?? null,
          keys_after: input.keysAfter ?? null,
        },
      })
      if (error) console.error('[portal] activity log failed:', error)
    }

    const { data: admins } = await admin.from('profiles').select('id').eq('is_global_admin', true)
    await Promise.all(
      (admins ?? []).map((a: { id: string }) =>
        createNotification({
          type: 'info',
          priority: 'info',
          title: TITLES[input.action],
          message: describeTeamActivity(input),
          link: `/clients/${input.companyId}`,
          user_id: a.id,
          metadata: { source: 'portal_team', company_id: input.companyId, action: input.action },
        }),
      ),
    )
  } catch (error) {
    console.error('[portal] activity/notification failed:', error)
  }
}

export interface QcTeamActivityRow {
  id: string
  occurredAt: string
  action: QcTeamAction
  actorName: string | null
  targetEmail: string | null
}

export async function listQcTeamActivity(admin: SupabaseClient<any>, companyId: string, limit = 20): Promise<QcTeamActivityRow[]> {
  const { data, error } = await admin
    .from('portal_activity')
    .select('id, occurred_at, action, actor_name, payload')
    .eq('company_id', companyId)
    .eq('payload->>app', 'qc')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    action: row.action,
    // The row may be filed under the target member (see above): the payload names the real actor.
    actorName: row.payload?.actor_name ?? row.actor_name ?? null,
    targetEmail: row.payload?.target_email ?? null,
  }))
}
