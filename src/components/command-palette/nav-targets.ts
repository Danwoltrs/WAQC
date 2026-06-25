import type { NavTarget } from './types'

export const NAV_TARGETS: NavTarget[] = [
  { label: 'Samples', href: '/samples/qc' },
  { label: 'Certificates', href: '/certificates' },
  { label: 'Grading', href: '/grading' },
  { label: 'Cupping', href: '/cupping' },
  { label: 'Specialty (CVA)', href: '/cupping/cva' },
  { label: 'Clients', href: '/clients' },
  { label: 'Quality Specs', href: '/quality/templates', keywords: 'templates specs' },
  { label: 'Laboratories', href: '/laboratories', keywords: 'lab' },
  { label: 'Finance', href: '/finance' },
  { label: 'Users', href: '/users' },
  { label: 'Dashboard Overview', href: '/dashboard/metrics/overview', keywords: 'dashboard metrics' },
]

export function filterNavTargets(query: string): NavTarget[] {
  const q = query.trim().toLowerCase()
  if (!q) return NAV_TARGETS
  return NAV_TARGETS.filter(
    (t) => t.label.toLowerCase().includes(q) || (t.keywords?.toLowerCase().includes(q) ?? false)
  )
}
