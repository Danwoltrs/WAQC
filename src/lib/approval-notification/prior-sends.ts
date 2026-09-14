import type { SupabaseClient } from '@supabase/supabase-js'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import type { SendStatusRow } from './batch-send'

/** Outbound sources whose rows mean a certificate has been emailed. */
export const PRIOR_SEND_SOURCES = new Set(['sample_approval', 'batch_approval'])

export interface PriorSendMessage {
  sent_by: string | null
  sent_at: string | null
  metadata: { source?: unknown; sample_id?: unknown; side?: unknown } | null
}

/** Pure: the approval sends among `messages` that cover one of `sampleIds`. */
export function toSendStatusRows(
  messages: PriorSendMessage[],
  sampleIds: Set<string>,
  nameById: Map<string, string>,
): SendStatusRow[] {
  const rows: SendStatusRow[] = []
  for (const m of messages) {
    const meta = m.metadata ?? {}
    if (!PRIOR_SEND_SOURCES.has(String(meta.source))) continue
    const sampleId = meta.sample_id
    const side = meta.side
    if (typeof sampleId !== 'string' || !sampleIds.has(sampleId)) continue
    if (side !== 'buyer' && side !== 'seller') continue
    rows.push({
      sampleId,
      side,
      sentBy: m.sent_by ? nameById.get(m.sent_by) ?? null : null,
      sentAt: m.sent_at ?? null,
    })
  }
  return rows
}

/**
 * Every approval send already made for these certificates, read by the
 * certificate's own sample (`metadata.sample_id`) rather than through its sys
 * contract: a lot that resolves no contract — every Dunkin lot — would otherwise
 * never show as sent, and would queue again after every send.
 *
 * Chunked, because the ids travel in the request URI. Throws on a failed read so
 * a caller never mistakes "could not tell" for "nothing sent yet".
 */
export async function fetchPriorSends(admin: SupabaseClient, sampleIds: string[]): Promise<SendStatusRow[]> {
  const ids = [...new Set(sampleIds)]
  if (ids.length === 0) return []

  const { data, error } = await selectInChunks<PriorSendMessage>(ids, (chunk) =>
    admin
      .from('email_messages')
      .select('sent_by, sent_at, metadata')
      .eq('status', 'sent')
      .in('metadata->>sample_id', chunk) as unknown as Promise<{ data: PriorSendMessage[] | null; error: unknown }>,
  )
  if (error) throw error
  const messages = data ?? []

  const senderIds = [...new Set(messages.map((m) => m.sent_by).filter((id): id is string => !!id))]
  const nameById = new Map<string, string>()
  if (senderIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', senderIds)
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? '')
    }
  }
  return toSendStatusRows(messages, new Set(ids), nameById)
}
