'use client'

import type { JSX } from 'react'
import { Button } from '@/components/ui/button'

interface CertificatePagerProps {
  /** 1-based. */
  page: number
  pageSize: number
  /** Every certificate under the current search and filters, not just this page. */
  total: number
  onPage: (page: number) => void
}

/**
 * Previous / "Page 2 of 14" / Next under the certificates table. Nothing at all
 * while every certificate fits on one page.
 */
export function CertificatePager({ page, pageSize, total, onPage }: CertificatePagerProps): JSX.Element | null {
  if (total <= pageSize) return null
  const pages = Math.ceil(total / pageSize)
  return (
    <nav aria-label="Certificate pages" className="flex items-center justify-end gap-2 pt-3">
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{`Page ${page} of ${pages}`}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}
