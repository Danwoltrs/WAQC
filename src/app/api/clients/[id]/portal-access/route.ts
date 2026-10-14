// src/app/api/clients/[id]/portal-access/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/portal/route-errors'
import { requirePortalStaff } from '@/lib/portal/staff-gate'
import { listQcMembers } from '@/lib/portal/qc-grants'
import { listPendingInvitations, toInvitationSummary } from '@/lib/portal/portal-invitations'
import { listQcTeamActivity } from '@/lib/portal/team-activity'
import { inviteOutcomeResponse, inviteToCompany } from '@/lib/portal/invite-service'
import { normalizeQcKeys } from '@/lib/portal/qc-keys'
import { isUuid } from '@/lib/portal/qc-portal-gate'

/** GET: who has QC portal access to this company (its qc_portal_access rows), pending invitations, recent activity. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePortalStaff()
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid company' }, { status: 400 })
    const { admin } = gate.ctx
    const [members, invitations, activity] = await Promise.all([
      listQcMembers(admin, id),
      listPendingInvitations(admin, id),
      listQcTeamActivity(admin, id),
    ])
    return NextResponse.json({ members, invitations: invitations.map(toInvitationSummary), activity })
  } catch (error) {
    return serverError(error)
  }
}

/** POST: invite a person (body: email, first_name, last_name, views, capabilities, is_company_admin). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePortalStaff()
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid company' }, { status: 400 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const outcome = await inviteToCompany(gate.ctx.admin, {
      companyId: id,
      email: String(body.email ?? ''),
      firstName: String(body.first_name ?? ''),
      lastName: String(body.last_name ?? ''),
      keys: normalizeQcKeys(body),
      isCompanyAdmin: body.is_company_admin === true,
      inviter: { userId: gate.ctx.userId, name: gate.ctx.name, kind: 'staff' },
    })
    return inviteOutcomeResponse(outcome)
  } catch (error) {
    return serverError(error)
  }
}
