import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { parsePortalPeriod, portalPeriodOptions } from '@/lib/portal/portal-period'
import { fetchPortalCertFacts } from '@/lib/portal/portal-facts'
import { buildQualityList, buildOriginSummary } from '@/lib/portal/portal-qualities'
import { fetchCompanyQualities } from '@/lib/portal/portal-qualities-fetch'
import { specToday } from '@/lib/quality-spec/pick-version'
import { serverError } from '@/lib/portal/route-errors'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_specs' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx
  const period = parsePortalPeriod(new URL(request.url).searchParams.get('period'))
  try {
    const [qualities, facts] = await Promise.all([
      fetchCompanyQualities(admin, companyId),
      fetchPortalCertFacts(admin, { companyId, period, scope: 'client' }),
    ])
    const list = buildQualityList(facts, qualities, specToday())
    return NextResponse.json({ period, periods: portalPeriodOptions(), origins: buildOriginSummary(list), qualities: list })
  } catch (error) {
    return serverError(error)
  }
}
