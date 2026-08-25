/**
 * The parts of finalizing a cupping that do not depend on which protocol was
 * cupped. Both POST /api/cupping/finalize and POST /api/cupping/cva/finalize
 * call these, so the stage machine, the sys write-back and the certificate
 * mint exist exactly once.
 *
 * Extracted verbatim from the commodity route. If you change behaviour here you
 * are changing it for every lot Wolthers certifies — commodity and specialty.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'

export type FinalizeDecision = 'approved' | 'rejected' | 'pending'

export interface ApplyDecisionInput {
  sampleId: string
  decision: FinalizeDecision
  /** samples.workflow_stage as read before this call. */
  currentWorkflowStage: string | null
  /** Acting user (auth.users id) — resolves to approver initials inside the sys write-back. */
  actorUserId: string
  /** Seller-only note; persisted and pushed to sys on approval only. */
  sellerComment: string | null
}

export async function applyDecision(
  db: SupabaseClient,
  { sampleId, decision, currentWorkflowStage, actorUserId, sellerComment }: ApplyDecisionInput,
): Promise<void> {
  // Valid transitions are cupping/analysis → review → certified/rejected, so a
  // sample arriving from analysis passes through review rather than jumping.
  if (currentWorkflowStage === 'analysis' || currentWorkflowStage === 'cupping') {
    await (db as any).from('samples').update({ workflow_stage: 'review' }).eq('id', sampleId)
  }

  if (decision === 'pending') return

  const workflowStage = decision === 'approved' ? 'certified' : 'rejected'
  await (db as any)
    .from('samples')
    .update({ workflow_stage: workflowStage, status: decision })
    .eq('id', sampleId)

  if (decision === 'approved' && sellerComment) {
    // Guarded so a not-yet-applied migration never fails finalization.
    try {
      await (db as any).from('samples').update({ seller_comment: sellerComment }).eq('id', sampleId)
    } catch {
      // non-fatal
    }
  }

  // writeDecisionToShipmentSamples re-reads samples.status itself to derive the
  // decision, so the update above MUST land before this call.
  await writeDecisionToShipmentSamples(
    db as any,
    sampleId,
    actorUserId,
    decision === 'approved' ? sellerComment : null,
  )
}
