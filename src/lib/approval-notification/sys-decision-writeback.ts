import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSampleContract } from './contract-resolver'
import { applyShipmentSampleApproval } from './shipment-sample-writeback'
import { getInitials } from './batch-send'

/**
 * Push an approval/rejection decision to the shared sys `shipment_samples` table
 * the instant it is made — independent of whether the approval email is ever
 * sent. Sets status + approver + approver initials (which marks the row as
 * approved-in-QC for the sys badge). Best-effort and fully non-fatal: a failure
 * here must never break the decision flow that called it.
 *
 * `certificateUrl` is intentionally left null here (the PDF is generated/annexed
 * later by notify-approval / batch-send, which then fills it in without
 * clobbering this write).
 */
export async function writeDecisionToShipmentSamples(
  admin: SupabaseClient,
  sampleId: string,
  userId: string,
  comments: string | null = null,
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

    const ctx = await resolveSampleContract(admin, s)
    if (!ctx) return

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const fullName = (profile as { full_name?: string | null } | null)?.full_name ?? null
    const initials = fullName ? getInitials(fullName) : null

    await applyShipmentSampleApproval(admin, {
      contractId: ctx.contractId,
      waqcRef: s.tracking_number,
      decision: s.status,
      userId,
      today: new Date().toISOString().slice(0, 10),
      certificateUrl: null,
      comments,
      initials,
      sampleType: s.sample_type ?? 'pss',
    })
  } catch (e) {
    console.error('[sys-decision-writeback] non-fatal:', e)
  }
}