'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MainLayoutContext } from './main-layout-context'

/**
 * The last crumb is always the page title (the h1); its `href` and `onClick`
 * are ignored.
 */
export type Crumb = {
  label: string
  href?: string
  onClick?: () => void
  /** A record name (e.g. a template): foreground, 14px/600. */
  emphasis?: boolean
  /** Shown right after the label, e.g. a version tag. */
  badge?: React.ReactNode
}

export interface PageHeaderProps {
  /** The last crumb is the page title and renders as the h1. */
  crumbs: Crumb[]
  back?: { label: string } & ({ href: string; onClick?: () => void } | { href?: undefined; onClick: () => void })
  count?: number
  /**
   * Right side, in order: ghost, outline, primary.
   * Callers shrink labelled actions to icon buttons on phones and keep the
   * accessible name:
   * `<Button aria-label="New template" className="max-sm:w-9 max-sm:px-0"><Plus /><span className="hidden sm:inline">New template</span></Button>`
   */
  actions?: React.ReactNode
  toolbar?: React.ReactNode
  /** 'row' (default) puts the toolbar on a second row; 'inline' sits after the title and wraps. */
  toolbarPlacement?: 'row' | 'inline'
  /** Default true. The client portal passes false. */
  sticky?: boolean
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader(
  { crumbs, back, count, actions, toolbar, toolbarPlacement = 'row', sticky = true },
  ref,
) {
  const inMainLayout = React.useContext(MainLayoutContext)
  const lastIndex = crumbs.length - 1

  return (
    <div ref={ref} className={cn('top-0 z-20 bg-background', sticky && 'sticky')}>
      <div className={cn('flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 py-2', inMainLayout && 'max-lg:pl-16')}>
        {back && (
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={back.label} asChild={!!back.href} onClick={back.href ? undefined : back.onClick}>
            {back.href ? (
              <Link href={back.href} aria-label={back.label}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : (
              <ArrowLeft className="h-4 w-4" />
            )}
          </Button>
        )}
        <nav aria-label="Breadcrumb" className="min-w-[10rem]">
          <ol className="flex min-w-0 items-center gap-2">
            {crumbs.map((crumb, i) => {
              const isLast = i === lastIndex
              // Everything except the last two crumbs is hidden below sm.
              const hiddenOnPhone = i < lastIndex - 1
              const labelClass = crumb.emphasis
                ? 'text-[14px] font-semibold text-foreground'
                : 'text-[13px] font-normal text-muted-foreground'
              let label: React.ReactNode
              if (isLast) {
                label = (
                  <h1 aria-current="page" title={crumb.label} className="truncate text-[18px] font-semibold text-primary">
                    {crumb.label}
                  </h1>
                )
              } else if (crumb.href) {
                label = (
                  <Link href={crumb.href} onClick={crumb.onClick} className={cn(labelClass, 'hover:text-foreground', crumb.emphasis && 'truncate max-w-[16rem]')} title={crumb.emphasis ? crumb.label : undefined}>
                    {crumb.label}
                  </Link>
                )
              } else if (crumb.onClick) {
                label = (
                  <button type="button" onClick={crumb.onClick} className={cn(labelClass, 'hover:text-foreground', crumb.emphasis && 'truncate max-w-[16rem]')} title={crumb.emphasis ? crumb.label : undefined}>
                    {crumb.label}
                  </button>
                )
              } else {
                label = (
                  <span className={cn(labelClass, crumb.emphasis && 'truncate max-w-[16rem]')} title={crumb.emphasis ? crumb.label : undefined}>
                    {crumb.label}
                  </span>
                )
              }
              return (
                <li key={`${i}-${crumb.label}`} className={cn('items-center gap-2', isLast ? 'min-w-0' : 'shrink-0', hiddenOnPhone ? 'hidden sm:flex' : 'flex')}>
                  {label}
                  {crumb.badge}
                  {!isLast && (
                    <span aria-hidden className="text-muted-foreground/40">
                      /
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
        {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span>}
        {toolbar && toolbarPlacement === 'inline' && (
          <div className="flex min-w-0 basis-full order-last flex-wrap items-center gap-2 sm:order-none sm:basis-auto">{toolbar}</div>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {toolbar && toolbarPlacement === 'row' && (
        <div data-testid="page-header-toolbar-row" className="flex min-h-[52px] flex-wrap items-center gap-x-2 gap-y-2 border-b px-6 py-2">
          {toolbar}
        </div>
      )}
    </div>
  )
})
