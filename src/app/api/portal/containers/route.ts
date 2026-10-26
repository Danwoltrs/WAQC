// src/app/api/portal/containers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { fetchPortalContainers, matchContainerSearch } from '@/lib/portal/portal-containers'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_containers' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx
  const q = new URL(request.url).searchParams.get('q') ?? ''

  try {
    const rows = await fetchPortalContainers(admin, companyId)
    return NextResponse.json({ containers: rows.filter(r => matchContainerSearch(r, q)) })
  } catch (error) {
    console.error('[portal/containers]', error)
    return NextResponse.json({ error: 'Could not load containers' }, { status: 500 })
  }
}
