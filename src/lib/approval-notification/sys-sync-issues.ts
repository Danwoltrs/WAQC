import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The QC→sys skip log (sys migration 0749, table qc_sys_sync_issues).
 *
 * Anything that used to be a console.warn in the sample mirror becomes a row
 * here: the mirror trigger writes stage 'mirror', the decision write-back
 * writes 'decision', the rejection-email hook writes 'email'. One OPEN row per
 * (sample, stage, reason) — a retry never piles up. Surfaced on QC as the
 * "Sys sync" pill and /admin/sys-sync; resolved by a person.
 */
export type SyncStage = 'mirror' | 'decision' | 'email'

export interface SyncIssueInput {
  sampleId: string | null
  contractId: string | null
  waqcRef: string | null
  stage: SyncStage
  reason: string
  detail?: Record<string, unknown> | null
}

export interface SyncIssueRow {
  id: string
  sample_id: string | null
  contract_id: string | null
  waqc_ref: string | null
  stage: SyncStage
  reason: string
  detail: Record<string, unknown> | null
  created_at: string
  resolved_at: string | null
}

const TABLE = 'qc_sys_sync_issues'

/** Best-effort, never throws: a logging failure must not break the caller. */
export async function insertSyncIssue(admin: SupabaseClient, issue: SyncIssueInput): Promise<void> {
  try {
    const { data: open } = await admin
      .from(TABLE)
      .select('id')
      .eq('sample_id', issue.sampleId)
      .eq('stage', issue.stage)
      .eq('reason', issue.reason)
      .is('resolved_at', null)
      .limit(1)
    if ((open ?? []).length > 0) return
    const { error } = await admin.from(TABLE).insert({
      sample_id: issue.sampleId,
      contract_id: issue.contractId,
      waqc_ref: issue.waqcRef,
      stage: issue.stage,
      reason: issue.reason,
      detail: issue.detail ?? null,
    })
    // 23505 = the partial unique index won a race with another writer: fine.
    if (error && (error as { code?: string }).code !== '23505') {
      console.error('[sys-sync-issues] insert failed:', error.message)
    }
  } catch (e) {
    console.error('[sys-sync-issues] insert failed:', e)
  }
}

export async function listOpenSyncIssues(
  db: SupabaseClient,
  opts: { sampleId?: string } = {},
): Promise<SyncIssueRow[]> {
  let q = db.from(TABLE).select('*').is('resolved_at', null).order('created_at', { ascending: false })
  if (opts.sampleId) q = q.eq('sample_id', opts.sampleId)
  const { data } = await q
  return ((data ?? []) as SyncIssueRow[]).filter((r) => r.resolved_at == null)
}

/** Returns true when an open row was resolved, false when nothing matched. */
export async function resolveSyncIssue(db: SupabaseClient, id: string, userId: string): Promise<boolean> {
  const { data } = await db
    .from(TABLE)
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq('id', id)
    .is('resolved_at', null)
    .select()
  return ((data ?? []) as unknown[]).length > 0
}
