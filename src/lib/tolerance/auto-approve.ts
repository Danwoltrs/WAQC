import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateSampleCompliance } from '@/lib/compliance'
import { evaluateTolerance } from '@/lib/tolerance/evaluate'
import { computeIssuedValuesForSample } from '@/lib/tolerance/sample-limits'
import { buildDecision } from '@/lib/tolerance/decision-row'
import { prefillComments } from '@/lib/tolerance/comments'
import { groupSampleIds } from '@/lib/sample-group'
import { applyDecision, mintCertificates, type MintedCertificate } from '@/lib/cupping/finalize-pipeline'
import { sendSellerNoticeNow, type SellerNoticeOutcome } from '@/lib/approval-notification/tolerance-seller-send'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'

export type ToleranceOutcome =
  | { kind: 'not_applicable' }
  | { kind: 'approved'; groupIds: string[]; certificate: MintedCertificate | null; sellerEmail: SellerNoticeOutcome }
  | { kind: 'failed'; error: string }

export interface ApproveWithinToleranceInput {
  labId: string
  qualitySpecId: string | null
  clientId: string | null
  sampleCategory: string | null
  trackingNumber: string | null
  currentWorkflowStage: string | null
  assignedCupperIds: string[]
  userId: string
}

const FAILED_TEXT =
  'The lot is inside the 5% tolerance but could not be approved. Nothing was decided and it stays in Review. Finalize again to retry.'

interface CertSnapshotRow {
  id: string
  is_rejected: boolean | null
  approved: boolean | null
  compliance_violations: string[] | null
  revision_number: number | null
}

/** True only when there is at least one client, none is missing, and every one has opted in. */
export function everyClientOptedIn(clientIds: Array<string | null>, optedIn: ReadonlySet<string>): boolean {
  if (clientIds.length === 0) return false
  return clientIds.every((id) => id !== null && optedIn.has(id))
}

/**
 * Approves a lot that would be rejected, with comments, when it is inside the
 * 5% tolerance and every client on the lot has switched the rule on.
 *
 * Write order matters: the audit row goes first (inert until the flag is set),
 * the certificates next, and status, stage and the flag land together in ONE
 * write. The lot is therefore never approved without its flag, and a failure
 * anywhere before that write leaves it in Review with nothing decided: undo
 * releases the certificate numbers it created, restores the certificates that
 * existed before, and removes the audit row. Once the decision write has
 * landed nothing is undone.
 */
