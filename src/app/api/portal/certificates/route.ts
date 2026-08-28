// src/app/api/portal/certificates/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import { mapCertRow } from '@/lib/portal/portal-certificates'

export async function GET() {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company } = gate

  // Every certificate is a plain sample's certificate — a contract sibling's
  // included, since it is that client's coffee like any other.
  const { data } = await (supabase as any)
    .from('certificates')
    .select('id, certificate_number, is_rejected, created_at, sample:samples!inner(tracking_number, client_id, end_client_id, deleted_at)')
    .order('created_at', { ascending: false })
    .limit(500)

  // JS-filter: scope to this company's samples and exclude soft-deleted parent samples
  const rows = (data ?? []).filter((c: any) =>
    c.sample &&
    c.sample.deleted_at == null &&
    (c.sample.client_id === company.clientId || c.sample.end_client_id === company.clientId)
  )

  return NextResponse.json({ certificates: rows.map(mapCertRow) })
}
