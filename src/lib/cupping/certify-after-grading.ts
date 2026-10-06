import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { evaluateQualityCompliance } from '@/lib/compliance'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { applyDecisionToGroup, mintGroupCertificates } from '@/lib/cupping/certificate-mint'
import { isGradingFinalized } from '@/lib/cupping/awaiting-grading'

export interface CertifiedAfterGrading {
  id: string
  certificate_number: string | null
  decision: 'approved' | 'rejected'
  violations: string[]
}

/**
 * Certify a lot whose cupping was finalized first, once its grading is
 * FINALIZED. Runs compliance against the lab unit's data, applies the decision
 * to the whole contract group and mints one certificate per member. Returns
 * this sample's certificate, or null when the lot is not ready (or something
 * failed, which is logged).
 *
 * Both halves are checked here, not trusted from the caller:
 *   - the cup: a commodity score row, or for a SPECIALTY lot (which has none)
 *     a recorded CVA pass on quality_assessments.cva_passed — null means the
 *     cup was never judged, and false was already rejected at Certify;
 *   - the grading: quality_assessments.grading_finalized_at. Saved
 *     green_bean_data is work in progress. SAK-011933/26 was certified on a
 *     screen-size-only save (2026-10-05) because a save counted as done.
 *
 * `db` must be a service-role client: the decision is written to the whole
 * group and to the sys shipment_samples row.
 */
export async function certifyAfterGrading(
  db: any,
  {
    sampleId,
    labId,
    sample,
    userId,
  }: {
    sampleId: string
    labId: string
    sample: { tracking_number: string | null; quality_spec_id: string | null }
    userId: string
  },
): Promise<CertifiedAfterGrading | null> {
  try {
    const { data: assessment } = await db
      .from('quality_assessments')
      .select('cva_passed, grading_finalized_at')
      .eq('sample_id', labId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!isGradingFinalized(assessment)) {
      return null // Grading saved but not finalized: nothing is decided yet
    }

    // COMMODITY cupping scores (cupping was finalized). A CVA row is not a
    // commodity assessment and must not stand in for one here.
    const { data: cuppingScores } = await excludeCvaScores(
      db.from('cupping_scores').select('id').eq('sample_id', labId),
    ).limit(1)

    const commodityCupped = !!cuppingScores && cuppingScores.length > 0
    if (!commodityCupped && (assessment as { cva_passed?: boolean | null } | null)?.cva_passed !== true) {
      return null // Cupping not done yet (or a specialty cup not judged / already rejected)
    }

    // A lab unit that already has a certificate was decided: nothing to do.
    const { data: existingCert } = await db
      .from('certificates')
      .select('id')
      .eq('sample_id', labId)
      .maybeSingle()
    if (existingCert) return null

    // The assigned cuppers scope COMMODITY score rows inside the evaluation, so
    // a specialty lot passes none: it has no such rows, and its cup verdict is
    // already settled above.
    let assignedCupperIds: string[] = []
    if (commodityCupped) {
      const { data: session } = await excludeCvaSessions(
        db
          .from('cupping_sessions')
          .select('cupper_ids')
          .contains('sample_ids', [labId])
          .in('status', ['setup', 'active', 'review', 'completed']),
      )
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      assignedCupperIds = (session?.cupper_ids as string[]) || []
    }

    const complianceResult = await evaluateQualityCompliance(
      db,
      labId,
      sample.quality_spec_id,
      assignedCupperIds,
    )

    const decision: 'approved' | 'rejected' = complianceResult.approved ? 'approved' : 'rejected'
    const isRejected = decision === 'rejected'

    // Decide the whole group — siblings never diverge from their lab unit.
    const { error: sampleUpdateError } = await applyDecisionToGroup(db, labId, {
      status: decision,
      workflow_stage: isRejected ? 'rejected' : 'certified',
      // This is THE path a re-graded lot takes: an ordinary decision clears the
      // tolerance flag, so an earlier approve-with-comments stops overriding the
      // buyer's numbers once the lot genuinely measures in spec.
      approved_with_comments: false,
    })
    if (sampleUpdateError) {
      console.error('[CertifyAfterGrading] Sample update failed:', sampleUpdateError)
      return null
    }

    // Push the decision to the shared sys shipment_samples row immediately.
    await writeDecisionToShipmentSamples(db, labId, userId)

    if (!sample.tracking_number || sample.tracking_number === 'null' || sample.tracking_number === '') {
      console.error('[CertifyAfterGrading] Invalid tracking_number for sample', sampleId)
      return null
    }

    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    // One certificate per member, lab unit first, each issued to its own
    // client. Numbers come from the assign_certificate_number trigger.
    const group = await mintGroupCertificates(db, labId, {
      issuedBy: userId,
      isRejected,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      violations: complianceResult.violations,
    })
    if (group.failed.length > 0) {
      console.error('[CertifyAfterGrading] Certificate creation failed:', group.failed)
    }
    const newCert = group.certificates[sampleId] ?? group.certificates[labId]
    if (!newCert) return null

    return {
      id: newCert.id,
      certificate_number: newCert.certificate_number,
      decision,
      violations: complianceResult.violations,
    }
  } catch (error) {
    console.error('[CertifyAfterGrading] Error:', error)
    return null
  }
}
