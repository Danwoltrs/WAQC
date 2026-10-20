import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import { buildStatusRollup } from '@/lib/portal/portal-overview'
import {
  portalSampleLabel,
  PORTAL_SAMPLE_CERTIFICATES_EMBED,
  PORTAL_SAMPLE_REFERENCE_COLUMNS,
} from '@/lib/portal/portal-samples'

export async function GET() {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company } = gate

  const scope = `client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`

  const { data: rows } = await (supabase as any)
    .from('samples')
    .select('sample_type, status, workflow_stage')
    .or(scope)
    .is('deleted_at', null)

  const { data: recent } = await (supabase as any)
    .from('samples')
    .select(`id, origin, status, updated_at, ${PORTAL_SAMPLE_REFERENCE_COLUMNS}, ${PORTAL_SAMPLE_CERTIFICATES_EMBED}`)
    .or(scope)
    .is('deleted_at', null)
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(8)

  // Each decision is named by its certificate number, else the lot's own
  // reference — never the internal SAN- lab number.
  const recentRows = (recent ?? []).map((r: any) => ({
    id: r.id,
    reference: portalSampleLabel(r),
    origin: r.origin ?? null,
    status: r.status,
    updated_at: r.updated_at ?? null,
  }))

  return NextResponse.json({ rollup: buildStatusRollup(rows ?? []), recent: recentRows })
}
