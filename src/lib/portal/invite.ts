// src/lib/portal/invite.ts
export interface ClientInviteInput {
  email: string
  firstName: string
  lastName: string
  companyId: string
  invitedBy: string | null
  token: string
  expiresAtIso: string
}

export function buildClientInvitePayload(i: ClientInviteInput) {
  return {
    email: i.email,
    first_name: i.firstName,
    last_name: i.lastName,
    qc_role: 'client',
    company_id: i.companyId,
    laboratory_id: null,
    is_cupper: false,
    is_q_grader: false,
    qc_enabled: true,
    invitation_token: i.token,
    expires_at: i.expiresAtIso,
    status: 'pending',
    invited_by: i.invitedBy,
  }
}
