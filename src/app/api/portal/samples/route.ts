// src/app/api/portal/samples/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import {
  mapSampleRow,
  portalSampleSearchFilter,
  PORTAL_SAMPLE_CERTIFICATES_EMBED,
  PORTAL_SAMPLE_REFERENCE_COLUMNS,
} from '@/lib/portal/portal-samples'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company } = gate

  const q = new URL(request.url).searchParams.get('q')?.trim()
  let query = (supabase as any)
    .from('samples')
    .select(`id, origin, quality_name, workflow_stage, status, ${PORTAL_SAMPLE_REFERENCE_COLUMNS}, ${PORTAL_SAMPLE_CERTIFICATES_EMBED}`)
    .or(`client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  // Container, ICO, sample number and contract numbers; a pasted SAN- number
  // still matches (tracking_number is in the filter) but is never returned.
  const search = q ? portalSampleSearchFilter(q) : null
  if (search) query = query.or(search)

  const { data } = await query
  return NextResponse.json({ samples: (data ?? []).map(mapSampleRow) })
}
