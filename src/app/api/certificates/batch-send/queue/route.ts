import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { resolvePanel, type ContactRow } from '@/lib/approval-notification/resolve-panels'
import {
  resolveSampleContractsBatch,
  computeSendStatus,
  buildBatchUnits,
  getInitials,
  type BatchSampleInput,
  type SendStatusRow,
} from '@/lib/approval-notification/batch-send'
import {
  fetchQualitySampleSummaries,
  groupQualitySamples,
  buildQualitySummaryText,
  buildQualitySummaryHtml,
  buildQualityCoverNote,
  buildQualitySummarySubject,
} from '@/lib/approval-notification/quality-summary'
import type { ApprovalDecision, ApprovalSide, PanelPrefill } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'
const PRIOR_SOURCES = new Set(['sample_approval', 'batch_approval'])

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

interface CertRow {
  id: string
  certificate_number: string | null
  is_rejected: boolean | null
  created_at: string | null
  sample_id: string | null
  sample: {
    id: string
    tracking_number: string | null
    container_nr: string | null
    sample_type: string | null
    wolthers_contract_nr: string | null
    contract_id: string | null
    status: string | null
  } | null
}

export async function GET(req: NextRequest) {
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(server as any, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const decisionsParam = sp.get('decisions')
  const wantDecisions = new Set<ApprovalDecision>(
    (decisionsParam ? decisionsParam.split(',') : ['approved', 'rejected'])
      .map((d) => d.trim())
      .filter((d): d is ApprovalDecision => d === 'approved' || d === 'rejected'),
  )
  // Explicit-selection mode: send a chosen set of samples to one side (buyer or
  // seller) regardless of date or prior-send status — used by the certificates
  // page "Send to buyer / Send to seller" buttons.
  const explicitIds = (sp.get('sampleIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const sideParam = sp.get('side')
  const onlySide: ApprovalSide | undefined =
    sideParam === 'buyer' || sideParam === 'seller' ? sideParam : undefined
  const explicitMode = explicitIds.length > 0

  const supabase = admin()

  // Mother certificates (one per sample) issued in the range (or the explicit set).
  let q = supabase
    .from('certificates')
    .select(
      `id, certificate_number, is_rejected, created_at, sample_id,
       sample:samples(id, tracking_number, container_nr, sample_type, wolthers_contract_nr, contract_id, status)`,
    )
    .eq('status', 'issued')
    .is('sample_contract_id', null)
  if (explicitMode) {
    q = q.in('sample_id', explicitIds)
  } else {
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to + 'T23:59:59')
  }

  const { data: certData, error } = await q
  if (error) {
    console.error('[batch-queue] certificates fetch failed:', error)
    return NextResponse.json({ error: 'Failed to load certificates' }, { status: 500 })
  }

  const certs = ((certData ?? []) as unknown as CertRow[]).filter((c) => c.sample)
  if (certs.length === 0) {
    return NextResponse.json({ units: [], skipped: { noContract: 0, noRecipients: 0 } })
  }

  // Resolve contracts in two IN-queries.
  const sampleKeys = certs.map((c) => ({
    id: c.sample!.id,
    contract_id: c.sample!.contract_id,
    wolthers_contract_nr: c.sample!.wolthers_contract_nr,
  }))
  const contexts = await resolveSampleContractsBatch(supabase, sampleKeys)

  // Companies and contacts for recipient resolution.
  const companyIds = new Set<string>()
  for (const ctx of contexts.values()) {
    if (ctx.buyerId) companyIds.add(ctx.buyerId)
    if (ctx.sellerId) companyIds.add(ctx.sellerId)
  }
  const companyNameById = new Map<string, string>()
  const panelsByCompany = new Map<string, PanelPrefill>()
  if (companyIds.size > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, fantasy_name')
      .in('id', [...companyIds])
    for (const c of (companies ?? []) as any[]) {
      companyNameById.set(c.id, c.fantasy_name ?? c.name ?? c.id)
    }
    const { data: contactRows } = await supabase
      .from('contacts')
      .select('company_id, email, name, nickname, role, is_primary, is_group, routing_purposes')
      .in('company_id', [...companyIds])
      .eq('is_active', true)
      .not('email', 'is', null)
    const rows: ContactRow[] = ((contactRows ?? []) as any[]).map((r) => ({
      company_id: r.company_id,
      email: r.email,
      name: r.name,
      nickname: r.nickname ?? null,
      role: r.role,
      is_primary: r.is_primary,
      is_group_mailbox: r.is_group ?? null,
      routing_purposes: r.routing_purposes ?? null,
    }))
    for (const companyId of companyIds) {
      panelsByCompany.set(
        companyId,
        resolvePanel(rows, companyId, companyNameById.get(companyId) ?? null, QC_MAILBOX),
      )
    }
  }

  // Most-recent rejection reasons per sample (only surfaced for rejected lines).
  const sampleIds = certs.map((c) => c.sample!.id)
  const reasonBySample = new Map<string, string | null>()
  const { data: qaRows } = await supabase
    .from('quality_assessments')
    .select('sample_id, cupping_comments, grading_comments, created_at')
    .in('sample_id', sampleIds)
    .order('created_at', { ascending: false })
  for (const r of (qaRows ?? []) as any[]) {
    if (reasonBySample.has(r.sample_id)) continue // first = most recent
    const reason = [r.cupping_comments, r.grading_comments].filter((x) => x && String(x).trim()).join('\n') || null
    reasonBySample.set(r.sample_id, reason)
  }

  // Prior sends (single-sample or batch) → drop already-sent (sample, side) pairs.
  const contractIds = [...new Set([...contexts.values()].map((c) => c.contractId))]
  const required = new Map<string, { buyer: boolean; seller: boolean }>()
  for (const [sid, ctx] of contexts) required.set(sid, { buyer: !!ctx.buyerId, seller: !!ctx.sellerId })
  const statusRows: SendStatusRow[] = []
  if (contractIds.length > 0) {
    const { data: msgs } = await supabase
      .from('email_messages')
      .select('sent_by, sent_at, metadata, status')
      .in('contract_id', contractIds)
      .eq('status', 'sent')
    const sentByIds = new Set<string>()
    const relevant = ((msgs ?? []) as any[]).filter((m) => {
      const meta = m.metadata ?? {}
      return (
        PRIOR_SOURCES.has(meta.source) &&
        sampleIds.includes(meta.sample_id) &&
        (meta.side === 'buyer' || meta.side === 'seller')
      )
    })
    for (const m of relevant) if (m.sent_by) sentByIds.add(m.sent_by)
    const nameById = new Map<string, string>()
    if (sentByIds.size > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', [...sentByIds])
      for (const p of (profs ?? []) as any[]) nameById.set(p.id, p.full_name ?? '')
    }
    for (const m of relevant) {
      statusRows.push({
        sampleId: m.metadata.sample_id,
        side: m.metadata.side,
        sentBy: m.sent_by ? nameById.get(m.sent_by) ?? null : null,
        sentAt: m.sent_at ?? null,
      })
    }
  }
  const sendStatus = computeSendStatus(statusRows, required)

  // Assemble batch inputs.
  let noContract = 0
  const inputs: BatchSampleInput[] = []
  for (const c of certs) {
    const sample = c.sample!
    const ctx = contexts.get(sample.id)
    if (!ctx) {
      noContract++
      continue
    }
    const decision: ApprovalDecision = c.is_rejected ? 'rejected' : 'approved'
    if (!wantDecisions.has(decision)) continue
    inputs.push({
      sampleId: sample.id,
      buyerId: ctx.buyerId,
      sellerId: ctx.sellerId,
      buyerReference: ctx.buyerReference,
      sellerReference: ctx.sellerReference,
      date: c.created_at ?? null,
      line: {
        containerNr: sample.container_nr ?? null,
        certNumber: c.certificate_number ?? sample.tracking_number ?? null,
        contractNumber: ctx.contractNumber ?? sample.wolthers_contract_nr ?? null,
        decision,
        reason: reasonBySample.get(sample.id) ?? null,
      },
    })
  }

  const units = buildBatchUnits(inputs, sendStatus, panelsByCompany, companyNameById, {
    onlySide,
    includeAlreadySent: explicitMode,
  })

  // Attach the quality summary table to every unit. Both sides get the same
  // table (screen / defects / type / cup); buyers keep certs attached and group
  // by seller, sellers attach nothing and group by QC client. The unit body
  // becomes an editable cover note; the table is rebuilt authoritatively at send.
  if (units.length > 0) {
    const allSampleIds = [...new Set(units.flatMap((u) => u.samples.map((s) => s.sampleId)))]
    const summaries = await fetchQualitySampleSummaries(supabase, allSampleIds)
    for (const u of units) {
      const list = u.samples
        .map((s) => summaries.get(s.sampleId))
        .filter((s): s is NonNullable<typeof s> => !!s)
      if (list.length === 0) continue
      const attached = u.side === 'buyer'
      const groups = groupQualitySamples(list, u.side === 'seller' ? 'qcClient' : 'seller')
      u.body = buildQualityCoverNote(u.greeting, attached)
      u.subject = buildQualitySummarySubject(groups, attached)
      u.summaryText = buildQualitySummaryText(groups)
      u.summaryHtml = buildQualitySummaryHtml(groups)
      u.noAttachments = !attached
    }
  }

  // Samples in scope that produced no unit and aren't already fully sent → no recipients.
  const covered = new Set<string>()
  for (const u of units) for (const s of u.samples) covered.add(s.sampleId)
  let noRecipients = 0
  for (const inp of inputs) {
    if (covered.has(inp.sampleId)) continue
    if (sendStatus.get(inp.sampleId)?.full) continue
    noRecipients++
  }

  return NextResponse.json({
    units,
    skipped: { noContract, noRecipients },
    // Convenience for any caller that wants initials without re-deriving.
    senderInitials: getInitials(user.user_metadata?.full_name as string | undefined),
  })
}