'use client'

import { ChevronDown, ListChecks, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { printListSelection, tinCountLine, type PrintListEntry } from '@/lib/print-list'
import { certificatesToTinSampleIds } from '@/lib/print-selection'
import { shownCertificateNumber } from '@/lib/sample-reference'
import type { TinLabelSize } from '@/components/samples/tin-label-size-dialog'

export interface PrintListActionsProps {
  entries: PrintListEntry[]
  /** false while the stored list is being refreshed: nothing that acts on it can be pressed. */
  ready: boolean
  onPrintTins: (size: TinLabelSize) => void
  onPrintBagSleeves: () => void
  onRemove: (id: string) => void
}

const TIN_SIZES: { size: TinLabelSize; label: string }[] = [
  { size: '4cm', label: '4 cm' },
  { size: '2.5cm', label: '2.5 cm' },
]

/**
 * The print list's print actions for the certificates selection bar: Tin
 * labels (pick a size) and Bag sleeves. Both open on a click; there is no
 * hover anywhere (iPads have none). Presentational: the caller owns every
 * action. Today's batch lives in the page header, not here.
 */
export function PrintListPrintActions({
  entries,
  ready,
  onPrintTins,
  onPrintBagSleeves,
}: Omit<PrintListActionsProps, 'onRemove'>) {
  // Until the list is ready its entries may still change (the refresh drops a
  // deleted lot's certificate), so nothing prints from it yet.
  const cannotPrint = !ready || certificatesToTinSampleIds(printListSelection(entries)).length === 0
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            // pointer events stay on so the title explains a disabled button.
            className="disabled:pointer-events-auto"
            disabled={cannotPrint}
            title={tinCountLine(entries)}
          >
            <Printer aria-hidden="true" />
            Tin labels
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {TIN_SIZES.map(({ size, label }) => (
            // The size opens the tin dialog: wait one tick so this modal menu
            // has closed and released the page first (ruling R6).
            <DropdownMenuItem key={size} onSelect={() => { setTimeout(() => onPrintTins(size), 0) }}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        className="disabled:pointer-events-auto"
        disabled={cannotPrint}
        title="6 per A4"
        onClick={onPrintBagSleeves}
      >
        <Printer aria-hidden="true" />
        Bag sleeves
      </Button>
    </>
  )
}

/**
 * "View list": what the print list holds, across every search and page, with
 * a Remove per certificate. The selection bar's Clear empties it.
 */
export function PrintListReview({ entries, ready, onRemove }: Pick<PrintListActionsProps, 'entries' | 'ready' | 'onRemove'>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ListChecks aria-hidden="true" />
          View list
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{tinCountLine(entries)}</div>
        <ul className="max-h-72 overflow-y-auto">
          {entries.map((e) => {
            // A legacy certificate numbered with the SAN lab number shows a dash.
            const number = shownCertificateNumber(e.certificate_number)
            return (
              <li key={e.id} className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <div className="font-mono">{number ?? '—'}</div>
                  <div className="truncate text-muted-foreground">
                    {[e.client_name, e.contract_ref].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${number ?? 'this certificate'}`}
                  disabled={!ready}
                  onClick={() => onRemove(e.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
