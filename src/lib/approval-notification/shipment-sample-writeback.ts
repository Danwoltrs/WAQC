import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalDecision } from './types'

export interface ShipmentSampleRow {
  id: string
  waqc_ref: string | null
  sample_type: string | null
  created_at: string
}

/**
 * Confident match only, scoped to the decision's own sample type. Returns the
 * row id to UPDATE, or null (→ the caller INSERTs a correctly-keyed row). We
 * never pick among multiple/ambiguous rows, and never cross sample types:
 * shipment_samples is shared with sys, so overwriting an arbitrary peer (or the
 * contract's PSS row when this is an SS decision) would mis-attribute another
 * sample's approval.
 *   - exact `waqc_ref` === our ref among rows of `targetType` → that row.
 *   - else (PSS only) a SINGLE unclaimed PSS placeholder (waqc_ref empty) → claim it.
 *   - else null (ambiguous, wrong type, or none — insert a fresh row instead).
 *
 * SS decisions get no placeholder fallback: sys carries no SS placeholders
 * (every legacy row is a PSS), so an SS approval either updates its own prior
 * SS row or inserts a brand-new distinct SS row — it must not touch the PSS.
 */
export function pickShipmentSampleMatch(
  rows: ShipmentSampleRow[],
  waqcRef: string,
  targetType: string = 'pss',
): string | null {
  const sameType = rows.filter((r) => (r.sample_type ?? 'pss') === targetType)
  const exact = sameType.find((r) => r.waqc_ref === waqcRef)
  if (exact) return exact.id
  if (targetType !== 'pss') return null
  const unclaimed = sameType.filter((r) => !r.waqc_ref)
  return unclaimed.length === 1 ? unclaimed[0].id : null
}

export interface WritebackUpdateOpts {
  decision: ApprovalDecision
  userId: string
  today: string
  certificateUrl: string | null
  waqcRef: string
  /** When set (e.g. 'qc' for an SS approval), stamps the row's source so sys
   *  shows it as approved-in-QC. Omitted from the payload when undefined to
   *  leave the existing PSS write-back behaviour untouched. */
  source?: string
}

export function buildWritebackUpdate(opts: WritebackUpdateOpts) {
  const update: Record<string, unknown> = {
    status: opts.decision,
    approved_by: opts.userId,
    approved_date: opts.today,
    certificate_url: opts.certificateUrl,
    // Claim/confirm the WAQC ref so a matched empty placeholder becomes exactly
    // keyed (idempotent on resend; a no-op when it already matched exactly).
    waqc_ref: opts.waqcRef,
  }
  if (opts.source) update.source = opts.source
  return update
}

export interface WritebackInsertOpts extends WritebackUpdateOpts {
  contractId: string
  /** Row type to create — defaults to 'pss' to preserve legacy behaviour; an SS
   *  approval passes 'ss' so a distinct shipment-sample row is created. */
  sampleType?: string
}

export function buildWritebackInsert(opts: WritebackInsertOpts) {
  const insert: Record<string, unknown> = {
    contract_id: opts.contractId,
    sample_type: opts.sampleType ?? 'pss',
    waqc_ref: opts.waqcRef,
    status: opts.decision,
    approved_by: opts.userId,
    approved_date: opts.today,
    certificate_url: opts.certificateUrl,
    created_by: opts.userId,
  }
  if (opts.source) insert.source = opts.source
  return insert
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
    /** Approver initials (e.g. "AN"). Its presence on the row also drives the
     *  sys "approved-in-QC" marker. */
    initials?: string | null
    /** WAQC sample type ('pss' | 'ss' | …). Defaults to 'pss'. An 'ss' decision
     *  targets/creates a distinct SS row (never the contract's PSS) and stamps
     *  source='qc'. */
    sampleType?: string
  },
): Promise<string | null> {
  try {
    const sampleType = args.sampleType ?? 'pss'
    // An SS approval marks a distinct, QC-owned shipment-sample row.
    const source = sampleType === 'ss' ? 'qc' : undefined

    const { data: rows } = await admin
      .from('shipment_samples')
      .select('id, waqc_ref, sample_type, created_at')
      .eq('contract_id', args.contractId)
    const matchId = pickShipmentSampleMatch(
      (rows ?? []) as ShipmentSampleRow[],
      args.waqcRef,
      sampleType,
    )

    // Don't clobber an existing certificate_url when the caller has none yet
    // (decision-time write-back precedes certificate generation/email send).
    const update: Record<string, unknown> = buildWritebackUpdate({ ...args, source })
    if (args.certificateUrl == null) delete update.certificate_url

    let rowId: string | null
    if (matchId) {
      await admin
        .from('shipment_samples')
        .update(update)
        .eq('id', matchId)
      rowId = matchId
    } else {
      console.warn(
        `[approval] no confident shipment_samples match for contract ${args.contractId} (ref ${args.waqcRef}, type ${sampleType}); inserting a new row`,
      )
      const { data: inserted } = await admin
        .from('shipment_samples')
        .insert(buildWritebackInsert({ ...args, sampleType, source }))
        .select('id')
        .single()
      rowId = (inserted as { id: string } | null)?.id ?? null
    }

    // Optional columns set in a second guarded update so a missing column never
    // fails the core write-back: approval_comments, the approver initials (which
    // also marks the row as approved-in-QC for sys), and an explicit
    // rejected_date for rejections.
    const optional: Record<string, unknown> = {}
    if (args.comments) optional.approval_comments = args.comments
    if (args.initials) optional.approved_by_initials = args.initials
    if (args.decision === 'rejected') optional.rejected_date = args.today
    if (rowId && Object.keys(optional).length > 0) {
      await admin
        .from('shipment_samples')
        .update(optional)
        .eq('id', rowId)
        .then(undefined, () => undefined)
    }
    return rowId
  } catch (e) {
    console.error('[approval] shipment_samples write-back failed (non-fatal):', e)
    return null
  }
}
