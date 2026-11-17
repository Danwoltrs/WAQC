// src/lib/portal/spec-change-request.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid, type QcPortalContext } from './qc-portal-gate'
import { fetchCompanyQualities } from './portal-qualities-fetch'
import { sendSpecChangeEmail } from './spec-change-email'
import { pendingVersion, specToday } from '@/lib/quality-spec/pick-version'
import { formatSpecDate, isCalendarDate } from '@/lib/quality-spec/spec-diff'
import type { VersionRow } from '@/lib/quality-spec/types'
import { serverError } from './route-errors'
import { readSensorySettings } from '@/lib/sensory'

/**
 * The portal's spec change (POST …/qualities/[id]/versions) and cancel
 * (DELETE …/versions/[versionId]). Kept in lib/ because a route file may
 * export nothing but its handlers. Both run behind
 * requireQcPortal({ view: 'qc_specs', capability: 'qc_spec_edit' }), which
 * already refuses the staff view-as on any non-GET method.
 */

export const STALE_BASE_MESSAGE = 'This specification was changed by someone else. Reload to see the latest version.'
export const ALREADY_STARTED_MESSAGE = 'This change has already started or was cancelled.'
const MAX_NOTE = 1000
export const PICK_PROFILE_MESSAGE = 'Pick a regional profile from the list'

export function pendingChangeMessage(effectiveFrom: string | null): string {
  return effectiveFrom
    ? `A change is already scheduled for ${formatSpecDate(effectiveFrom)}. Cancel it before making another.`
    : 'A change is already scheduled. Cancel it before making another.'
}

export type ParsedSpecChange =
  | { ok: true; baseVersionId: string; parameters: Record<string, unknown>; effectiveFrom: string; note: string | null }
  | { ok: false; error: string }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `{ baseVersionId, parameters, effectiveFrom: 'now' | 'YYYY-MM-DD', note? }`; 'now' is `today` (Sao Paulo). */
export function parseSpecChangeBody(body: unknown, today: string): ParsedSpecChange {
  if (!isPlainObject(body)) return { ok: false, error: 'Invalid request' }
  const { baseVersionId, parameters, effectiveFrom, note } = body
  if (typeof baseVersionId !== 'string' || !isUuid(baseVersionId)) return { ok: false, error: 'Invalid base version' }
  if (!isPlainObject(parameters)) return { ok: false, error: 'The specification is not valid.' }
  if (effectiveFrom !== 'now' && !isCalendarDate(effectiveFrom)) return { ok: false, error: 'Choose today or a valid date.' }
  if (note !== undefined && note !== null && typeof note !== 'string') return { ok: false, error: 'Invalid note' }
  const trimmed = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : ''
  return {
    ok: true,
    baseVersionId,
    parameters,
    effectiveFrom: effectiveFrom === 'now' ? today : (effectiveFrom as string),
    note: trimmed || null,
  }
}

/** The scheduled version's date, read fresh for the pending_change message. */
async function scheduledDate(admin: SupabaseClient<any>, qualityId: string, today: string): Promise<string | null> {
  const { data } = await admin
    .from('client_quality_versions')
    .select('id, version_no, effective_from, applied_at, cancelled_at')
    .eq('client_quality_id', qualityId)
    .is('applied_at', null)
    .is('cancelled_at', null)
  return pendingVersion((data ?? []) as VersionRow[], today)?.effective_from ?? null
}

/**
 * Apply this quality's due versions (dated today or before, neither applied
 * nor cancelled), oldest first, as the daily cron would. A failure is logged
 * and left to the insert, which then answers pending_change.
 */
async function applyDueVersionsOf(admin: SupabaseClient<any>, qualityId: string, today: string): Promise<void> {
  const { data, error } = await admin
    .from('client_quality_versions')
    .select('id, version_no, effective_from')
    .eq('client_quality_id', qualityId)
    .lte('effective_from', today)
    .is('applied_at', null)
    .is('cancelled_at', null)
  if (error) {
    console.error('[portal] could not read due spec versions', qualityId, error.message)
    return
  }
  const due = ((data ?? []) as Array<{ id: string; version_no: number; effective_from: string }>).sort(
    (a, b) => a.effective_from.localeCompare(b.effective_from) || a.version_no - b.version_no,
  )
  for (const v of due) {
    const { error: applyError } = await admin.rpc('apply_client_quality_version', { p_version_id: v.id })
    if (applyError) console.error('[portal] could not apply a due spec version', v.id, applyError.message)
  }
}

const json = (body: unknown, status: number) => NextResponse.json(body, { status })

/**
 * The regional profile a client submits must be one it could pick: an ACTIVE
 * row of regional_profiles (the portal list). The profile its base version
 * already carries stays allowed even if it was deactivated since. The stored
 * name is the row's, never the typed one. No table yet (42P01) means no
 * profile exists to pick. Other read errors throw (500).
 */
