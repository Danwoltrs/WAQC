/**
 * The parts of finalizing a cupping that do not depend on which protocol was
 * cupped. Both POST /api/cupping/finalize and POST /api/cupping/cva/finalize
 * call these, so the stage machine, the sys write-back, the certificate mint,
 * the session close (with its master-cupper backfill and audit-trail entry)
 * and the certificate-PDF cache invalidation all exist exactly once.
 *
 * Extracted verbatim from the commodity route. If you change behaviour here you
 * are changing it for every lot Wolthers certifies — commodity and specialty.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'

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
  // A failed write here must stop finalization rather than let the route carry
  // on as if the sample had actually moved — surfaced by throwing so the
  // route's existing top-level try/catch turns it into the same 500 the
  // original inline `return NextResponse.json(..., { status: 500 })` produced.
  if (currentWorkflowStage === 'analysis' || currentWorkflowStage === 'cupping') {
    const { error } = await (db as any)
      .from('samples')
      .update({ workflow_stage: 'review', updated_at: new Date().toISOString() })
      .eq('id', sampleId)
    if (error) {
      console.error('Error transitioning to review:', error)
      throw new Error(`Failed to transition sample to review stage: ${error.message}`)
    }
  }

  if (decision === 'pending') return

  const workflowStage = decision === 'approved' ? 'certified' : 'rejected'
  const { error: updateError } = await (db as any)
    .from('samples')
    .update({ workflow_stage: workflowStage, status: decision, updated_at: new Date().toISOString() })
    .eq('id', sampleId)
  if (updateError) {
    console.error('Error updating sample:', updateError)
    throw new Error(`Failed to update sample status: ${updateError.message}`)
  }

  if (decision === 'approved' && sellerComment) {
    // Guarded so a not-yet-applied migration never fails finalization. Left as
    // swallow-and-continue deliberately — unlike the two updates above, a
    // missing seller_comment column must not block certifying the lot.
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

/**
 * A certificate row as the mint hands it back. Which columns are present
 * depends on which branch produced it — a fresh insert and a re-certification
 * both select `created_at`, while the "update failed, keep what we read"
 * fallback carries `revision_number`/`approved` instead. Left open so the route
 * can put the row straight into its response body, exactly as the inline code
 * did.
 */
export type MintedCertificate = {
  id: string
  certificate_number: string | null
} & Record<string, unknown>

