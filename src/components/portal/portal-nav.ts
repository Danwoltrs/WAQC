import type { PortalCompany } from '@/lib/portal/portal-me'
import type { QcView } from '@/lib/portal/qc-keys'

export interface PortalNavItem {
  label: string
  href: string
  view?: QcView
  adminOnly?: boolean
}

export const PORTAL_NAV: PortalNavItem[] = [
  { label: 'Overview', href: '/portal', view: 'qc_dashboard' },
  { label: 'Certificates', href: '/portal/certificates', view: 'qc_certificates' },
  { label: 'Suppliers', href: '/portal/suppliers', view: 'qc_supplier_review' },
  { label: 'Containers', href: '/portal/containers', view: 'qc_containers' },
  { label: 'Team', href: '/portal/team', adminOnly: true },
]

export function visibleNav(company: Pick<PortalCompany, 'keys' | 'isCompanyAdmin'>): PortalNavItem[] {
  return PORTAL_NAV.filter(
    (item) => (!item.view || company.keys.views.includes(item.view)) && (!item.adminOnly || company.isCompanyAdmin),
  )
}

/** Where to land when Overview is not granted. */
export function firstVisibleHref(items: PortalNavItem[]): string {
  return items[0]?.href ?? '/portal'
}
