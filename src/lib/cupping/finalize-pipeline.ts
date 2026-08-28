/**
 * The parts of finalizing a cupping that do not depend on which protocol was
 * cupped. Both POST /api/cupping/finalize and POST /api/cupping/cva/finalize
 * call these, so the stage machine, the sys write-back, the certificate mint,
 * the session close (with its master-cupper backfill and audit-trail entry)
 * and the certificate-PDF cache invalidation all exist exactly once.
 *
 * Extracted from the commodity route. If you change behaviour here you are
 * changing it for every lot Wolthers certifies — commodity and specialty.
 *
 * A lot that covers several contracts is a GROUP of samples (a lab unit plus
 * its siblings, src/lib/sample-group.ts). The decision applies to every member
 * and each member gets its own certificate — both live in certificate-mint.ts;
 * this file keeps the finalize-shaped wrappers the routes call.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import {
  applyDecisionToGroup,
  mintGroupCertificates,
  resolveValidityWindow,
  type MintedCertificate,
  type MintGroupResult,
} from './certificate-mint'

export type { MintedCertificate, MintGroupResult } from './certificate-mint'

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
  // Every stage write below fans out to the whole contract group: siblings
  // carry the lab unit's status and stage and never diverge from it.
  //
  // Valid transitions are cupping/analysis → review → certified/rejected, so a
  // sample arriving from analysis passes through review rather than jumping.
  // A failed write here must stop finalization rather than let the route carry
  // on as if the sample had actually moved — surfaced by throwing so the
  // route's existing top-level try/catch turns it into the same 500 the
  // original inline `return NextResponse.json(..., { status: 500 })` produced.
  if (currentWorkflowStage === 'analysis' || currentWorkflowStage === 'cupping') {
    const { error } = await applyDecisionToGroup(db, sampleId, { workflow_stage: 'review' })
    if (error) {
      console.error('Error transitioning to review:', error)
      throw new Error(`Failed to transition sample to review stage: ${error.message}`)
    }
  }

  if (decision === 'pending') return

  const workflowStage = decision === 'approved' ? 'certified' : 'rejected'
  const { error: updateError } = await applyDecisionToGroup(db, sampleId, {
    workflow_stage: workflowStage,
    status: decision,
  })
  if (updateError) {
    console.error('Error updating sample:', updateError)
    throw new Error(`Failed to update sample status: ${updateError.message}`)
  }

  if (decision === 'approved' && sellerComment) {
    // Guarded so a not-yet-applied migration never fails finalization. Left as
    // swallow-and-continue deliberately — unlike the two updates above, a
    // missing seller_comment column must not block certifying the lot.
    try {
      await applyDecisionToGroup(db, sampleId, { seller_comment: sellerComment })
    } catch {
      // non-fatal
    }
  }

  // writeDecisionToShipmentSamples re-reads samples.status itself to derive the
  // decision, so the update above MUST land before this call. It covers the
  // whole group from any member.
  await writeDecisionToShipmentSamples(
    db as any,
    sampleId,
    actorUserId,
    decision === 'approved' ? sellerComment : null,
  )
}

/**
 * Thrown when the sample's tracking_number is missing, empty, or the literal
 * string 'null'. The certificate number IS the sample's tracking number (see
 * the unified-numbering rule), so minting from a broken one would produce a
 * certificate nobody can identify. The route must turn this into the same 400
 * the inline code returned — it must NOT fall through to the generic 500.
 */
export class InvalidTrackingNumberError extends Error {
  readonly status = 400
  readonly details: string
  constructor(message: string, details: string) {
    super(message)
    this.name = 'InvalidTrackingNumberError'
    this.details = details
  }
}

export interface MintCertificatesInput {
  sample: {
    id: string
    /** companies.id of the QC client — names the certificate's issued_to and picks the validity window. */
    client_id: string | null
    /** 'other' → an Other Sample, which clients approve individually. */
    sample_category: string | null
  }
  decision: FinalizeDecision
  /**
   * samples.tracking_number. Passed in ONLY so it can be validated before the
   * insert: the number itself is assigned server-side by the
   * assign_certificate_number trigger, which reuses the sample's tracking
   * number. Nothing here generates a second number.
   */
  trackingNumber: string | null
  /** `decision === 'rejected'` at every existing call site; stored on the row. */
  isRejected: boolean
  /** Compliance violations to stamp on the certificate; [] writes NULL. */
  violations: string[]
  /** Acting user (auth.users id) — recorded as issued_by / created_by. */
  actorUserId: string
}

