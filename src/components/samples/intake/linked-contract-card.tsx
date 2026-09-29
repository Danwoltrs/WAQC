'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { contractDisplayNumber } from '@/lib/contract-family'
import { cn } from '@/lib/utils'
import type { SelectedContract } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shipmentLabel(isoDate: string | null): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate ?? '')
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]} shipment` : null
}

/**
 * The linked contract, so the user can tell at a glance it is the right one:
 * Wolthers ref, client, the client's own ref and the quality, with the rest
 * of the contract in a line under them. `full` is Step 1's confirmation;
 * `compact` rides in Step 2's side panel. Unlinking asks once, because it
 * clears every field the contract filled that the user has not edited.
 */
export function LinkedContractCard({
  contract,
  clientRef,
  onUnlink,
  variant = 'full',
  className,
}: {
  contract: SelectedContract
  /** The client's contract ref as the form holds it (prefilled from the contract, or corrected). */
  clientRef: string
  onUnlink?: () => void
  variant?: 'full' | 'compact'
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const number = contractDisplayNumber(contract)
  const detail = [
    [contract.seller_name, contract.buyer_name].filter(Boolean).join(' → ') || null,
    contract.volume_bags != null ? `${contract.volume_bags} bags` : null,
    contract.bag_type,
    shipmentLabel(contract.shipment_period_start),
    contract.crop,
  ].filter(Boolean).join(' · ')

  const facts: Array<[string, string | null]> = [
    ['Wolthers ref', number ? `#${number}` : null],
    ['Client', contract.buyer_name],
    ['Client ref', clientRef.trim() || null],
    ['Quality', contract.quality_description],
  ]

  const unlink = onUnlink && (
    confirming ? (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Unlink? Fields it filled are cleared.</span>
        <Button
          type="button"
          variant="outline"
          onClick={() => { setConfirming(false); onUnlink() }}
          className="h-7 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          Unlink
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)} className="h-7 px-2.5 text-xs">
          Keep
        </Button>
      </div>
    ) : (
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="h-7 px-2.5 text-xs text-muted-foreground">
        Unlink
      </Button>
    )
  )

  if (variant === 'compact') {
    return (
      <section aria-label="Linked contract" className={cn('rounded-lg border border-[#556b2f]/30 bg-[#556b2f]/[0.05] p-4', className)}>
        <div className="flex items-center gap-2 text-xs font-medium text-[#556b2f]">
          <Check className="h-3.5 w-3.5" aria-hidden />
          Linked contract
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={cn('min-w-0 break-words', !value && 'text-muted-foreground')}>{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {detail && <p className="mt-3 text-xs text-muted-foreground">{detail}</p>}
        {unlink && <div className="mt-2 -ml-2.5">{unlink}</div>}
      </section>
    )
  }

  return (
    <section aria-label="Linked contract" className={cn('overflow-hidden rounded-lg border border-[#556b2f]/30 bg-[#556b2f]/[0.05]', className)}>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#556b2f]/20 px-5 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[#556b2f]">
          <Check className="h-4 w-4" aria-hidden />
          Contract linked
        </div>
        {unlink}
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn('mt-1 break-words text-base font-semibold', !value && 'font-normal text-muted-foreground')}>
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
      {detail && <p className="border-t border-[#556b2f]/20 px-5 py-3 text-xs text-muted-foreground">{detail}</p>}
    </section>
  )
}
