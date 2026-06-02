import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { canUserManageSample } from '@/lib/auth/sample-access'
import { resolveApprovalRecipients } from '@/lib/approval-notification/recipients'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * GET /api/samples/[id]/approval-recipients
 * Prefill data for the approval composer. Returns 400 when the sample is not
 * contract-linked (the client uses this as the gate for whether to open).
 *
 * Authorization: must be an authenticated staff/QC user permitted to manage
 * the sample. We authenticate with the RLS-bound SSR client and gate on
 * canUserManageSample BEFORE touching the service-role client, so counterparty
 * contact PII is never returned to unauthorized callers.
 */
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
  if (!access.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = admin()

  const { data: sample, error } = await supabase
    .from('samples')
    .select(
      'id, tracking_number, status, contract_id, origin, quality_name, ' +
        'quality_assessment:quality_assessments(green_bean_data)',
    )
    .eq('id', id)
    .single()

  if (error || !sample) {
    return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
  }
  if (!(sample as any).contract_id) {
    return NextResponse.json(
      { error: 'Sample is not contract-linked' },
      { status: 400 },
    )
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('contract_number, buyer_id, seller_id')
    .eq('id', (sample as any).contract_id)
    .single()

  const { to, cc } = await resolveApprovalRecipients(
    supabase,
    (contract as any)?.buyer_id ?? null,
    (contract as any)?.seller_id ?? null,
  )

  const { data: cert } = await supabase
    .from('certificates')
    .select('id')
    .eq('sample_id', id)
    .is('sample_contract_id', null)
    .limit(1)
    .maybeSingle()

  const qa = Array.isArray((sample as any).quality_assessment)
    ? (sample as any).quality_assessment[0]
    : (sample as any).quality_assessment
  const cuppingScore = qa?.green_bean_data?.cupping_score ?? null

  return NextResponse.json({
    sample: {
      tracking_number: (sample as any).tracking_number,
      status: (sample as any).status,
      origin: (sample as any).origin,
      quality_name: (sample as any).quality_name,
      cupping_score: cuppingScore,
      contract_number: (contract as any)?.contract_number ?? null,
    },
    defaultTo: to,
    defaultCc: cc,
    certificateAvailable: !!cert,
  })
}
