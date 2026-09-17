/**
 * The per-sample audit log (`sample_events`, migration 20260917000000).
 *
 * Every step that matters to "was a certificate out in the world before this
 * sample was deleted?" is appended here with who did it and when: a
 * certificate issued (minted or re-certified), downloaded (the app, a bulk
 * zip, the public QR page, the portal), sent by email, and the deletion
 * itself. The log is append-only and never blocks the action it records:
 * a failed insert is logged to the console and the action goes on.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type SampleEventType =
  | 'certificate_issued'
  | 'certificate_downloaded'
  | 'certificate_sent'
  | 'sample_deleted'

export type DownloadChannel = 'app' | 'bulk' | 'public' | 'portal'

export interface SampleEventInput {
  sample_id: string
  event_type: SampleEventType
  certificate_id?: string | null
  /** NULL for an unauthenticated actor (the public QR download). */
  actor_user_id?: string | null
  /** Defaults to now() on the database. */
  occurred_at?: string
  metadata?: Record<string, unknown>
}

export interface SampleEventRow {
  id: string
  sample_id: string
  certificate_id: string | null
  event_type: SampleEventType
  actor_user_id: string | null
  occurred_at: string
  metadata: Record<string, unknown>
}

/** Shape the insert rows so a missing optional never lands as `undefined`. */
export function toSampleEventRows(events: SampleEventInput[]): Array<Record<string, unknown>> {
  return events.map((e) => {
    const row: Record<string, unknown> = {
      sample_id: e.sample_id,
      event_type: e.event_type,
      certificate_id: e.certificate_id ?? null,
      actor_user_id: e.actor_user_id ?? null,
      metadata: e.metadata ?? {},
    }
    if (e.occurred_at) row.occurred_at = e.occurred_at
    return row
  })
}

/**
 * Append events. Non-throwing: the audit must never break the action it
 * records, so a database error is reported in the result and on the console.
 */
export async function logSampleEvents(
  db: SupabaseClient<any>,
  events: SampleEventInput[],
): Promise<{ ok: boolean; error?: string }> {
  if (events.length === 0) return { ok: true }
  try {
    const { error } = await db.from('sample_events').insert(toSampleEventRows(events))
    if (error) {
      console.error('[sample-events] insert failed (non-fatal):', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sample-events] insert threw (non-fatal):', message)
    return { ok: false, error: message }
  }
}

export function logSampleEvent(db: SupabaseClient<any>, event: SampleEventInput) {
  return logSampleEvents(db, [event])
}

/** A certificate PDF left the system through `channel`. */
export function logCertificateDownload(
  db: SupabaseClient<any>,
  args: { sampleId: string; certificateId?: string | null; actorUserId?: string | null; channel: DownloadChannel; cached?: boolean },
) {
  return logSampleEvent(db, {
    sample_id: args.sampleId,
    certificate_id: args.certificateId ?? null,
    actor_user_id: args.actorUserId ?? null,
    event_type: 'certificate_downloaded',
    metadata: { channel: args.channel, cached: args.cached ?? false },
  })
}