export async function approveWithinTolerance(
  db: SupabaseClient<any>,
  input: ApproveWithinToleranceInput,
): Promise<ToleranceOutcome> {
  let auditId: string | null = null
  let walked = false
  let groupIds: string[] = []
  let snapshot: Map<string, CertSnapshotRow> | null = null
  let decided = false

  const undoCertificates = async () => {
    if (!snapshot) return // minting never started
    const { data: current, error: readError } = await db.from('certificates').select('id').in('sample_id', groupIds)
    if (readError) {
      console.error('[tolerance-auto-approve] UNDO could not read certificates; manual cleanup suggested', readError)
      return
    }
    for (const row of (current ?? []) as Array<{ id: string }>) {
      const before = snapshot.get(row.id)
      if (before) {
        const { error } = await db
          .from('certificates')
          .update({
            is_rejected: before.is_rejected,
            approved: before.approved,
            compliance_violations: before.compliance_violations,
            revision_number: before.revision_number,
          })
          .eq('id', row.id)
        if (error) console.error('[tolerance-auto-approve] RESTORE of certificate FAILED', row.id, error)
        continue
      }
      // New in this attempt: hand its number back to the pool, then remove it.
      const { error: voidError } = await db.rpc('void_certificate', { p_certificate_id: row.id })
      if (voidError) {
        console.error('[tolerance-auto-approve] void_certificate FAILED; deleting anyway so a retry is possible', row.id, voidError)
      }
      const { error: delError } = await db.from('certificates').delete().eq('id', row.id)
      if (delError) console.error('[tolerance-auto-approve] COMPENSATING DELETE of certificate FAILED', row.id, delError)
    }
  }

  const undo = async () => {
    try {
      await undoCertificates()
      if (auditId) {
        const { error } = await db.from('sample_tolerance_approvals').delete().eq('id', auditId)
        if (error) console.error('[tolerance-auto-approve] COMPENSATING DELETE of audit row FAILED', auditId, error)
      }
    } catch (undoError) {
      console.error('[tolerance-auto-approve] undo threw', undoError)
    }
  }

  const walkToReview = async () => {
    await applyDecision(db, {
      sampleId: input.labId,
      decision: 'pending',
      currentWorkflowStage: input.currentWorkflowStage,
      actorUserId: input.userId,
      sellerComment: null,
    })
  }

  /** Every failure: undo, then make sure the lot ends in Review. */
  const fail = async (): Promise<ToleranceOutcome> => {
    await undo()
    if (!walked) {
      try {
        await walkToReview()
      } catch (walkError) {
        console.error('[tolerance-auto-approve] could not walk the lot to Review after a failure', walkError)
      }
    }
    return { kind: 'failed', error: FAILED_TEXT }
  }

  try {
    if (input.sampleCategory === 'other') return { kind: 'not_applicable' }

    groupIds = await groupSampleIds(db, input.labId)

    const { data: members, error: membersError } = await db.from('samples').select('id, client_id').in('id', groupIds)
    if (membersError) {
      console.error('[tolerance-auto-approve] reading clients', membersError)
      return await fail()
    }
    const clientIds: Array<string | null> = ((members ?? []) as Array<{ client_id: string | null }>).map(
      (m) => m.client_id ?? null,
    )
    const realIds = [...new Set(clientIds.filter((c): c is string => !!c))]
    const optedIn = new Set<string>()
    if (realIds.length > 0) {
      const { data: settings, error: settingsError } = await db
        .from('qc_client_settings')
        .select('company_id')
        .in('company_id', realIds)
        .eq('tolerance_auto_approve', true)
      if (settingsError) {
        console.error('[tolerance-auto-approve] reading client settings', settingsError)
        return await fail()
      }
      for (const s of (settings ?? []) as Array<{ company_id: string }>) optedIn.add(s.company_id)
    }
    if (!everyClientOptedIn(clientIds, optedIn)) return { kind: 'not_applicable' }

    const criteria = await evaluateSampleCompliance(db as any, input.labId, input.qualitySpecId, input.assignedCupperIds)
    const assessment = evaluateTolerance(criteria)
    if (!assessment.offered) return { kind: 'not_applicable' }

    const issuedResult = await computeIssuedValuesForSample(db, input.labId, input.qualitySpecId)
    if (!issuedResult.ok) return { kind: 'not_applicable' }

    const decision = buildDecision({
      items: assessment.items,
      issued: issuedResult.issued,
      comments: prefillComments(assessment.items),
      requestAdditionalSample: true,
      userId: input.userId,
    })
    const { data: inserted, error: insertError } = await db
      .from('sample_tolerance_approvals')
      .insert({ sample_id: input.labId, ...decision })
      .select('id')
      .single()
    if (insertError || !inserted) {
      console.error('[tolerance-auto-approve] audit insert', insertError)
      return await fail()
    }
    auditId = (inserted as { id: string }).id

    // Walks the lot to Review and stops; the decision itself is one write below.
    await walkToReview()
    walked = true

    // How the group's certificates look now, so undo can put them back.
    const { data: existing, error: snapError } = await db
      .from('certificates')
      .select('id, is_rejected, approved, compliance_violations, revision_number')
      .in('sample_id', groupIds)
    if (snapError) {
      console.error('[tolerance-auto-approve] reading existing certificates', snapError)
      return await fail()
    }
    snapshot = new Map(((existing ?? []) as CertSnapshotRow[]).map((c) => [c.id, c]))

    const mint = await mintCertificates(db, {
      sample: { id: input.labId, client_id: input.clientId, sample_category: input.sampleCategory },
      decision: 'approved',
      trackingNumber: input.trackingNumber,
      isRejected: false,
      violations: [],
      actorUserId: input.userId,
    })
    if (mint.group.failed.length > 0) {
      console.error('[tolerance-auto-approve] certificates failed for', mint.group.failed)
      return await fail()
    }

    const { error: decideError } = await db
      .from('samples')
      .update({
        status: 'approved',
        workflow_stage: 'certified',
        approved_with_comments: true,
        updated_at: new Date().toISOString(),
      })
      .in('id', groupIds)
    if (decideError) {
      console.error('[tolerance-auto-approve] decision write', decideError)
      return await fail()
    }
    decided = true

    // The decision stands from here: nothing below may undo it.
    let sellerEmail: SellerNoticeOutcome = { sent: [], waiting: [] }
    try {
      await writeDecisionToShipmentSamples(db as any, input.labId, input.userId, null)
      const { data: profile } = await db
        .from('profiles')
        .select('full_name, email, email_signature_html')
        .eq('id', input.userId)
        .single()
      const senderEmail = (profile as any)?.email || undefined
      sellerEmail = await sendSellerNoticeNow(db, groupIds, {
        userId: input.userId,
        email: senderEmail,
        name: (profile as any)?.full_name || senderEmail || undefined,
        signatureHtml: (profile as any)?.email_signature_html ?? null,
      })
    } catch (afterError) {
      console.error('[tolerance-auto-approve] after the decision (write-back or seller notice) failed', afterError)
    }

    return { kind: 'approved', groupIds, certificate: mint.certificate, sellerEmail }
  } catch (error) {
    console.error('[tolerance-auto-approve] unhandled', error)
    if (decided) return { kind: 'failed', error: FAILED_TEXT } // unreachable by construction; never undo a landed decision
    return await fail()
  }
}
