// src/lib/portal/team-endpoints.ts
import type { QcMember } from './qc-grants'
import type { InvitationSummary } from './portal-invitations'
import { QC_CAPABILITIES, QC_VIEWS, type QcKeySet } from './qc-keys'
import { withCompany } from './portal-fetch'

/**
 * Where the portal Team page sends its calls. A company admin uses the
 * portal's own team routes. Wolthers staff viewing the portal as the client
 * use the client page's portal-access routes instead, so their changes run
 * with staff authority (requirePortalStaff) and the portal data gate stays
 * read-only for staff.
 */
export interface TeamEndpoints {
  list: string
  invite: string
  member: (userId: string) => string
  invitation: (invitationId: string) => string
}

export function teamEndpoints(staffView: boolean, companyId: string): TeamEndpoints {
  if (staffView) {
    const base = `/api/clients/${encodeURIComponent(companyId)}/portal-access`
    return {
      list: base,
      invite: base,
      member: (userId) => `${base}/${encodeURIComponent(userId)}`,
      invitation: (id) => `${base}/invitations/${encodeURIComponent(id)}`,
    }
  }
  return {
    list: '/api/portal/team',
    invite: withCompany('/api/portal/team', companyId),
    member: (userId) => `/api/portal/team/${encodeURIComponent(userId)}`,
    invitation: (id) => `/api/portal/team/invitations/${encodeURIComponent(id)}`,
  }
}

export interface TeamData {
  members: QcMember[]
  invitations: InvitationSummary[]
  ceiling: QcKeySet
  selfId: string
}

/**
 * One shape for both answers. The staff routes carry no ceiling (staff may
 * grant every QC key) and no self (staff are not members of the company).
 */
export function normalizeTeamData(body: any): TeamData {
  return {
    members: Array.isArray(body?.members) ? body.members : [],
    invitations: Array.isArray(body?.invitations) ? body.invitations : [],
    ceiling: body?.ceiling ?? { views: [...QC_VIEWS], capabilities: [...QC_CAPABILITIES] },
    selfId: typeof body?.selfId === 'string' ? body.selfId : '',
  }
}
