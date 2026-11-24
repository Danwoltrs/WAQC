import type { SupabaseClient } from '@supabase/supabase-js'
import { selectInChunks } from '@/lib/supabase-in-chunks'
import { PRIOR_SEND_SOURCES } from './prior-sends'
import { ALL_PARTIES, type CertificateParty } from './types'

/** One results email that already went out: who sent it, when, to which party and addresses. */
export interface SendHistoryEntry {
  party: CertificateParty
  /** The recipient company; null on sends logged before it was recorded. */
  companyId: string | null
  sentBy: string | null
  sentAt: string | null
  to: string[]
  cc: string[]
  /** A test send: it reached the test address, not the addresses listed. */
  sandbox: boolean
  /** The certificates (by sample) the email covered. */
  sampleIds: string[]
}

export interface SendHistoryMessage {
  sent_by: string | null
  sent_at: string | null
  to_recipients: unknown
  cc_recipients: unknown
  metadata: Record<string, unknown> | null
}

function addresses(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v : typeof (v as any)?.email === 'string' ? (v as any).email : ''))
    .map((e: string) => e.trim())
    .filter(Boolean)
}

/**
 * Pure: the results emails among `messages` that cover one of `sampleIds`,
 * newest first. A send is logged once per certificate, so the rows of one email
 * (same moment, party, company and sender) fold into one entry.
 */
export function toSendHistory(
  messages: SendHistoryMessage[],
  sampleIds: Set<string>,
  nameById: Map<string, string>,
): SendHistoryEntry[] {
  const byEmail = new Map<string, SendHistoryEntry>()
  for (const m of messages) {
    const meta = m.metadata ?? {}
    if (!PRIOR_SEND_SOURCES.has(String(meta.source))) continue
    const sampleId = meta.sample_id
    const side = meta.side
    if (typeof sampleId !== 'string' || !sampleIds.has(sampleId)) continue
    if (typeof side !== 'string' || !ALL_PARTIES.includes(side as CertificateParty)) continue
    const companyId = typeof meta.company_id === 'string' ? meta.company_id : null
    const sandbox = meta.sandbox === true
    const key = [m.sent_at ?? '', side, companyId ?? '', m.sent_by ?? ''].join('|')
    const entry = byEmail.get(key)
    if (entry) {
      if (!entry.sampleIds.includes(sampleId)) entry.sampleIds.push(sampleId)
      continue
    }
    byEmail.set(key, {
      party: side as CertificateParty,
      companyId,
      sentBy: m.sent_by ? nameById.get(m.sent_by) || null : null,
      sentAt: m.sent_at ?? null,
      // A test send went to the test address; what matters is who it was meant for.
      to: sandbox && Array.isArray(meta.requested_to) ? addresses(meta.requested_to) : addresses(m.to_recipients),
      cc: sandbox && Array.isArray(meta.requested_cc) ? addresses(meta.requested_cc) : addresses(m.cc_recipients),
      sandbox,
      sampleIds: [sampleId],
    })
  }
  return [...byEmail.values()].sort((a, b) => String(b.sentAt ?? '').localeCompare(String(a.sentAt ?? '')))
}

/**
 * The earlier sends that matter for one email in the composer: same party, the
 * same company (or none recorded), covering at least one of its certificates.
 * Each entry is narrowed to the certificates this email shares with it.
 */
export function historyForUnit(
  history: SendHistoryEntry[],
  unit: { side: CertificateParty; companyId: string; sampleIds: string[] },
): SendHistoryEntry[] {
  const mine = new Set(unit.sampleIds)
  const out: SendHistoryEntry[] = []
  for (const h of history) {
    if (h.party !== unit.side) continue
    if (h.companyId !== null && h.companyId !== unit.companyId) continue
    const shared = h.sampleIds.filter((id) => mine.has(id))
    if (shared.length === 0) continue
    out.push({ ...h, sampleIds: shared })
  }
  return out
}

/**
 * Every results email already sent for these certificates, with its addresses.
 * Read by the certificate's own sample (`metadata.sample_id`), in chunks because
 * the ids travel in the request URI. Throws on a failed read.
 */
export async function fetchSendHistory(admin: SupabaseClient, sampleIds: string[]): Promise<SendHistoryEntry[]> {
  const ids = [...new Set(sampleIds)]
  if (ids.length === 0) return []

  const { data, error } = await selectInChunks<SendHistoryMessage>(ids, (chunk) =>
    admin
      .from('email_messages')
      .select('sent_by, sent_at, to_recipients, cc_recipients, metadata')
      .eq('status', 'sent')
      .in('metadata->>sample_id', chunk) as unknown as Promise<{ data: SendHistoryMessage[] | null; error: unknown }>,
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
  return toSendHistory(messages, new Set(ids), nameById)
}
