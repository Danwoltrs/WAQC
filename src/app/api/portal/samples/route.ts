// src/app/api/portal/samples/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import { mapSampleRow } from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company } = gate

  const q = new URL(request.url).searchParams.get('q')?.trim()
  let query = (supabase as any)
    .from('samples')
    .select('id, tracking_number, origin, quality_name, sample_type, workflow_stage, status, wolthers_contract_nr')
    .or(`client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (q) query = query.ilike('tracking_number', `%${q}%`)

  const { data } = await query
  return NextResponse.json({ samples: (data ?? []).map(mapSampleRow) })
}
