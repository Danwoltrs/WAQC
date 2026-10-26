import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { parsePortalPeriod, portalPeriodOptions } from '@/lib/portal/portal-period'
import { fetchPortalCertFacts } from '@/lib/portal/portal-facts'
import { filterFacts } from '@/lib/portal/overview-model'
import { filtersFromSearch } from '@/lib/portal/portal-filter-params'
import { buildSellerList, buildSellerDetail } from '@/lib/portal/supplier-review'
import { fetchRejectionDetails } from '@/lib/portal/rejection-details-fetch'

export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { view: 'qc_supplier_review' })
  if (!gate.ok) return gate.response
  const { admin, companyId } = gate.ctx

  const params = new URL(request.url).searchParams
  const period = parsePortalPeriod(params.get('period'))
  // `seller` picks the detail; it is not a flow filter here, so the list keeps every seller.
  const { seller: _selected, ...flow } = filtersFromSearch(params)
  const seller = params.get('seller') || null

  try {
    const all = await fetchPortalCertFacts(admin, { companyId, period, scope: 'client' })
    const facts = filterFacts(all, flow)
    let detail = null
    if (seller) {
      const ids = [...new Set(facts.filter(f => f.seller === seller && f.rejected).map(f => f.labSampleId))]
      const details = ids.length > 0 ? await fetchRejectionDetails(admin, ids) : new Map()
      detail = buildSellerDetail(facts, seller, details)
    }
    return NextResponse.json({ period, periods: portalPeriodOptions(), sellers: buildSellerList(facts), detail })
  } catch (error) {
    console.error('[portal/suppliers]', error)
    return NextResponse.json({ error: 'Could not load suppliers' }, { status: 500 })
  }
}
