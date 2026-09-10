'use client'

import { Button } from '@/components/ui/button'
import type { ToleranceAssessment, ToleranceQuadrant } from '@/lib/tolerance/types'

interface Props {
  assessment: ToleranceAssessment
  /** Render only the items belonging to this quadrant, or all when omitted. */
  quadrant?: ToleranceQuadrant
  onApprove: () => void
}

const signed = (n: number, direction: 'min' | 'max') =>
  `${direction === 'min' ? '−' : '+'}${Math.round(n * 10) / 10}`

/**
 * One amber banner naming every metric inside tolerance. Misses confined to a
 * single quadrant render inside it; misses spanning both render once above the
 * pair, with `quadrant` omitted.
 */
export function ToleranceBanner({ assessment, quadrant, onApprove }: Props) {
  if (!assessment.offered) return null
  const items = quadrant ? assessment.items.filter((i) => i.quadrant === quadrant) : assessment.items
  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-semibold text-amber-900 dark:text-amber-200">
        {items.length === 1 ? '1 item within tolerance:' : `${items.length} items within tolerance:`}
      </p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
        {items.map((i) => (
          `${i.label} — ${Math.round(i.actual * 10) / 10}${i.quadrant === 'distribution' ? '%' : ''}` +
          ` vs ${i.direction} ${i.limit}${i.quadrant === 'distribution' ? '%' : ''}` +
          ` (${signed(i.gap, i.direction)})`
        )).join(' · ')}
      </p>
      <Button type="button" size="sm" className="mt-3" onClick={onApprove}>
        Approve with comments
      </Button>
    </div>
  )
}
