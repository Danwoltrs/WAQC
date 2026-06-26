import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalDecision } from './types'
import { resolveSampleContract } from './contract-resolver'
import { applyShipmentSampleApproval } from './shipment-sample-writeback'
import { fetchQualitySampleSummaries } from './quality-summary'
import { getInitials } from './batch-send'

/**
 * Push an approval/rejection decision to the shared sys `shipment_samples` table
 * the instant it is made — independent of whether the approval email is ever
 * sent. Sets status + approver + approver initials (which marks the row as
 * approved-in-QC for the sys badge), and on rejection the cup/green reason so
 * logistics need not retype it.
 *
 * A mother sample's decision is written to its primary contract AND to every
 * sub-contract it covers (`sample_contracts` — one sys contract per row): each
 * is a distinct shipment_samples set, and rejecting only the mother is exactly
 * what left the sub-contracts stuck for manual entry. Per contract, a
 * container-split sample claims every per-container leaf (see
 * `applyShipmentSampleApproval`).
 *
 * Best-effort and fully non-fatal: a failure here must never break the decision
 * flow that called it. `certificateUrl` is intentionally left null (the PDF is
 * generated/annexed later by notify-approval / batch-send, which fill it in
 * without clobbering this write).
 */
export async function writeDecisionToShipmentSamples(
  admin: SupabaseClient,
  sampleId: string,
  userId: string,
  comments: string | null = null,
  opts: { syncOnly?: boolean } = {},
): Promise<void> {
  try {
    const { data: sample } = await admin
      .from('samples')
      .select('id, tracking_number, status, contract_id, wolthers_contract_nr, sample_type')
      .eq('id', sampleId)
      .single()
    const s = sample as {
      tracking_number: string | null
      status: string | null
      contract_id: string | null
      wolthers_contract_nr: string | null
      sample_type: string | null
    } | null
    if (!s || (s.status !== 'approved' && s.status !== 'rejected') || !s.tracking_number) return

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const fullName = (profile as { full_name?: string | null } | null)?.full_name ?? null
    const initials = fullName ? getInitials(fullName) : null

    // Rejection reason — the SAME rich reason shown on the approval/rejection
    // email: named cup faults/taints ("Hard (riado) (3)"), the compliance spec
    // violations, and any free-text lab note. Logistics see exactly what the
    // buyer/seller saw and need not retype it. Flattened to one line (" | ") for
    // the sys cell. Approvals carry the optional seller note via `comments`;
    // reason stays null for them.
    let reason: string | null = null
    if (s.status === 'rejected') {
      const summaries = await fetchQualitySampleSummaries(admin, [sampleId])
      const raw = summaries.get(sampleId)?.reason ?? null
      reason = raw ? raw.replace(/\s*\n+\s*/g, ' | ') : null
    }

    // Narrowed to 'approved' | 'rejected' by the guard above.
    const decision = s.status as ApprovalDecision
    const sampleType = s.sample_type ?? 'pss'
    const today = new Date().toISOString().slice(0, 10)
    const base = {
      decision, userId, today, certificateUrl: null, comments, reason, initials, sampleType,
      syncOnly: opts.syncOnly,
    }

    // One write per resolved sys contract; dedupe so the mother and a sub that
    // share a contract don't double-claim the same rows.
    const processed = new Set<string>()

    // 1) Primary / mother contract.
    const mother = await resolveSampleContract(admin, s)
    if (mother) {
      processed.add(mother.contractId)
      await applyShipmentSampleApproval(admin, {
        ...base,
        contractId: mother.contractId,
        waqcRef: s.tracking_number,
      })
    }

    // 2) Every sub-contract (the gap that left rejections stuck on the mother).
    const { data: subs } = await admin
      .from('sample_contracts')
      .select('contract_id, wolthers_contract_nr, tracking_number')
      .eq('sample_id', sampleId)
    for (const sub of (subs ?? []) as Array<{
      contract_id: string | null
      wolthers_contract_nr: string | null
      tracking_number: string | null
    }>) {
      const ctx = await resolveSampleContract(admin, {
        contract_id: sub.contract_id,
        wolthers_contract_nr: sub.wolthers_contract_nr,
      })
      if (!ctx || processed.has(ctx.contractId)) continue
      processed.add(ctx.contractId)
      // The sub's own tracking number keys its sys rows; strip the rejection
      // "R-" prefix so the claim ref is stable across approve/reject.
      const subRef = (sub.tracking_number ?? s.tracking_number).replace(/^R-/, '')
      await applyShipmentSampleApproval(admin, {
        ...base,
        contractId: ctx.contractId,
        waqcRef: subRef,
      })
    }
  } catch (e) {
    console.error('[sys-decision-writeback] non-fatal:', e)
  }
}