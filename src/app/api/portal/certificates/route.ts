// src/app/api/portal/certificates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { parsePortalPeriod, portalPeriodOptions } from '@/lib/portal/portal-period'
import { fetchPortalCertFacts } from '@/lib/portal/portal-facts'
import { matchFlowFilters } from '@/lib/portal/overview-model'
import { filtersFromSearch } from '@/lib/portal/portal-filter-params'
import { factToCertRow, matchCertSearch } from '@/lib/portal/portal-certificates'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_certificates' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx

  const params = new URL(request.url).searchParams
  const period = parsePortalPeriod(params.get('period'))
  const filters = filtersFromSearch(params)
  const q = params.get('q') ?? ''

  try {
    const facts = await fetchPortalCertFacts(admin, { companyId, period, scope: 'client_or_end' })
    const rows = matchFlowFilters(facts, filters).filter(f => matchCertSearch(f, q))
    return NextResponse.json({
      period,
      periods: portalPeriodOptions(),
      certificates: rows.map(f => factToCertRow(f, companyId)),
    })
  } catch (error) {
    console.error('[portal/certificates]', error)
    return NextResponse.json({ error: 'Could not load certificates' }, { status: 500 })
  }
}
