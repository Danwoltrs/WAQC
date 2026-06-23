import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import { buildStatusRollup } from '@/lib/portal/portal-overview'

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
    .select('id, tracking_number, origin, status, updated_at')
    .or(scope)
    .is('deleted_at', null)
    .in('status', ['approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(8)

  return NextResponse.json({ rollup: buildStatusRollup(rows ?? []), recent: recent ?? [] })
}
