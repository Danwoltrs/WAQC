// src/app/api/clients/[id]/portal-access/invitations/[invitationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/portal/route-errors'
import { requirePortalStaff } from '@/lib/portal/staff-gate'
import { findCompanyInvitation } from '@/lib/portal/portal-invitations'
import { cancelAndLogInvitation, loadCompanyName, resendInvitation } from '@/lib/portal/invite-service'
import { isUuid } from '@/lib/portal/qc-portal-gate'

/** POST: resend (new link, 7 more days). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; invitationId: string }> }) {
  try {
    const gate = await requirePortalStaff()
    if (!gate.ok) return gate.response
    const { id, invitationId } = await params
    if (!isUuid(id) || !isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const { admin } = gate.ctx
    const invitation = await findCompanyInvitation(admin, { invitationId, companyId: id })
    if (!invitation || invitation.status !== 'pending') return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    const result = await resendInvitation(admin, {
      invitation, companyName: (await loadCompanyName(admin, id)) ?? '', inviterName: gate.ctx.name, actorUserId: gate.ctx.userId,
    })
    if (!result) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    return NextResponse.json({ ok: true, emailSent: result.emailSent })
  } catch (error) {
    return serverError(error)
  }
}

/** DELETE: cancel. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; invitationId: string }> }) {
  try {
    const gate = await requirePortalStaff()
    if (!gate.ok) return gate.response
    const { id, invitationId } = await params
    if (!isUuid(id) || !isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const cancelled = await cancelAndLogInvitation(gate.ctx.admin, {
      invitationId, companyId: id, actorUserId: gate.ctx.userId, actorName: gate.ctx.name,
    })
    if (!cancelled) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
