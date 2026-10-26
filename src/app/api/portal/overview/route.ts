// src/app/api/portal/overview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { parsePortalPeriod, portalPeriodOptions } from '@/lib/portal/portal-period'
import { fetchPortalCertFacts } from '@/lib/portal/portal-facts'
import { toLatest, toPathRows } from '@/lib/portal/overview-model'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_dashboard' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx

  const period = parsePortalPeriod(new URL(request.url).searchParams.get('period'))

  try {
    const facts = await fetchPortalCertFacts(admin, { companyId, period, scope: 'client' })
    return NextResponse.json({
      period,
      periods: portalPeriodOptions(),
      paths: toPathRows(facts),
      latest: toLatest(facts),
    })
  } catch {
    return NextResponse.json({ error: 'Could not load overview' }, { status: 500 })
  }
}
