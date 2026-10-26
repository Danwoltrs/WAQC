'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { withCompany } from '@/lib/portal/portal-fetch'
import type { PortalNavItem } from './portal-nav'

export function PortalTopNav({
  pathname, items, companyId, companies, logoUrl, query = '', onSwitchCompany, onSignOut,
}: {
  pathname: string
  items: PortalNavItem[]
  companyId: string
  companies: { id: string; name: string }[]
  logoUrl: string | null
  /** Flow-filter params ('origin=..&seller=..') that follow the user from tab to tab. */
  query?: string
  onSwitchCompany: (id: string) => void
  onSignOut: () => void
}) {
  const current = companies.find((c) => c.id === companyId)
  const hrefFor = (href: string) => {
    const base = withCompany(href, companyId)
    return query ? `${base}&${query}` : base
  }
  return (
    <header className="border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-3.5">
        <div className="flex items-center gap-8">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={current?.name ?? 'Company'} className="h-[34px] max-w-[140px] object-contain" />
          ) : (
            <span className="text-[14px] font-semibold text-black">{current?.name}</span>
          )}
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={hrefFor(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-[6px] px-3 py-[7px] text-[13px] transition-colors',
                    active ? 'bg-black/[0.04] font-medium text-black' : 'text-black/60 hover:text-black',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {companies.length > 1 && (
            <select
              aria-label="Company"
              value={companyId}
              onChange={(e) => onSwitchCompany(e.target.value)}
              className="rounded-[6px] border border-black/10 bg-white px-3 py-1.5 text-[13px] text-black/70"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/wolthers-logo-green.svg" alt="Wolthers" className="h-[22px]" />
          <span className="h-5 w-px bg-black/10" aria-hidden="true" />
          <button onClick={onSignOut} className="text-[13px] text-black/60 hover:text-black">Sign out</button>
        </div>
      </div>
    </header>
  )
}
