'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { withCompany } from '@/lib/portal/portal-fetch'
import type { PortalNavItem } from './portal-nav'

export function PortalTopNav({
  pathname, items, companyId, companies, onSwitchCompany, onSignOut,
}: {
  pathname: string
  items: PortalNavItem[]
  companyId: string
  companies: { id: string; name: string }[]
  onSwitchCompany: (id: string) => void
  onSignOut: () => void
}) {
  const current = companies.find((c) => c.id === companyId)
  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="text-base font-semibold tracking-tight text-neutral-900">Wolthers QC</span>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={withCompany(item.href, companyId)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm transition-colors',
                    active ? 'bg-[#556b2f]/10 font-medium text-[#556b2f]' : 'text-neutral-500 hover:text-neutral-900',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {companies.length > 1 ? (
            <select
              aria-label="Company"
              value={companyId}
              onChange={(e) => onSwitchCompany(e.target.value)}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-neutral-500">{current?.name}</span>
          )}
          <button onClick={onSignOut} className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
        </div>
      </div>
    </header>
  )
}