async function checkRegionalProfile(
  admin: SupabaseClient<any>,
  parameters: Record<string, unknown>,
  base: VersionRow | undefined,
): Promise<{ ok: true; parameters: Record<string, unknown> } | { ok: false }> {
  if (!Object.prototype.hasOwnProperty.call(parameters, 'regional_profile')) return { ok: true, parameters }
  const rp = parameters.regional_profile
  if (rp === null || rp === undefined) return { ok: true, parameters }
  if (!isPlainObject(rp) || typeof rp.id !== 'string' || !isUuid(rp.id)) return { ok: false }
  const id = rp.id

  const baseParams = (base?.spec as any)?.template?.parameters
  const baseIds = new Set(
    [
      isPlainObject(baseParams?.regional_profile) ? baseParams.regional_profile.id : null,
      readSensorySettings((base?.spec as any)?.custom_parameters, baseParams).profile?.id ?? null,
    ].filter((v): v is string => typeof v === 'string'),
  )
  const unchanged = baseIds.has(id)

  const { data, error } = await admin.from('regional_profiles').select('id, name, is_active').eq('id', id).maybeSingle()
  if (error) {
    if (error.code === '42P01') return unchanged ? { ok: true, parameters } : { ok: false }
    throw new Error(`regional_profiles: ${error.message ?? error.code ?? 'read failed'}`)
  }
  const row = data as { id: string; name: string; is_active: boolean } | null
  if (!row) return unchanged ? { ok: true, parameters } : { ok: false }
  if (!row.is_active && !unchanged) return { ok: false }
  return { ok: true, parameters: { ...parameters, regional_profile: { id: row.id, name: row.name } } }
}

/** POST: insert the client's version (applied at once when dated today), then email it. */
export async function createSpecChange(ctx: QcPortalContext, qualityId: string, request: Request): Promise<NextResponse> {
  if (ctx.isStaffViewAs) return json({ error: 'The staff view of the portal is read-only' }, 403)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  const today = specToday()
  const parsed = parseSpecChangeBody(body, today)
  if (!parsed.ok) return json({ error: parsed.error }, 400)

  try {
    const [quality] = await fetchCompanyQualities(ctx.admin, ctx.companyId, qualityId)
    if (!quality) return json({ error: 'Quality not found' }, 404)

    const base = quality.versions.find((v) => v.id === parsed.baseVersionId)
    const profileCheck = await checkRegionalProfile(ctx.admin, parsed.parameters, base)
    if (!profileCheck.ok) return json({ error: PICK_PROFILE_MESSAGE }, 400)

    // Between midnight and the 06:00 apply, a version dated today is due but
    // not applied yet, and would refuse this change as pending. Apply it now.
    await applyDueVersionsOf(ctx.admin, quality.id, today)

    const { data, error } = await ctx.admin.rpc('insert_client_quality_version', {
      p_client_quality_id: quality.id,
      p_base_version_id: parsed.baseVersionId,
      p_parameters: profileCheck.parameters,
      p_effective_from: parsed.effectiveFrom,
      p_user: ctx.userId,
      p_note: parsed.note,
    })
    if (error) {
      const code = String(error.message ?? '').trim()
      if (code === 'past_date') return json({ error: 'Choose today or a later date.' }, 400)
      if (code === 'invalid_parameters') return json({ error: 'The specification is not valid.' }, 400)
      if (code === 'not_found') return json({ error: 'Quality not found' }, 404)
      if (code === 'stale_base') return json({ error: STALE_BASE_MESSAGE }, 409)
      if (code === 'pending_change') {
        return json({ error: pendingChangeMessage(await scheduledDate(ctx.admin, quality.id, today)) }, 409)
      }
      return serverError(new Error(`insert_client_quality_version: ${code || 'unknown error'}`))
    }

    const versionId = String(data)
    const { data: created } = await ctx.admin
      .from('client_quality_versions')
      .select('id, version_no, effective_from')
      .eq('id', versionId)
      .maybeSingle()
    // The email never fails the request: the daily cron retries it.
    const notified = await sendSpecChangeEmail(versionId, ctx.admin)
    return json(
      {
        versionId,
        versionNo: (created as any)?.version_no ?? null,
        effectiveFrom: (created as any)?.effective_from ?? parsed.effectiveFrom,
        notified,
      },
      201,
    )
  } catch (error) {
    return serverError(error)
  }
}

/** DELETE: cancel a scheduled change of this quality whose date is still ahead, then email the cancellation. */
export async function cancelSpecChange(ctx: QcPortalContext, qualityId: string, versionId: string): Promise<NextResponse> {
  if (ctx.isStaffViewAs) return json({ error: 'The staff view of the portal is read-only' }, 403)
  if (!isUuid(versionId)) return json({ error: 'Change not found' }, 404)
  try {
    const [quality] = await fetchCompanyQualities(ctx.admin, ctx.companyId, qualityId)
    if (!quality) return json({ error: 'Quality not found' }, 404)
    if (!quality.versions.some((v) => v.id === versionId)) return json({ error: 'Change not found' }, 404)

    const { data: me } = await ctx.admin.from('user_profiles').select('full_name, email').eq('id', ctx.userId).maybeSingle()
    const name = (me as any)?.full_name?.trim() || (me as any)?.email?.trim() || 'a portal user'

    const { data: hit, error } = await ctx.admin
      .from('client_quality_versions')
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: ctx.userId, cancel_note: `Cancelled by ${name}` })
      .eq('id', versionId)
      .eq('client_quality_id', quality.id)
      .is('applied_at', null)
      .is('cancelled_at', null)
      .gt('effective_from', specToday())
      .select('id')
    if (error) throw new Error(error.message ?? 'Could not cancel the change')
    if (!hit || (hit as unknown[]).length === 0) return json({ error: ALREADY_STARTED_MESSAGE }, 409)

    const notified = await sendSpecChangeEmail(versionId, ctx.admin)
    if (!notified) console.error('[portal] cancellation email not sent', versionId)
    return json({ cancelled: true, notified }, 200)
  } catch (error) {
    return serverError(error)
  }
}
