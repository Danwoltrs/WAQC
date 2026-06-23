// src/app/api/portal/contracts/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requirePortalCompany } from '@/lib/portal/portal-auth'
import { groupSamplesByContract } from '@/lib/portal/portal-contracts'

export async function GET() {
  const supabase = await createClient()
  const gate = await requirePortalCompany(supabase)
  if ('error' in gate) return gate.error
  const { company } = gate

  const { data } = await (supabase as any)
    .from('samples')
    .select('wolthers_contract_nr, status, origin')
    .or(`client_id.eq.${company.clientId},end_client_id.eq.${company.clientId}`)
    .is('deleted_at', null)

  return NextResponse.json({ contracts: groupSamplesByContract(data ?? []) })
}
