import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalDecision } from './types'
import { insertSyncIssue } from './sys-sync-issues'
import { companyDisplayName } from '@/lib/contract-intake-mapping'

export interface ShipmentSampleRow {
  id: string
  waqc_ref: string | null
  sample_type: string | null
  /**
   * Container-split batch this leaf belongs to (sys `sample_groups`). When a
   * contract's QC sample is split into N notional containers, sys holds N leaf
   * rows that share one `group_id` (the "per sub" master). A single decision
   * must claim ALL of them, not just one — picking one and inserting for the
   * rest is exactly what stranded the per-container rows for manual entry.
   */
  group_id?: string | null
  /**
   * Row status. Only read for one decision: when every same-type row is
   * claimed by OTHER refs and all of them are `rejected`, the incoming ref is a
   * re-sample after a rejection and gets a fresh row (see below).
   */
  status?: string | null
  /**
   * Set on a buyer-sample request (sys 0989): the 'requested' row sys holds for
   * the sample the seller sends the BUYER after a WAQC pre-approval, pointing at
   * our pre-approved row. Never ours to claim or count. Absent when sys has no
   * such column yet (the read falls back).
   */
  pre_approval_of?: string | null
  created_at: string
}

export interface WritebackTargets {
  /**
   * Row ids to UPDATE/claim. More than one when the contract's sample is a
   * container-split group (one leaf per container). Empty → consult `insert`.
   */
  updateIds: string[]
  /**
   * true  → no existing row is ours; INSERT a fresh, correctly-keyed row.
   * false with empty `updateIds` → SKIP: same-type rows exist but none are
   * confidently ours, so we neither clobber a peer nor create a phantom
   * duplicate; a human resolves it.
   */
  insert: boolean
}

/**
 * Decide which shipment_samples rows a decision should touch, scoped to its own
 * sample type. shipment_samples is shared with sys, so we never overwrite a peer
 * (a row claimed by a different waqc_ref) and never cross sample types. The intent
 * is "claim MY ref's set of rows in full" — every per-container leaf of the
 * contract's split, idempotently — rather than "match exactly one row".
 *
 *   - SS decision → update our own prior SS row(s) by exact ref, else INSERT a
 *     distinct SS row (sys carries no SS placeholders; never touch a PSS row).
 *   - PSS, contract has no PSS row at all → INSERT a fresh PSS row.
 *   - PSS otherwise → claim a SET of rows:
 *       · every row already carrying our exact ref (idempotent resend);
 *       · plus any still-unclaimed leaf of a group we already partly hold (so a
 *         group that grew between runs is re-completed);
 *       · plus — when we hold no group leaf yet — the contract's SINGLE unclaimed
 *         container-split group, claiming ALL its leaves. This also SELF-HEALS the
 *         old bug: a stray standalone row carrying our ref (a phantom a prior buggy
 *         run inserted) no longer blocks the real per-container leaves;
 *       · else a single unclaimed standalone placeholder.
 *     If the set is still empty:
 *       · every same-type row is claimed by OTHER refs and every one of them is
 *         `rejected` → INSERT. This is a re-sample after a rejection (a new lab
 *         tracking number for the second sample), and it can be none of the
 *         existing rows. Skipping here left sys reading "Rejected" for weeks
 *         after QC had approved the re-sample (41858/26, 41859/26, 42201/26,
 *         42262/26 — Sep 2026);
 *       · otherwise (an ambiguous multi-group / multi-standalone mix, or a peer
 *         ref's row that is not rejected) → SKIP: never phantom-insert, never
 *         clobber a peer. A human resolves it.
 */