export interface MintCertificatesInput {
  sample: {
    id: string
    /** companies.id of the QC client — names the certificate's issued_to. */
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
 * Mints the mother certificate for a sample plus one per sub-contract
 * (container/buyer split), and resolves the per-client validity window.
 *
 * Certificate numbers are NEVER generated here. The row is inserted with
 * certificate_number null and the assign_certificate_number trigger fills it
 * from the sample's (or the sub-contract's) tracking number. Numbers are unique
 * per client, not globally.
 *
 * Re-finalizing a sample that already has a certificate must not mint a second
 * number: that path revises the existing row in place and keeps its number.
 */
export async function mintCertificates(
  db: SupabaseClient,
  { sample, decision, trackingNumber, isRejected, violations, actorUserId }: MintCertificatesInput,
): Promise<{ certificate: MintedCertificate | null }> {
  const sampleId = sample.id
  let certificate: MintedCertificate | null = null

  // Certificate validity window is per-client:
  // qc_client_settings.certificate_validity_months. NULL/0 → no expiry
  // window is printed on the certificate (the "Certificate validity period"
  // toggle is off for that client).
  // Read before the skips below, exactly as the inline code did — it is a
  // side-effect-free SELECT, so the pending/Other-Sample paths pay for one
  // wasted read rather than risk a behaviour change here.
  const validFrom = new Date()
  let validUntil: Date | null = null
  {
    const { data: vSettings } = await (db as any)
      .from('qc_client_settings')
      .select('certificate_validity_months')
      .eq('company_id', sample.client_id)
      .maybeSingle()
    const months = vSettings?.certificate_validity_months
    if (typeof months === 'number' && months > 0) {
      validUntil = new Date(validFrom)
      validUntil.setMonth(validUntil.getMonth() + months)
    }
  }

  // Other Samples don't generate Wolthers certificates — clients approve them
  // individually via the sample_recipients flow.
  const skipCertificate = sample.sample_category === 'other'

  // Create certificate only if both cupping AND grading are complete. The
  // commodity route sets `decision = 'pending'` exactly when grading data is
  // missing and always sets 'approved'/'rejected' when it is present, so
  // `decision !== 'pending'` is that route's `hasGradingData` verbatim.
  const hasDecision = decision !== 'pending'

  if (hasDecision && !skipCertificate) {
    // Check if certificate already exists
    const { data: existingCert } = await (db as any)
      .from('certificates')
      .select('id, certificate_number, is_rejected, compliance_violations, revision_number, approved')
      .eq('sample_id', sampleId)
      .is('sample_contract_id', null)
      .single()

    if (!existingCert) {
      // Validate tracking number before creating certificate
      if (!trackingNumber || trackingNumber === 'null' || trackingNumber === '') {
        console.error('Cannot create certificate: invalid tracking_number for sample', sampleId, trackingNumber)
        throw new InvalidTrackingNumberError(
          'Cannot generate certificate - sample has invalid tracking number',
          'Please contact an administrator to fix the sample tracking number.',
        )
      }

      // Get client info for issued_to (now companies)
      const { data: client } = await (db as any)
        .from('companies')
        .select('name, fantasy_name')
        .eq('id', sample.client_id)
        .single()

      const issuedTo = client?.fantasy_name || client?.name || 'Unknown Client'

      // Create certificate with compliance info
      const { data: newCert, error: certError } = await (db as any)
        .from('certificates')
        .insert({
          sample_id: sampleId,
          certificate_number: null as unknown as string,
          issued_to: issuedTo,
          issued_by: actorUserId,
          status: 'issued',
          valid_from: validFrom.toISOString(),
          valid_until: validUntil ? validUntil.toISOString() : null,
          is_rejected: isRejected,
          compliance_violations: violations.length > 0 ? violations : null,
        })
        .select('id, certificate_number, created_at, is_rejected, compliance_violations')
        .single()

      if (certError) {
        console.error('Error creating certificate:', certError)
        // Don't fail the entire request, just log the error
      } else {
        certificate = newCert
      }
    } else {
      // Re-certification: certificate already exists — track what changed
      const previousIsRejected = existingCert.is_rejected ?? false
      const previousViolations = (existingCert.compliance_violations as string[] | null) || []
      const newIsRejected = isRejected
      const newViolations = violations

      // Build human-readable changes description
      const changes: string[] = []
      if (previousIsRejected !== newIsRejected) {
        changes.push(
          previousIsRejected
            ? 'Decision changed from REJECTED to APPROVED'
            : 'Decision changed from APPROVED to REJECTED'
        )
      }
      // Compare violations
      const addedViolations = newViolations.filter(v => !previousViolations.includes(v))
      const removedViolations = previousViolations.filter(v => !newViolations.includes(v))
      if (addedViolations.length > 0) {
        changes.push(`New violations: ${addedViolations.join('; ')}`)
      }
      if (removedViolations.length > 0) {
        changes.push(`Resolved violations: ${removedViolations.join('; ')}`)
      }
      if (changes.length === 0) {
        changes.push('Re-certified with no changes to decision or violations')
      }

      const changesDescription = changes.join('. ')
      const newRevisionNumber = (existingCert.revision_number ?? 0) + 1

      // Save version history before updating
      await (db as any)
        .from('certificate_versions')
        .insert({
          certificate_id: existingCert.id,
          version_number: existingCert.revision_number ?? 0,
          changes_description: changesDescription,
          created_by: actorUserId,
        })

      // Update existing certificate — keep the already-assigned certificate number
      // Clear pdf_url so the download route regenerates the PDF with current data
      const { data: updatedCert, error: updateCertError } = await (db as any)
        .from('certificates')
        .update({
          is_rejected: newIsRejected,
          approved: !newIsRejected,
          compliance_violations: newViolations.length > 0 ? newViolations : null,
          revision_number: newRevisionNumber,
          override_comment: `Re-certified (rev ${newRevisionNumber}): ${changesDescription}`,
          pdf_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCert.id)
        .select('id, certificate_number, created_at, is_rejected, compliance_violations')
        .single()

      if (!updateCertError) {
        certificate = updatedCert
      } else {
        certificate = existingCert
      }
    }
  }

  // Create certificates for sub-contracts (if any exist)
  if (hasDecision && certificate) {
    try {
      const { data: subContracts } = await (db as any)
        .from('sample_contracts')
        .select('id, tracking_number, client_id')
        .eq('sample_id', sampleId)
        .order('sort_order', { ascending: true })

      if (subContracts && subContracts.length > 0) {
        // Get mother's client name for fallback (now from companies)
        const { data: motherClient } = await (db as any)
          .from('companies')
          .select('fantasy_name, name')
          .eq('id', sample.client_id)
          .single()
        const motherIssuedTo = motherClient?.fantasy_name || motherClient?.name || 'Unknown Client'

        for (const sc of subContracts) {
          // Check if sub-contract certificate already exists
          const { data: existingSubCert } = await (db as any)
            .from('certificates')
            .select('id')
            .eq('sample_contract_id', sc.id)
            .maybeSingle()

          if (!existingSubCert) {
            // Get sub-contract's QC client name (or fall back to mother's)
            let subIssuedTo = motherIssuedTo
            if (sc.client_id && sc.client_id !== sample.client_id) {
              const { data: subClient } = await (db as any)
                .from('companies')
                .select('fantasy_name, name')
                .eq('id', sc.client_id)
                .single()
              if (subClient) {
                subIssuedTo = subClient.fantasy_name || subClient.name || subIssuedTo
              }
            }

            // The error MUST be inspected: supabase-js resolves rather than
            // throws, so the surrounding try/catch never sees it. The number
            // is minted by the assign_certificate_number trigger, which
            // RAISES when the sample has no laboratory_id (unlike the
            // mother's, which just reuses tracking_number) — that failure was
            // swallowed here, leaving the split with no certificate and no
            // number to print on the tin sleeve.
            const { error: subCertError } = await (db as any)
              .from('certificates')
              .insert({
                sample_id: sampleId,
                sample_contract_id: sc.id,
                certificate_number: null as unknown as string,
                issued_to: subIssuedTo,
                issued_by: actorUserId,
                status: 'issued',
                valid_from: validFrom.toISOString(),
                valid_until: validUntil ? validUntil.toISOString() : null,
                is_rejected: isRejected,
                compliance_violations: violations.length > 0 ? violations : null,
              })

            if (subCertError) {
              console.error(
                `Failed to create certificate for sub-contract ${sc.id} of sample ${sampleId}:`,
                subCertError.message || subCertError,
                subCertError.details || '',
                subCertError.hint || '',
              )
            }
          }
        }
      }
    } catch (subContractCertError) {
      console.error('Error creating sub-contract certificates:', subContractCertError)
      // Non-fatal: mother certificate was already created
    }
  }

  return { certificate }
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

  // Update session status if all samples are finalized
  if (allFinalized) {
    const { error: sessionUpdateError } = await (db as any)
      .from('cupping_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
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
