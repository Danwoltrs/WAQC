'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PORTAL_NAV } from './portal-nav'

export function PortalTopNav({ pathname, onSignOut }: { pathname: string; onSignOut: () => void }) {
  return (
    <header className="border-b border-neutral-100 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <span className="text-base font-semibold tracking-tight text-neutral-900">Wolthers QC</span>
          <nav className="hidden items-center gap-1 md:flex">
            {PORTAL_NAV.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm transition-colors',
                    active ? 'bg-[#556b2f]/10 font-medium text-[#556b2f]' : 'text-neutral-500 hover:text-neutral-900'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <button onClick={onSignOut} className="text-sm text-neutral-500 hover:text-neutral-900">Sign out</button>
      </div>
    </header>
  )
}
