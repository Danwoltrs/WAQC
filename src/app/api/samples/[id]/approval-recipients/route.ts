import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { resolvePanel, type ContactRow } from '@/lib/approval-notification/resolve-panels'
import { resolveSampleContract } from '@/lib/approval-notification/contract-resolver'
import type { ApprovalPrefill } from '@/lib/approval-notification/types'

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const server = await createServerClient()
  const {
    data: { user },
  } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await canUserManageSample(server as any, user.id, id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = admin()
  const { data: sample, error } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id, wolthers_contract_nr, sample_type')
    .eq('id', id)
    .single()
  if (error || !sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

  const s = sample as any
  const ctx = await resolveSampleContract(supabase, s)
  if (!ctx) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  if (s.status !== 'approved' && s.status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }

  // Most-recent cupping/grading comments for the body's Comments block.
  const { data: qa } = await supabase
    .from('quality_assessments')
    .select('cupping_comments, grading_comments')
    .eq('sample_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const comments =
    [ (qa as any)?.cupping_comments, (qa as any)?.grading_comments ]
      .filter((x) => x && String(x).trim())
      .join('\n') || null

  // Companies for team-name greeting fallback.
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, fantasy_name')
    .in('id', [ctx.buyerId, ctx.sellerId].filter(Boolean))
  const nameOf = (cid: string | null): string | null => {
    const co = (companies ?? []).find((x: any) => x.id === cid) as any
    return co ? co.fantasy_name ?? co.name ?? null : null
  }

  // DB column is `is_group`; remapped to is_group_mailbox to match ContactRow interface.
  const { data: contactRows } = await supabase
    .from('contacts')
    .select('company_id, email, name, nickname, role, is_primary, is_group, routing_purposes')
    .in('company_id', [ctx.buyerId, ctx.sellerId].filter(Boolean))
    .eq('is_active', true)
    .not('email', 'is', null)
  const rows: ContactRow[] = (contactRows ?? []).map((r) => ({
    company_id: r.company_id,
    email: r.email,
    name: r.name,
    nickname: (r as any).nickname ?? null,
    role: r.role,
    is_primary: r.is_primary,
    is_group_mailbox: (r as any).is_group ?? null,
    routing_purposes: (r as any).routing_purposes ?? null,
  }))

  // Matched shipment_samples row gives sample_code / AWB / courier for the body.
  const { data: ssRows } = await supabase
    .from('shipment_samples')
    .select('sample_code, tracking_number, courier_company, waqc_ref, sample_type, created_at')
    .eq('contract_id', ctx.contractId)
  const ss =
    (ssRows ?? []).find((r: any) => r.waqc_ref === s.tracking_number) ??
    (ssRows ?? [])
      .filter((r: any) => (r.sample_type ?? 'pss') === 'pss')
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0] ??
    null

  const { data: cert } = await supabase
    .from('certificates')
    .select('id')
    .eq('sample_id', id)
    .is('sample_contract_id', null)
    .limit(1)
    .maybeSingle()

  const payload: ApprovalPrefill = {
    sample: {
      trackingNumber: s.tracking_number,
      sampleType: s.sample_type ?? 'pss',
      status: s.status,
      contractNumber: ctx.contractNumber,
      sampleCode: (ss as any)?.sample_code ?? null,
      awb: (ss as any)?.tracking_number ?? null,
      courier: (ss as any)?.courier_company ?? null,
      sellerReference: ctx.sellerReference,
      buyerReference: ctx.buyerReference,
      comments,
    },
    panels: {
      seller: resolvePanel(rows, ctx.sellerId, nameOf(ctx.sellerId), QC_MAILBOX),
      buyer: resolvePanel(rows, ctx.buyerId, nameOf(ctx.buyerId), QC_MAILBOX),
    },
    certificateAvailable: !!cert,
    sellerId: ctx.sellerId,
    buyerId: ctx.buyerId,
  }
  return NextResponse.json(payload)
}