/**
 * Mints one certificate per member of the sample's contract group (the lab
 * unit first, then its siblings in contract order) and resolves the per-client
 * validity window. Returns the finalized sample's own certificate — what the
 * route echoes and stamps on the audit entry — plus the whole group result.
 *
 * Certificate numbers are NEVER generated here. Each row is inserted with
 * certificate_number null and the assign_certificate_number trigger fills it.
 * Numbers are unique per client, not globally.
 *
 * Re-finalizing a sample that already has a certificate must not mint a second
 * number: that path revises the existing row in place and keeps its number.
 */
export async function mintCertificates(
  db: SupabaseClient,
  { sample, decision, trackingNumber, isRejected, violations, actorUserId }: MintCertificatesInput,
): Promise<{ certificate: MintedCertificate | null; group: MintGroupResult }> {
  const sampleId = sample.id
  const noGroup: MintGroupResult = { minted: [], revised: [], unchanged: [], failed: [], certificates: {} }

  // Read before the skips below, exactly as the inline code did — it is a
  // side-effect-free SELECT, so the pending/Other-Sample paths pay for one
  // wasted read rather than risk a behaviour change here.
  const { validFrom, validUntil } = await resolveValidityWindow(db, sample.client_id)

  // Other Samples don't generate Wolthers certificates — clients approve them
  // individually via the sample_recipients flow.
  const skipCertificate = sample.sample_category === 'other'

  // Create certificate only if both cupping AND grading are complete. The
  // commodity route sets `decision = 'pending'` exactly when grading data is
  // missing and always sets 'approved'/'rejected' when it is present, so
  // `decision !== 'pending'` is that route's `hasGradingData` verbatim.
  const hasDecision = decision !== 'pending'
  if (!hasDecision || skipCertificate) return { certificate: null, group: noGroup }

  // A fresh certificate needs a usable tracking number (a revision keeps the
  // number it already has, so only the no-certificate case is checked).
  const { data: existingCert } = await (db as any)
    .from('certificates')
    .select('id')
    .eq('sample_id', sampleId)
    .maybeSingle()
  if (!existingCert && (!trackingNumber || trackingNumber === 'null' || trackingNumber === '')) {
    console.error('Cannot create certificate: invalid tracking_number for sample', sampleId, trackingNumber)
    throw new InvalidTrackingNumberError(
      'Cannot generate certificate - sample has invalid tracking number',
      'Please contact an administrator to fix the sample tracking number.',
    )
  }

  const group = await mintGroupCertificates(db as any, sampleId, {
    issuedBy: actorUserId,
    isRejected,
    validFrom,
    validUntil,
    violations,
  })

  return { certificate: group.certificates[sampleId] ?? null, group }
}

export interface CloseSessionInput {
  /** cupping_sessions row as read before this call (`select('*')`). */
  session: {
    id: string
    sample_ids: string[]
    master_cupper_id: string | null
    laboratory_id: string | null
  }
  sampleId: string
  /**
   * The request body's `validated_by_cupper_id` — falls in as the
   * authoritative/master cupper only when the session has none designated.
   */
  validatedByCupperId: string | null
  /** Acting user (auth.users id) — recorded as cupping_audit_log.performed_by. */
  actorId: string
  decision: FinalizeDecision
  /** Free-text finalize note, stamped on the audit-trail entry verbatim. */
  notes: string | null
  /**
   * `certificate.certificate_number` from `mintCertificates`, if one was
   * minted. Left undefined (not null) when nothing was minted, matching
   * `certificate?.certificate_number` on a null certificate in the inline code.
   */
  certificateNumber?: string | null
  /**
   * Compliance violations, stamped on the audit-trail entry. Defaults to `[]`,
   * matching the route's own `complianceResult` default before grading data
   * exists (the 'pending' decision path).
   */
  violations?: string[]
  /** Whether the decision came from a manual override rather than auto-determination. Defaults to false. */
  isManualDecision?: boolean
}