export function selectShipmentSampleTargets(
  rows: ShipmentSampleRow[],
  waqcRef: string,
  targetType: string = 'pss',
): WritebackTargets {
  // A buyer-sample request is the buyer's sample, not ours: it is invisible here
  // (else it reads as an unclaimed placeholder a decision could adopt).
  const sameType = rows.filter((r) => !r.pre_approval_of && (r.sample_type ?? 'pss') === targetType)
  const exact = sameType.filter((r) => r.waqc_ref === waqcRef)

  if (targetType !== 'pss') {
    return exact.length > 0
      ? { updateIds: exact.map((r) => r.id), insert: false }
      : { updateIds: [], insert: true }
  }
  if (sameType.length === 0) return { updateIds: [], insert: true }

  const unclaimed = sameType.filter((r) => !r.waqc_ref)
  const unclaimedGroupIds = [...new Set(unclaimed.filter((r) => r.group_id).map((r) => r.group_id as string))]
  const unclaimedStandalone = unclaimed.filter((r) => !r.group_id)

  const targets = new Set<string>(exact.map((r) => r.id))

  // Re-complete any container-split group we already partly hold (leaves added
  // after our first write), so the group stays whole across resends.
  const heldGroupIds = new Set(exact.filter((r) => r.group_id).map((r) => r.group_id as string))
  for (const row of unclaimed) {
    if (row.group_id && heldGroupIds.has(row.group_id)) targets.add(row.id)
  }

  // Primary claim: hold no group leaf yet → adopt the contract's single unclaimed
  // container-split group (all its per-container leaves). Self-heals a phantom
  // standalone that carries our ref but isn't a real container leaf.
  if (heldGroupIds.size === 0 && unclaimedGroupIds.length === 1 && unclaimedStandalone.length === 0) {
    for (const row of unclaimed) {
      if (row.group_id === unclaimedGroupIds[0]) targets.add(row.id)
    }
  }

  // No group in play and exactly one unclaimed standalone placeholder → claim it.
  if (targets.size === 0 && unclaimedGroupIds.length === 0 && unclaimedStandalone.length === 1) {
    targets.add(unclaimedStandalone[0].id)
  }

  // Re-sample after a rejection: nothing is ours, nothing is unclaimed, and
  // every row the contract has is a rejected sample under some other ref. The
  // incoming decision is about a NEW physical sample — give it its own row.
  const isResampleAfterRejection =
    targets.size === 0 &&
    unclaimed.length === 0 &&
    sameType.every((r) => r.status === 'rejected')
  if (isResampleAfterRejection) return { updateIds: [], insert: true }

  return { updateIds: [...targets], insert: false }
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
  /** Re-sync after a post-decision EDIT (not a fresh decision). Keeps the
   *  original decision attribution on sys — the approver and decision date are
   *  left untouched (an editor is not the approver) — while status / waqc_ref /
   *  reason are refreshed. */
  syncOnly?: boolean
}

