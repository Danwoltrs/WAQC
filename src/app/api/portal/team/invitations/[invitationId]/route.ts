// src/app/api/portal/team/invitations/[invitationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/portal/route-errors'
import { isUuid, requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { findCompanyInvitation } from '@/lib/portal/portal-invitations'
import { cancelAndLogInvitation, loadCompanyName, resendInvitation } from '@/lib/portal/invite-service'
import { QC_MANAGE_USERS } from '@/lib/portal/qc-keys'
import { selfName } from '@/lib/portal/team-names'

/** A company admin may resend or cancel any pending invitation of this company except a staff-issued admin one. */
async function loadManageable(admin: any, invitationId: string, companyId: string) {
  const invitation = await findCompanyInvitation(admin, { invitationId, companyId })
  if (!invitation || invitation.status !== 'pending') return { error: NextResponse.json({ error: 'Invitation not found' }, { status: 404 }) }
  if (invitation.is_company_admin) return { error: NextResponse.json({ error: 'Only Wolthers can change this invitation' }, { status: 403 }) }
  return { invitation }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    return await postHandler(request, { params })
  } catch (error) {
    return serverError(error)
  }
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { invitationId } = await params
  if (!isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx
  const loaded = await loadManageable(admin, invitationId, companyId)
  if ('error' in loaded) return loaded.error
  const result = await resendInvitation(admin, {
    invitation: loaded.invitation, companyName: (await loadCompanyName(admin, companyId)) ?? '',
    inviterName: await selfName(admin, userId), actorUserId: userId,
  })
  if (!result) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true, emailSent: result.emailSent })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    return await deleteHandler(request, { params })
  } catch (error) {
    return serverError(error)
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { invitationId } = await params
  if (!isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx
  const loaded = await loadManageable(admin, invitationId, companyId)
  if ('error' in loaded) return loaded.error
  const cancelled = await cancelAndLogInvitation(admin, {
    invitationId, companyId, actorUserId: userId, actorName: await selfName(admin, userId),
  })
  if (!cancelled) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
