import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { parsePortalPeriod } from '@/lib/portal/portal-period'
import { fetchPortalCertFacts } from '@/lib/portal/portal-facts'
import { CLIENT_SECTIONS, isOriginalVersion, sectionCompliance, versionViews } from '@/lib/portal/portal-qualities'
import { fetchAuthorNames, fetchCompanyQualities } from '@/lib/portal/portal-qualities-fetch'
import { specToday, versionInForce } from '@/lib/quality-spec/pick-version'
import { serverError } from '@/lib/portal/route-errors'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireQcPortal(request, { view: 'qc_specs' })
  if (!gate.ok) return gate.response
  const { admin, companyId, keys, isStaffViewAs } = gate.ctx
  const period = parsePortalPeriod(new URL(request.url).searchParams.get('period'))
  try {
    const [quality] = await fetchCompanyQualities(admin, companyId, id)
    if (!quality) return NextResponse.json({ error: 'Quality not found' }, { status: 404 })

    const today = specToday()
    const inForce = versionInForce(quality.versions, today)
    const facts = await fetchPortalCertFacts(admin, { companyId, period, scope: 'client' })
    const names = await fetchAuthorNames(admin, quality.versions)
    const sections = inForce
      ? sectionCompliance(facts, quality.id)
      : Object.fromEntries(CLIENT_SECTIONS.map((s) => [s, null]))

    return NextResponse.json({
      period,
      quality: {
        id: quality.id,
        name: quality.name,
        origin: quality.origin,
        methodology: inForce?.spec?.template?.methodology ?? null,
      },
      inForce: inForce
        ? {
            versionId: inForce.id,
            versionNo: inForce.version_no,
            effectiveFrom: inForce.effective_from,
            parameters: inForce.spec?.template?.parameters ?? {},
            original: isOriginalVersion(inForce),
          }
        : null,
      versions: versionViews(quality.versions, today, names),
      sections,
      canEdit: !!inForce && keys.capabilities.includes('qc_spec_edit') && !isStaffViewAs,
    })
  } catch (error) {
    return serverError(error)
  }
}