export function buildWritebackUpdate(opts: WritebackUpdateOpts) {
  const update: Record<string, unknown> = {
    status: opts.decision,
    certificate_url: opts.certificateUrl,
    // Claim/confirm the WAQC ref so a matched empty placeholder becomes exactly
    // keyed (idempotent on resend; a no-op when it already matched exactly).
    waqc_ref: opts.waqcRef,
  }
  // A pure edit re-sync must not re-stamp the approver/date (the editor isn't
  // the approver); a real decision sets them.
  if (!opts.syncOnly) {
    update.approved_by = opts.userId
    update.approved_date = opts.today
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

const CANDIDATE_COLUMNS = 'id, waqc_ref, sample_type, group_id, status, created_at'

/** PostgREST / Postgres "no such column": sys has not applied the migration yet. */
const isUndefinedColumn = (error: { code?: string } | null | undefined): boolean =>
  error?.code === '42703' || error?.code === 'PGRST204'

/**
 * The contract's shipment_samples rows a decision may claim. Reads
 * `pre_approval_of` (sys 0989) so buyer-sample requests are skipped, and falls
 * back to the old column list where sys has no such column yet. Any other read
 * error throws: an empty list would read as "no row at all" and insert a phantom.
 */
async function readCandidateRows(admin: SupabaseClient, contractId: string): Promise<ShipmentSampleRow[]> {
  const first = await admin
    .from('shipment_samples')
    .select(`${CANDIDATE_COLUMNS}, pre_approval_of`)
    .eq('contract_id', contractId)
  if (!first.error) return (first.data ?? []) as ShipmentSampleRow[]
  if (!isUndefinedColumn(first.error)) throw first.error
  const legacy = await admin.from('shipment_samples').select(CANDIDATE_COLUMNS).eq('contract_id', contractId)
  if (legacy.error) throw legacy.error
  return (legacy.data ?? []) as ShipmentSampleRow[]
}

/**
 * A rejection reverses any pre-approval (sys 0989): the rows lose
 * `qc_pre_approved_at`, and a buyer-sample request the seller was asked for that
 * is still 'requested' is logged for a person (staff tell the seller not to
 * ship; no automatic email). Both steps are guarded: a sys without the columns
 * must never break the rejection itself, and this never throws.
 */
async function handleReversal(
  admin: SupabaseClient,
  args: { rowIds: string[]; contractId: string; waqcRef: string; sampleId?: string },
): Promise<void> {
  try {
    await admin
      .from('shipment_samples')
      .update({ qc_pre_approved_at: null })
      .in('id', args.rowIds)
      .then(undefined, () => undefined)

    const read = await admin
      .from('shipment_samples')
      .select('id, recipient_company_id, recipient_company_name')
      .in('pre_approval_of', args.rowIds)
      .eq('status', 'requested')
    if (read.error) return
    const requests = (read.data ?? []) as Array<{
      id: string
      recipient_company_id: string | null
      recipient_company_name: string | null
    }>
    if (requests.length === 0) return

    const companyIds = [...new Set(requests.map((r) => r.recipient_company_id).filter((id): id is string => !!id))]
    const names = new Map<string, string>()
    if (companyIds.length > 0) {
      const companies = await admin.from('companies').select('id, name, fantasy_name').in('id', companyIds)
      for (const c of (companies.data ?? []) as Array<{ id: string; name: string | null; fantasy_name: string | null }>) {
        names.set(c.id, companyDisplayName(c))
      }
    }
    for (const request of requests) {
      const recipient =
        request.recipient_company_name?.trim() ||
        (request.recipient_company_id ? names.get(request.recipient_company_id) : '') ||
        ''
      await insertSyncIssue(admin, {
        sampleId: args.sampleId ?? null,
        contractId: args.contractId,
        waqcRef: args.waqcRef,
        stage: 'decision',
        reason: 'buyer_request_open_after_reversal',
        detail: { request_id: request.id, recipient },
      })
    }
  } catch (e) {
    console.error('[approval] reversal follow-up failed (non-fatal):', e)
  }
}

/**
 * I/O wrapper: find/create the contract's shipment_samples row(s) and mark them
 * approved/rejected. A container-split sample claims EVERY leaf of its batch in
 * one update — so a rejection lands on all per-container rows, not just one.
 * Best-effort optional columns (approval_comments, rejection_reason) are set in
 * a second guarded update so a missing column never fails the send.
 * Returns the first affected row id, or null on skip/failure (non-fatal).
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
    /** Rejection reason (e.g. "CUP: 1 COPO SUJO"). Written to `rejection_reason`
     *  on rejections only, so logistics need not retype it on sys. */
    reason?: string | null
    /** Approver initials (e.g. "AN"). Its presence on the row also drives the
     *  sys "approved-in-QC" marker. */
    initials?: string | null
    /** WAQC sample type ('pss' | 'ss' | …). Defaults to 'pss'. An 'ss' decision
     *  targets/creates a distinct SS row (never the contract's PSS) and stamps
     *  source='qc'. */
    sampleType?: string
    /** Post-edit re-sync (not a fresh decision): refresh status / waqc_ref /
     *  reason but preserve the original approver, decision date and QC initials. */
    syncOnly?: boolean
    /** The WAQC sample this decision belongs to — keys the skip log. */
    sampleId?: string
  },
): Promise<string | null> {
  try {
    const sampleType = args.sampleType ?? 'pss'
    // An SS approval marks a distinct, QC-owned shipment-sample row.
    const source = sampleType === 'ss' ? 'qc' : undefined

    const rows = await readCandidateRows(admin, args.contractId)
    const targets = selectShipmentSampleTargets(rows, args.waqcRef, sampleType)

    // Don't clobber an existing certificate_url when the caller has none yet
    // (decision-time write-back precedes certificate generation/email send).
    const update: Record<string, unknown> = buildWritebackUpdate({ ...args, source })
    if (args.certificateUrl == null) delete update.certificate_url

    let rowIds: string[]
    if (targets.updateIds.length > 0) {
      await admin
        .from('shipment_samples')
        .update(update)
        .in('id', targets.updateIds)
      rowIds = targets.updateIds
    } else if (targets.insert) {
      const { data: inserted } = await admin
        .from('shipment_samples')
        .insert(buildWritebackInsert({ ...args, sampleType, source }))
        .select('id')
        .single()
      const id = (inserted as { id: string } | null)?.id ?? null
      rowIds = id ? [id] : []
    } else {
      // Nothing confidently ours: never phantom-insert, never clobber a peer.
      // Since 0749 the mirror trigger owns row existence, so this is rare —
      // when it happens a person resolves it from the QC skip log.
      await insertSyncIssue(admin, {
        sampleId: args.sampleId ?? null,
        contractId: args.contractId,
        waqcRef: args.waqcRef,
        stage: 'decision',
        reason: 'no_confident_target',
        detail: { sampleType, decision: args.decision, rows: rows.length },
      })
      return null
    }

    // Optional columns set in a second guarded update so a missing column never
    // fails the core write-back: approval_comments (approval seller note), the
    // approver initials (which also marks the row as approved-in-QC for sys),
    // and on rejection an explicit rejected_date + the rejection_reason.
    const optional: Record<string, unknown> = {}
    if (args.comments) optional.approval_comments = args.comments
    // Preserve the original approver/date on a pure edit re-sync; refresh the
    // reason (it may have changed) either way.
    if (!args.syncOnly && args.initials) optional.approved_by_initials = args.initials
    if (args.decision === 'rejected') {
      if (!args.syncOnly) optional.rejected_date = args.today
      if (args.reason) optional.rejection_reason = args.reason
    }
    if (rowIds.length > 0 && Object.keys(optional).length > 0) {
      await admin
        .from('shipment_samples')
        .update(optional)
        .in('id', rowIds)
        .then(undefined, () => undefined)
    }
    if (args.decision === 'rejected' && rowIds.length > 0) {
      await handleReversal(admin, { ...args, rowIds })
    }
    return rowIds[0] ?? null
  } catch (e) {
    console.error('[approval] shipment_samples write-back failed (non-fatal):', e)
    await insertSyncIssue(admin, {
      sampleId: args.sampleId ?? null, contractId: args.contractId, waqcRef: args.waqcRef,
      stage: 'decision', reason: 'writeback_error', detail: { message: e instanceof Error ? e.message : ((e as { message?: string } | null)?.message ?? String(e)) },
    })
    return null
  }
}
