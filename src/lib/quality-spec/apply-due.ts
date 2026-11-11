/**
 * The daily spec-version job (GET /api/cron/apply-spec-versions, 06:00 Sao
 * Paulo). It writes every due version to its quality's private template copy,
 * then retries the spec-change emails that have not gone out yet. Kept in
 * lib/ because a route file may export nothing but its handlers.
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cronAuthorized } from '@/lib/reports/lab-activity-routes'
import { portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { sendSpecChangeEmail } from '@/lib/portal/spec-change-email'
import { specToday } from './pick-version'

/** Unsent client emails are retried for versions created this many days back. */
export const EMAIL_RETRY_DAYS = 30

/** `today` (YYYY-MM-DD) minus EMAIL_RETRY_DAYS, as YYYY-MM-DD. */
function retrySince(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - EMAIL_RETRY_DAYS)).toISOString().slice(0, 10)
}

interface DueRow {
  id: string
  effective_from: string
  version_no: number
}

/**
 * Apply each version dated on or before `today` that is neither applied nor
 * cancelled, one apply_client_quality_version call each; a failure is logged
 * and the rest still run. Then email every client version not yet notified
 * and not cancelled, created in the last EMAIL_RETRY_DAYS days, including one
 * made today whose email failed (R29: only client versions are ever emailed).
 */
export async function applyDueVersions(
  admin: SupabaseClient<any>,
  today: string,
): Promise<{ applied: number; notified: number }> {
  const { data: due, error } = await admin
    .from('client_quality_versions')
    .select('id, effective_from, version_no')
    .lte('effective_from', today)
    .is('applied_at', null)
    .is('cancelled_at', null)
  if (error) throw new Error(error.message ?? 'Could not read due versions')

  const ordered = [...((due ?? []) as DueRow[])].sort(
    (a, b) => a.effective_from.localeCompare(b.effective_from) || a.version_no - b.version_no,
  )
  let applied = 0
  for (const v of ordered) {
    const { error: rpcError } = await admin.rpc('apply_client_quality_version', { p_version_id: v.id })
    if (rpcError) console.error('[apply-spec-versions] apply failed', v.id, rpcError.message)
    else applied++
  }

  // Retried for a month, not for ever: an email that has failed for 30 days
  // needs a person, not another daily attempt.
  const { data: unsent, error: uErr } = await admin
    .from('client_quality_versions')
    .select('id')
    .eq('source', 'client')
    .is('notified_at', null)
    .is('cancelled_at', null)
    .gte('created_at', retrySince(today))
  if (uErr) throw new Error(uErr.message ?? 'Could not read unsent versions')

  let notified = 0
  for (const v of (unsent ?? []) as Array<{ id: string }>) {
    if (await sendSpecChangeEmail(v.id, admin)) notified++
  }
  return { applied, notified }
}

/** The scheduled run. Vercel calls it with `Authorization: Bearer $CRON_SECRET`. */
export async function handleApplySpecVersionsCron(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    console.error('[apply-spec-versions] CRON_SECRET is not configured; refusing to run')
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = specToday()
  try {
    const result = await applyDueVersions(portalServiceClient(), today)
    return NextResponse.json({ today, ...result })
  } catch (error) {
    console.error('[apply-spec-versions] run failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'The spec-version run failed' }, { status: 500 })
  }
}
