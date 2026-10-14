// src/app/api/portal/team/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/portal/route-errors'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { listQcMembers } from '@/lib/portal/qc-grants'
import { listPendingInvitations, toInvitationSummary } from '@/lib/portal/portal-invitations'
import { inviteOutcomeResponse, inviteToCompany } from '@/lib/portal/invite-service'
import { QC_MANAGE_USERS, clampQcKeys, normalizeQcKeys } from '@/lib/portal/qc-keys'
import { selfName } from '@/lib/portal/team-names'

/** GET: the company's QC team (its qc_portal_access rows), pending invitations, and what this admin may grant. */
export async function GET(request: NextRequest) {
  try {
    return await getHandler(request)
  } catch (error) {
    return serverError(error)
  }
}

async function getHandler(request: NextRequest) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS })
  if (!gate.ok) return gate.response
  const { admin, companyId, keys, userId } = gate.ctx
  const [members, invitations] = await Promise.all([listQcMembers(admin, companyId), listPendingInvitations(admin, companyId)])
  return NextResponse.json({ members, invitations: invitations.map(toInvitationSummary), ceiling: keys, selfId: userId })
}

/** POST: invite a colleague or partner, capped at this admin's own keys; never a company admin. */
export async function POST(request: NextRequest) {
  try {
    return await postHandler(request)
  } catch (error) {
    return serverError(error)
  }
}

async function postHandler(request: NextRequest) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const { admin, companyId, keys, userId } = gate.ctx
  const outcome = await inviteToCompany(admin, {
    companyId,
    email: String(body.email ?? ''),
    firstName: String(body.first_name ?? ''),
    lastName: String(body.last_name ?? ''),
    keys: clampQcKeys(normalizeQcKeys(body), keys),
    isCompanyAdmin: false,
    inviter: { userId, name: await selfName(admin, userId), kind: 'manager' },
  })
  return inviteOutcomeResponse(outcome)
}
