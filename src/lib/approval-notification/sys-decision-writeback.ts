import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalDecision } from './types'
import { resolveSampleContract } from './contract-resolver'
import { applyShipmentSampleApproval } from './shipment-sample-writeback'
import { fetchQualitySampleSummaries } from './quality-summary'
import { initialsFromProfile } from './initials'
import { fetchGroup, isLabUnit } from '@/lib/sample-group'

/**
 * Push an approval/rejection decision to the shared sys `shipment_samples` table
 * the instant it is made — independent of whether the approval email is ever
 * sent. Sets status + approver + approver initials (which marks the row as
 * approved-in-QC for the sys badge), and on rejection the cup/green reason so
 * logistics need not retype it.
 *
 * A decision belongs to the whole contract group (one physical sample, N
 * `samples` rows sharing a lab unit — see `sample-group.ts`): it is written to
 * the lab unit's contract AND to every sibling's own contract. Each is a
 * distinct shipment_samples set, and writing only one of them is exactly what
 * left the other contracts stuck for manual entry. Any member id resolves the
 * group, so an override made on a sibling's certificate reaches the lab unit's
 * contract too. Per contract, a container-split sample claims every
 * per-container leaf (see `applyShipmentSampleApproval`).
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
      .select('id, tracking_number, status, contract_id, wolthers_contract_nr, sample_type, lab_source_sample_id')
      .eq('id', sampleId)
      .single()
    const s = sample as {
      id: string
      tracking_number: string | null
      status: string | null
      contract_id: string | null
      wolthers_contract_nr: string | null
      sample_type: string | null
      lab_source_sample_id: string | null
    } | null
    if (!s || (s.status !== 'approved' && s.status !== 'rejected') || !s.tracking_number) return

    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name, full_name')
      .eq('id', userId)
      .maybeSingle()
    const initials = initialsFromProfile(
      (profile as { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null) ?? {},
    )

    // Every contract this physical sample covers, lab unit first. The status
    // guard above read the requested row; decisions never diverge inside a
    // group, so it speaks for every member.
    const members = await fetchGroup(admin, sampleId)
    const labUnit = members.find(isLabUnit) ?? { ...s, id: sampleId }
    const labRef = labUnit.tracking_number ?? s.tracking_number

    // Rejection reason — the SAME rich reason shown on the approval/rejection
    // email: named cup faults/taints ("Hard (riado) (3)"), the compliance spec
    // violations, and any free-text lab note. Logistics see exactly what the
    // buyer/seller saw and need not retype it. Flattened to one line (" | ") for
    // the sys cell. Approvals carry the optional seller note via `comments`;
    // reason stays null for them. Lab data lives on the lab unit, so that is
    // the row the summary is built for whichever member we were called with.
    let reason: string | null = null
    if (s.status === 'rejected') {
      const summaries = await fetchQualitySampleSummaries(admin, [labUnit.id])
      const raw = summaries.get(labUnit.id)?.reason ?? null
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

    // One write per resolved sys contract; dedupe so the lab unit and a sibling
    // that share a contract don't double-claim the same rows.
    const processed = new Set<string>()

    // 1) The lab unit's contract, keyed by its internal tracking number.
    const primary = await resolveSampleContract(admin, {
      contract_id: labUnit.contract_id ?? null,
      wolthers_contract_nr: labUnit.wolthers_contract_nr ?? null,
    })
    if (primary) {
      processed.add(primary.contractId)
      await applyShipmentSampleApproval(admin, {
        ...base,
        contractId: primary.contractId,
        waqcRef: labRef,
      })
    }

    // 2) Every contract sibling. A sibling's sys rows are keyed by its
    // CERTIFICATE number (what the retired sample_contracts.tracking_number
    // held), so one read fetches the group's numbers; a sibling not yet
    // certified falls back to its own tracking number. Strip the rejection
    // "R-" prefix so the claim ref is stable across approve/reject.
    const siblings = members.filter((m) => !isLabUnit(m))
    const certNumberById = new Map<string, string>()
    if (siblings.length > 0) {
      const { data: certRows } = await admin
        .from('certificates')
        .select('sample_id, certificate_number')
        .in('sample_id', siblings.map((m) => m.id))
      for (const c of (certRows ?? []) as Array<{ sample_id: string; certificate_number: string | null }>) {
        if (c.certificate_number && !certNumberById.has(c.sample_id)) certNumberById.set(c.sample_id, c.certificate_number)
      }
    }
    for (const m of siblings) {
      const ctx = await resolveSampleContract(admin, {
        contract_id: m.contract_id ?? null,
        wolthers_contract_nr: m.wolthers_contract_nr ?? null,
      })
      if (!ctx || processed.has(ctx.contractId)) continue
      processed.add(ctx.contractId)
      const ref = String(certNumberById.get(m.id) ?? m.tracking_number ?? labRef).replace(/^R-/, '')
      await applyShipmentSampleApproval(admin, {
        ...base,
        contractId: ctx.contractId,
        waqcRef: ref,
      })
    }
  } catch (e) {
    console.error('[sys-decision-writeback] non-fatal:', e)
  }
}