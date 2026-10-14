// src/lib/portal/team-action-labels.ts
/** QC team actions and the one label map for them. Pure: client components import it too. */

export type QcTeamAction = 'team_invite' | 'team_invite_revoked' | 'team_invite_accepted' | 'team_update' | 'team_remove'

export const TEAM_ACTION_VERBS: Record<QcTeamAction, string> = {
  team_invite: 'invited',
  team_invite_revoked: 'cancelled the invitation of',
  team_invite_accepted: 'accepted the invitation as',
  team_update: 'changed the access of',
  team_remove: 'removed the access of',
}
