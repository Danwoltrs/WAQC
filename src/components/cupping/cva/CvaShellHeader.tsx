'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The ways out of a shell-less CVA route. Neither /cupping/cva (the picker)
 * nor /cupping/cva/[slug] (the journey) renders the app shell — no sidebar,
 * no app header — so without these the only way back is the browser's Back
 * button (Daniel, 2026-09-17). On a phone a single back chevron keeps the
 * header to one row; from a desk a breadcrumb trail. Shared by both routes
 * so their trails stay in step.
 */

export interface CvaCrumb {
  label: string
  href: string
}

/** Above the picker: the commodity cupping page, which has the app shell. */
export const CVA_PICKER_CRUMBS: readonly CvaCrumb[] = [{ label: 'Cupping', href: '/cupping' }]
/** Above a journey: the same, then the picker. */
export const CVA_JOURNEY_CRUMBS: readonly CvaCrumb[] = [
  ...CVA_PICKER_CRUMBS,
  { label: 'Specialty (CVA)', href: '/cupping/cva' },
]

/** Phone-only back link; hidden from a desk, where the trail takes over. */
export function CvaBackChevron({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground sm:hidden"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  )
}

/** The W badge, the route's name and, from a desk, its subtitle. */
export function CvaBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-sm font-extrabold text-white"
        style={{ background: 'linear-gradient(135deg,#556b2f,#a9a454)', boxShadow: '0 2px 8px rgba(85,107,47,.4)' }}
      >
        W
      </span>
      <span className="min-w-0 leading-tight">
        <b className="block truncate text-sm font-bold tracking-tight">Specialty CVA</b>
        <small className="hidden text-[10.5px] font-semibold uppercase tracking-[1.4px] text-muted-foreground sm:block">
          SCA 2024 Value Assessment
        </small>
      </span>
    </div>
  )
}

/**
 * Desk-only breadcrumb trail: every crumb a link, then the current page in
 * bold, then whatever the route wants to say after it (a lot's secondary
 * reference, the save state).
 */
export function CvaTrail({
  crumbs,
  current,
  children,
}: {
  crumbs: readonly CvaCrumb[]
  current: ReactNode
  children?: ReactNode
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden min-w-[120px] flex-1 truncate text-[12.5px] font-medium text-muted-foreground sm:block"
    >
      {crumbs.map((c) => (
        <span key={c.href}>
          <Link href={c.href} className="transition-colors hover:text-foreground">{c.label}</Link>
          <span className="px-1.5 opacity-50">/</span>
        </span>
      ))}
      <b className="font-semibold text-foreground">{current}</b>
      {children}
    </nav>
  )
}

/** The header row both routes share; the journey appends its live-score pill. */
export function CvaShellHeader({ children }: { children: ReactNode }) {
  return (
    <header className="relative z-10 flex items-center gap-2.5 border-b border-border px-3 py-2 sm:flex-wrap sm:gap-3.5 sm:px-6 sm:py-3.5">
      {children}
    </header>
  )
}