/**
 * Closes out a finalize call — protocol-agnostic, shared with the CVA route:
 *
 * 1. Checks whether every OTHER sample in the session already reached
 *    'certified' or 'rejected' (this sample's own outcome is not re-checked
 *    here — it never was in the inline code either; see finalize-pipeline.test.ts
 *    for the case this preserves).
 * 2. Backfills the session's master cupper from whoever validated this sample,
 *    but ONLY when no master cupper was already designated. This is not
 *    bookkeeping: certificate-data.ts reads the master cupper's resolved
 *    defects as authoritative when rendering a certificate, so getting this
 *    wrong — or skipping it — changes what a certificate prints.
 * 3. Marks the session 'completed' once every sample has resolved.
 * 4. Writes the cupping_audit_log entry.
 * 5. Invalidates the cached certificate PDF — AWAITED. Returning before this
 *    clears would let the client's immediate certificate fetch race the
 *    invalidation and receive the pre-finalize PDF.
 *
 * Returns whether the session closed so the route can echo it as
 * `session_completed` in its response — the one piece of this phase a caller
 * still needs back.
 */
export async function closeSessionIfComplete(
  db: SupabaseClient,
  args: CloseSessionInput,
): Promise<{ allFinalized: boolean }> {
  const { session, sampleId, validatedByCupperId, actorId, decision, notes } = args
  const violations = args.violations ?? []
  const isManualDecision = args.isManualDecision ?? false

  // Same fallback the route resolves before this phase runs: an explicit
  // master cupper wins; otherwise whoever validated this sample stands in.
  const authoritativeCupperId: string | null = session.master_cupper_id || validatedByCupperId || null

  // Check if all samples in session are finalized
  const remainingSamples = session.sample_ids.filter((id: string) => id !== sampleId)
  let allFinalized = true

  if (remainingSamples.length > 0) {
    const { data: otherSamples } = await (db as any)
      .from('samples')
      .select('id, workflow_stage')
      .in('id', remainingSamples)

    allFinalized = otherSamples?.every(
      (s: any) => s.workflow_stage === 'certified' || s.workflow_stage === 'rejected'
    ) || false
  }

  // If no master cupper was designated, set the validating cupper as master
  // so that certificate-data.ts reads their resolved defects as authoritative
  if (!session.master_cupper_id && authoritativeCupperId) {
    await (db as any)
      .from('cupping_sessions')
      .update({ master_cupper_id: authoritativeCupperId, updated_at: new Date().toISOString() })
      .eq('id', session.id)
  }

  // Update session status if all samples are finalized.
  //
  // The timestamp column is `finalized_at` (paired with `finalized_by`), NOT
  // `completed_at` — cupping_sessions has never had a `completed_at`. Writing
  // it made every one of these updates fail with 42703 ("column does not
  // exist"), and because the error below is only logged and never thrown, the
  // failure was invisible: the sample still certified and the certificate
  // still minted, so nothing downstream looked wrong. The result was that no
  // session ever closed — 149 sessions sat at 'active' with zero 'completed'
  // in the whole table — and finalized sessions never left the cupper's queue
  // (api/cupping/my-samples lists status in ['active','review']).
  //
  // Present since the original finalize workflow (48310ce, 2025-12-03) and
  // carried verbatim through the pipeline extraction. The unit tests missed it
  // because the fake Supabase client accepts any column name; the regression
  // test beside them now pins the column set to what the table really has.
  if (allFinalized) {
    const { error: sessionUpdateError } = await (db as any)
      .from('cupping_sessions')
      .update({
        status: 'completed',
        finalized_at: new Date().toISOString(),
        finalized_by: actorId,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id)

    if (sessionUpdateError) {
      console.error('Error updating session status:', sessionUpdateError)
    }
  }

  // Log to audit trail
  try {
    await (db as any)
      .from('cupping_audit_log')
      .insert({
        session_id: session.id,
        sample_id: sampleId,
        action: 'finalized',
        performed_by: actorId,
        details: {
          decision,
          notes,
          certificate_number: args.certificateNumber,
          violations,
          auto_determined: !isManualDecision,
          manual_decision: isManualDecision,
          finalized_at: new Date().toISOString()
        },
        laboratory_id: session.laboratory_id
      })
  } catch (auditError) {
    console.error('Error logging audit:', auditError)
  }

  // Invalidate cached certificate PDF since finalization changes certificate data.
  // Awaited so the response doesn't return before the cache is cleared — otherwise the
  // client's immediate cert fetch can race the invalidation and get the pre-finalize PDF.
  try {
    await invalidateCertificatePdf(db, sampleId)
  } catch (invalidationError) {
    console.error('[finalize] Failed to invalidate certificate PDF:', invalidationError)
  }

  return { allFinalized }
}
