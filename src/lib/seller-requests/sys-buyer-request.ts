import type { SupabaseClient } from '@supabase/supabase-js'
import type { GraphSentIds } from '@/lib/graph/send'
import { insertSyncIssue } from '@/lib/approval-notification/sys-sync-issues'
import type { BuyerSampleDestination, Lang } from './types'

/**
 * A seller email that asks for a sample to the buyer (an approved PSS, buyer
 * sample ticked) is recorded on sys the way sys's own "Request sample" records
 * one, so logistics see it on the contract and the seller's reply threads to it:
 *
 *   - our approved PSS row(s) get `qc_pre_approved_at` (sys 0989): "pre-approved
 *     by W&A QC";
 *   - a 'requested' shipment_samples row for the buyer's sample, source 'sys',
 *     `pre_approval_of` → our row (sys's mirror never claims such a row);
 *   - a `request_batches` row (status 'sent', with the Graph message ids) and a
 *     `pss_requests` row, as sys's send-core writes them.
 *
 * Never writes `contract_splits`: its sample destination is the leg's LAB
 * destination, not where the seller sends this sample.
 */

/** The sys shipment_samples columns the plan reads. */
export interface SysPssRow {
  id: string
  waqc_ref: string | null
  sample_type: string | null
  status: string | null
  group_id: string | null
  container_slot: number | null
  shipment_id: string | null
  split_id: string | null
  pre_approval_of: string | null
  created_at: string
}

const ROW_COLUMNS =
  'id, waqc_ref, sample_type, status, group_id, container_slot, shipment_id, split_id, pre_approval_of, created_at'

const isPss = (r: SysPssRow) => (r.sample_type ?? '').toLowerCase().includes('pss')

/**
 * Which rows are ours and where the buyer request hangs.
 *
 * - `claimedIds`: the approved PSS rows keyed by our ref (every leaf of a
 *   container group), never a buyer request.
 * - `anchorId`: the claimed row with the lowest `container_slot`, else the oldest.
 * - `existingRequestId`: a buyer request already pointing at one of them (a
 *   resend updates it instead of opening a second).
 */
export function planBuyerRequest(
  rows: SysPssRow[],
  waqcRef: string,
): {
  claimedIds: string[]
  anchorId: string | null
  existingRequestId: string | null
  /** The request row's status: only a 'requested' one still takes a new recipient. */
  existingRequestStatus: string | null
} {
  const claimed = rows.filter(
    (r) => isPss(r) && r.status === 'approved' && r.waqc_ref === waqcRef && !r.pre_approval_of,
  )
  const ordered = [...claimed].sort((a, b) => {
    const slotA = a.container_slot ?? Number.POSITIVE_INFINITY
    const slotB = b.container_slot ?? Number.POSITIVE_INFINITY
    if (slotA !== slotB) return slotA - slotB
    return String(a.created_at).localeCompare(String(b.created_at))
  })
  const claimedIds = claimed.map((r) => r.id)
  const ids = new Set(claimedIds)
  const existing = rows
    .filter((r) => r.pre_approval_of && ids.has(r.pre_approval_of))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
  return {
    claimedIds,
    anchorId: ordered[0]?.id ?? null,
    existingRequestId: existing?.id ?? null,
    existingRequestStatus: existing?.status ?? null,
  }
}

type DbResult = { data: unknown; error: { code?: string; message?: string } | null }

/** A sys user column (`created_by`, `requested_by`, `sent_by`) points at a
 *  sys profile a WAQC-only user may not have: on a foreign-key error, retry
 *  once with those columns null. */
async function withUserFallback(
  run: (payload: Record<string, unknown>) => PromiseLike<DbResult>,
  payload: Record<string, unknown>,
  userColumns: string[],
): Promise<DbResult> {
  const first = await run(payload)
  if (first.error?.code !== '23503') return first
  const anonymous = { ...payload }
  for (const col of userColumns) anonymous[col] = null
  return run(anonymous)
}

const fail = (error: { message?: string }) => new Error(error.message ?? 'sys write failed')

