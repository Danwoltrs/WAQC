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
 * anywhere before that write leaves it in Review with nothing decided.
 */
export async function approveWithinTolerance(
  db: SupabaseClient<any>,
  input: ApproveWithinToleranceInput,
): Promise<ToleranceOutcome> {
  let auditId: string | null = null
  let minted: string[] = []
  const undo = async () => {
    try {
      if (minted.length > 0) {
        const { error } = await db.from('certificates').delete().in('id', minted)
        if (error) console.error('[tolerance-auto-approve] COMPENSATING DELETE of certificates FAILED', minted, error)
      }
      if (auditId) {
        const { error } = await db.from('sample_tolerance_approvals').delete().eq('id', auditId)
        if (error) console.error('[tolerance-auto-approve] COMPENSATING DELETE of audit row FAILED', auditId, error)
      }
    } catch (undoError) {
      console.error('[tolerance-auto-approve] undo threw', undoError)
    }
  }

  try {
    if (input.sampleCategory === 'other') return { kind: 'not_applicable' }

    const groupIds = await groupSampleIds(db, input.labId)

    const { data: members, error: membersError } = await db.from('samples').select('id, client_id').in('id', groupIds)
    if (membersError) {
      console.error('[tolerance-auto-approve] reading clients', membersError)
      return { kind: 'failed', error: FAILED_TEXT }
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
        return { kind: 'failed', error: FAILED_TEXT }
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
      return { kind: 'failed', error: FAILED_TEXT }
    }
    auditId = (inserted as { id: string }).id

    // Walks the lot to Review and stops; the decision itself is one write below.
    await applyDecision(db, {
      sampleId: input.labId,
      decision: 'pending',
      currentWorkflowStage: input.currentWorkflowStage,
      actorUserId: input.userId,
      sellerComment: null,
    })

    const mint = await mintCertificates(db, {
      sample: { id: input.labId, client_id: input.clientId, sample_category: input.sampleCategory },
      decision: 'approved',
      trackingNumber: input.trackingNumber,
      isRejected: false,
      violations: [],
      actorUserId: input.userId,
    })
    minted = mint.group.minted
      .map((sampleId) => mint.group.certificates[sampleId]?.id)
      .filter((id): id is string => !!id)
    if (mint.group.failed.length > 0) {
      console.error('[tolerance-auto-approve] certificates failed for', mint.group.failed)
      await undo()
      return { kind: 'failed', error: FAILED_TEXT }
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
      await undo()
      return { kind: 'failed', error: FAILED_TEXT }
    }

    await writeDecisionToShipmentSamples(db as any, input.labId, input.userId, null)

    const { data: profile } = await db
      .from('profiles')
      .select('full_name, email, email_signature_html')
      .eq('id', input.userId)
      .single()
    const senderEmail = (profile as any)?.email || undefined
    const sellerEmail = await sendSellerNoticeNow(db, groupIds, {
      userId: input.userId,
      email: senderEmail,
      name: (profile as any)?.full_name || senderEmail || undefined,
      signatureHtml: (profile as any)?.email_signature_html ?? null,
    })

    return { kind: 'approved', groupIds, certificate: mint.certificate, sellerEmail }
  } catch (error) {
    console.error('[tolerance-auto-approve] unhandled', error)
    await undo()
    return { kind: 'failed', error: FAILED_TEXT }
  }
}
