import type { PortalCompany } from '@/lib/portal/portal-me'
import type { QcView } from '@/lib/portal/qc-keys'

export interface PortalNavItem {
  label: string
  href: string
  view?: QcView
  adminOnly?: boolean
}

export const PORTAL_NAV: PortalNavItem[] = [
  { label: 'Overview', href: '/portal' },
  { label: 'Contracts', href: '/portal/contracts', view: 'qc_samples' },
  { label: 'Samples', href: '/portal/samples', view: 'qc_samples' },
  { label: 'Certificates', href: '/portal/certificates', view: 'qc_certificates' },
  { label: 'Team', href: '/portal/team', adminOnly: true },
]

export function visibleNav(company: Pick<PortalCompany, 'keys' | 'isCompanyAdmin'>): PortalNavItem[] {
  return PORTAL_NAV.filter(
    (item) => (!item.view || company.keys.views.includes(item.view)) && (!item.adminOnly || company.isCompanyAdmin),
  )
}
