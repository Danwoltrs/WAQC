import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalDecision } from './types'

export interface ShipmentSampleRow {
  id: string
  waqc_ref: string | null
  sample_type: string | null
  created_at: string
}

/**
 * Confident match only. Returns the row id to UPDATE, or null (→ the caller
 * INSERTs a correctly-keyed row). We never pick among multiple/ambiguous rows:
 * shipment_samples is shared with sys, so overwriting an arbitrary peer would
 * mis-attribute another sample's approval.
 *   - exact `waqc_ref` === our ref → that row.
 *   - else a SINGLE unclaimed PSS placeholder (waqc_ref empty) → claim it.
 *   - else null (ambiguous or none — insert instead).
 */
export function pickShipmentSampleMatch(
  rows: ShipmentSampleRow[],
  waqcRef: string,
): string | null {
  const exact = rows.find((r) => r.waqc_ref === waqcRef)
  if (exact) return exact.id
  const unclaimed = rows.filter(
    (r) => (r.sample_type ?? 'pss') === 'pss' && !r.waqc_ref,
  )
  return unclaimed.length === 1 ? unclaimed[0].id : null
}

export interface WritebackUpdateOpts {
  decision: ApprovalDecision
  userId: string
  today: string
  certificateUrl: string | null
  waqcRef: string
}

export function buildWritebackUpdate(opts: WritebackUpdateOpts) {
  return {
    status: opts.decision,
    approved_by: opts.userId,
    approved_date: opts.today,
    certificate_url: opts.certificateUrl,
    // Claim/confirm the WAQC ref so a matched empty placeholder becomes exactly
    // keyed (idempotent on resend; a no-op when it already matched exactly).
    waqc_ref: opts.waqcRef,
  }
}

export interface WritebackInsertOpts extends WritebackUpdateOpts {
  contractId: string
}

export function buildWritebackInsert(opts: WritebackInsertOpts) {
  return {
    contract_id: opts.contractId,
    sample_type: 'pss',
    waqc_ref: opts.waqcRef,
    status: opts.decision,
    approved_by: opts.userId,
    approved_date: opts.today,
    certificate_url: opts.certificateUrl,
    created_by: opts.userId,
  }
}

/**
 * I/O wrapper: find/create the contract's shipment_samples row and mark it
 * approved/rejected. Best-effort optional columns (approval_comments) are set
 * in a second guarded update so a missing column never fails the send.
 * Returns the affected row id, or null on failure (non-fatal to the caller).
 */
export async function applyShipmentSampleApproval(
  admin: SupabaseClient,
  args: {
    contractId: string
    waqcRef: string
    decision: ApprovalDecision
    userId: string
    today: string
    certificateUrl: string | null
    comments?: string | null
  },
): Promise<string | null> {
  try {
    const { data: rows } = await admin
      .from('shipment_samples')
      .select('id, waqc_ref, sample_type, created_at')
      .eq('contract_id', args.contractId)
    const matchId = pickShipmentSampleMatch((rows ?? []) as ShipmentSampleRow[], args.waqcRef)

    let rowId: string | null
    if (matchId) {
      await admin
        .from('shipment_samples')
        .update(buildWritebackUpdate(args))
        .eq('id', matchId)
      rowId = matchId
    } else {
      console.warn(
        `[approval] no confident shipment_samples match for contract ${args.contractId} (ref ${args.waqcRef}); inserting a new row`,
      )
      const { data: inserted } = await admin
        .from('shipment_samples')
        .insert(buildWritebackInsert(args))
        .select('id')
        .single()
      rowId = (inserted as { id: string } | null)?.id ?? null
    }

    if (rowId && args.comments) {
      // Optional column; ignore failure if it does not exist yet.
      await admin
        .from('shipment_samples')
        .update({ approval_comments: args.comments })
        .eq('id', rowId)
        .then(undefined, () => undefined)
    }
    return rowId
  } catch (e) {
    console.error('[approval] shipment_samples write-back failed (non-fatal):', e)
    return null
  }
}
