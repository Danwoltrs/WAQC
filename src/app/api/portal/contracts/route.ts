// src/app/api/portal/contracts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { groupSamplesByContract } from '@/lib/portal/portal-contracts'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_samples' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx
  const { data, error } = await admin
    .from('samples')
    .select('wolthers_contract_nr, status, origin')
    .or(`client_id.eq.${companyId},end_client_id.eq.${companyId}`)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: 'Could not load contracts' }, { status: 500 })
  return NextResponse.json({ contracts: groupSamplesByContract(data ?? []) })
}
