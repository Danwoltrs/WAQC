import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  back?: { href?: string; onClick?: () => void; label: string }
  count?: number
  /**
   * Right side, in order: ghost, outline, primary.
   * Callers shrink labelled actions to icon buttons on phones by wrapping the
   * label in `<span className="hidden sm:inline">`.
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
  const lastIndex = crumbs.length - 1

  return (
    <div ref={ref} className={cn('top-0 z-20 bg-background', sticky && 'sticky')}>
      <div className="flex min-h-[52px] items-center gap-3 border-b px-6">
        {back && (
          <Button variant="ghost" size="icon" aria-label={back.label} asChild={!!back.href} onClick={back.href ? undefined : back.onClick}>
            {back.href ? (
              <Link href={back.href} aria-label={back.label}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : (
              <ArrowLeft className="h-4 w-4" />
            )}
          </Button>
        )}
        <nav aria-label="Breadcrumb" className="min-w-0">
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
                label = <h1 className="text-[18px] font-semibold text-primary">{crumb.label}</h1>
              } else if (crumb.href) {
                label = (
                  <Link href={crumb.href} className={cn(labelClass, 'hover:text-foreground')}>
                    {crumb.label}
                  </Link>
                )
              } else if (crumb.onClick) {
                label = (
                  <button type="button" onClick={crumb.onClick} className={cn(labelClass, 'hover:text-foreground')}>
                    {crumb.label}
                  </button>
                )
              } else {
                label = <span className={labelClass}>{crumb.label}</span>
              }
              return (
                <li key={`${i}-${crumb.label}`} className={cn('items-center gap-2', hiddenOnPhone ? 'hidden sm:flex' : 'flex')}>
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
        {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
        {toolbar && toolbarPlacement === 'inline' && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {toolbar && toolbarPlacement === 'row' && (
        <div data-testid="page-header-toolbar-row" className="flex min-h-[52px] items-center gap-2 border-b px-6">
          {toolbar}
        </div>
      )}
    </div>
  )
})
