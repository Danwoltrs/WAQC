// src/app/api/portal/team/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/portal/route-errors'
import { isUuid, requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { readQcAccess, removeQcAccess, setQcAccess } from '@/lib/portal/qc-grants'
import { QC_MANAGE_USERS, clampQcKeys, normalizeQcKeys, qcKeysOf } from '@/lib/portal/qc-keys'
import { teamTargetError } from '@/lib/portal/team-rules'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'
import { loadCompanyName } from '@/lib/portal/invite-service'
import { selfName, targetEmail } from '@/lib/portal/team-names'

/** PATCH: change a member's QC keys within this admin's own keys. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    return await patchHandler(request, { params })
  } catch (error) {
    return serverError(error)
  }
}

async function patchHandler(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { userId: targetId } = await params
  if (!isUuid(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, keys: ceiling, userId } = gate.ctx
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const target = await readQcAccess(admin, targetId, companyId)
  const refusal = teamTargetError({ selfId: userId, targetId, target })
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status })

  const keys = clampQcKeys(normalizeQcKeys(body), ceiling)
  if (keys.views.length === 0) {
    return NextResponse.json({ error: 'Choose at least one page, or remove the access instead' }, { status: 400 })
  }
  const result = await setQcAccess(admin, { userId: targetId, companyId, keys, createdBy: userId })
  await recordQcTeamActivity(admin, {
    actorUserId: userId, actorName: await selfName(admin, userId), companyId,
    companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_update',
    targetEmail: await targetEmail(admin, targetId), targetUserId: targetId,
    keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
  })
  return NextResponse.json({ ok: true, keys })
}

/** DELETE: remove a member's QC access, their qc_portal_access row (their login and any sys access stay). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    return await deleteHandler(request, { params })
  } catch (error) {
    return serverError(error)
  }
}

async function deleteHandler(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { userId: targetId } = await params
  if (!isUuid(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx

  const target = await readQcAccess(admin, targetId, companyId)
  const refusal = teamTargetError({ selfId: userId, targetId, target })
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status })

  const result = await removeQcAccess(admin, { userId: targetId, companyId })
  await recordQcTeamActivity(admin, {
    actorUserId: userId, actorName: await selfName(admin, userId), companyId,
    companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_remove',
    targetEmail: await targetEmail(admin, targetId), targetUserId: targetId,
    keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: null,
  })
  return NextResponse.json({ ok: true })
}
