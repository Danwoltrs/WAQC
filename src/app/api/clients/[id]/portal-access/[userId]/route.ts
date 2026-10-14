// src/app/api/clients/[id]/portal-access/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/portal/route-errors'
import { requirePortalStaff } from '@/lib/portal/staff-gate'
import { readQcAccess, removeQcAccess, setQcAccess } from '@/lib/portal/qc-grants'
import { normalizeQcKeys, qcKeysOf } from '@/lib/portal/qc-keys'
import { isUuid } from '@/lib/portal/qc-portal-gate'
import { loadCompanyName } from '@/lib/portal/invite-service'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'
import { targetEmail } from '@/lib/portal/team-names'

/**
 * PATCH: change a member's QC keys (body: views, capabilities,
 * is_company_admin? → qc_manage_users). Only for someone who already has a
 * qc_portal_access row here; new people come in through POST (invite).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const gate = await requirePortalStaff()
    if (!gate.ok) return gate.response
    const { id, userId } = await params
    if (!isUuid(id) || !isUuid(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    const keys = normalizeQcKeys(body)
    if (keys.views.length === 0) {
      return NextResponse.json({ error: 'Choose at least one page, or remove the access instead' }, { status: 400 })
    }
    const { admin } = gate.ctx
    if (!(await readQcAccess(admin, userId, id))) {
      return NextResponse.json({ error: 'This person has no QC portal access here' }, { status: 404 })
    }
    const companyName = (await loadCompanyName(admin, id)) ?? ''
    const result = await setQcAccess(admin, {
      userId, companyId: id, keys,
      manageUsers: typeof body.is_company_admin === 'boolean' ? body.is_company_admin : undefined,
      createdBy: gate.ctx.userId,
    })
    await recordQcTeamActivity(admin, {
      actorUserId: gate.ctx.userId, actorName: gate.ctx.name, companyId: id,
      companyName, action: 'team_update',
      targetEmail: await targetEmail(admin, userId), targetUserId: userId,
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}

/** DELETE: remove a person's QC access (their qc_portal_access row), company-admin status included. Their login and any sys access stay. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const gate = await requirePortalStaff()
    if (!gate.ok) return gate.response
    const { id, userId } = await params
    if (!isUuid(id) || !isUuid(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const { admin } = gate.ctx
    const companyName = (await loadCompanyName(admin, id)) ?? ''
    const result = await removeQcAccess(admin, { userId, companyId: id })
    if (!result.before) return NextResponse.json({ error: 'No access to remove' }, { status: 404 })
    await recordQcTeamActivity(admin, {
      actorUserId: gate.ctx.userId, actorName: gate.ctx.name, companyId: id,
      companyName, action: 'team_remove',
      targetEmail: await targetEmail(admin, userId), targetUserId: userId,
      keysBefore: qcKeysOf(result.before), keysAfter: null,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError(error)
  }
}