/** Record the buyer-sample request on sys. Never throws: a failure is a sync issue. */
export async function recordBuyerSampleRequest(
  admin: SupabaseClient<any>,
  args: {
    sampleId: string
    contractId: string
    waqcRef: string
    sellerId: string | null
    destination: BuyerSampleDestination
    userId: string
    email: { to: string[]; cc: string[]; subject: string; bodyMarkup: string; language: Lang; ids: GraphSentIds | null }
  },
): Promise<void> {
  const { sampleId, contractId, waqcRef, sellerId, destination, userId, email } = args
  const issue = (reason: string, detail: Record<string, unknown>) =>
    insertSyncIssue(admin, { sampleId, contractId, waqcRef, stage: 'email', reason, detail })

  try {
    // 1. The contract's PSS rows, and the plan.
    const read = await admin
      .from('shipment_samples')
      .select(ROW_COLUMNS)
      .eq('contract_id', contractId)
      .ilike('sample_type', '%pss%')
    if (read.error) throw fail(read.error)
    const rows = (read.data ?? []) as SysPssRow[]
    const plan = planBuyerRequest(rows, waqcRef)
    const anchor = rows.find((r) => r.id === plan.anchorId)
    if (!anchor) {
      await issue('buyer_request_no_target', { rows: rows.length })
      return
    }

    const now = new Date().toISOString()

    // 2. Our rows: pre-approved by W&A QC.
    const marked = await admin
      .from('shipment_samples')
      .update({ qc_pre_approved_at: now })
      .in('id', plan.claimedIds)
    if (marked.error) throw fail(marked.error)

    // 3. The buyer request: a resend updates the one already open.
    const recipient = destination.companyId
      ? { recipient_company_id: destination.companyId, recipient_company_name: null }
      : { recipient_company_id: null, recipient_company_name: destination.companyName }
    let requestRowId: string
    if (plan.existingRequestId) {
      // Only a request still 'requested' takes the new recipient; one logistics
      // has dispatched or decided is left alone (the pss_request is still logged).
      if (plan.existingRequestStatus === 'requested') {
        const updated = await admin.from('shipment_samples').update(recipient).eq('id', plan.existingRequestId)
        if (updated.error) throw fail(updated.error)
      }
      requestRowId = plan.existingRequestId
    } else {
      const inserted = await withUserFallback(
        (payload) => admin.from('shipment_samples').insert(payload).select('id').single(),
        {
          contract_id: contractId,
          shipment_id: anchor.shipment_id,
          split_id: anchor.split_id,
          sample_type: 'pss',
          status: 'requested',
          source: 'sys',
          created_by: userId,
          pre_approval_of: anchor.id,
          ...recipient,
        },
        ['created_by'],
      )
      const id = (inserted.data as { id?: string } | null)?.id
      if (inserted.error || !id) throw fail(inserted.error ?? { message: 'buyer request insert returned no id' })
      requestRowId = id
    }

    // 4. The request batch (seller_id is required on sys).
    let batchId: string | null = null
    if (sellerId) {
      const ids = email.ids
      const batch = await withUserFallback(
        (payload) => admin.from('request_batches').insert(payload).select('id').single(),
        {
          idempotency_key: `waqc-buyer-sample:${requestRowId}:${ids?.internetMessageId ?? Date.now()}`,
          kind: 'samples',
          origin: 'staff',
          seller_id: sellerId,
          contract_ids: [contractId],
          buyer_company_ids: destination.companyId ? [destination.companyId] : [],
          items: [
            {
              contract_id: contractId,
              sample_destination: destination.companyName,
              sample_destination_company_id: destination.companyId,
            },
          ],
          requested_by: userId,
          language: email.language,
          subject: email.subject,
          body: email.bodyMarkup,
          to_emails: email.to,
          cc_emails: email.cc,
          status: 'sent',
          graph_message_id: ids?.graphMessageId ?? null,
          internet_message_id: ids?.internetMessageId ?? null,
          conversation_id: ids?.conversationId ?? null,
          sent_at: now,
          sent_by: userId,
        },
        ['requested_by', 'sent_by'],
      )
      const id = (batch.data as { id?: string } | null)?.id
      if (batch.error || !id) throw fail(batch.error ?? { message: 'request batch insert returned no id' })
      batchId = id
    }

    // 5. The request itself, as sys's Request sample logs it.
    const logged = await withUserFallback(
      (payload) => admin.from('pss_requests').insert(payload),
      {
        requested_by: userId,
        request_method: 'email',
        email_to: email.to,
        email_cc: email.cc,
        subject: email.subject,
        batch_id: batchId,
        sample_id: requestRowId,
        contract_id: contractId,
      },
      ['requested_by'],
    )
    if (logged.error) throw fail(logged.error)
  } catch (e) {
    console.error('[seller-requests] buyer request on sys failed (non-fatal):', e)
    await issue('buyer_request_error', { message: e instanceof Error ? e.message : String(e) })
  }
}
