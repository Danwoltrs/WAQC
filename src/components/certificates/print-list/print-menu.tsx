'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { printListSelection, tinCountLine, type PrintListEntry } from '@/lib/print-list'
import { certificatesToTinSampleIds } from '@/lib/print-selection'
import type { TinLabelSize } from '@/components/samples/tin-label-size-dialog'

export interface PrintMenuProps {
  entries: PrintListEntry[]
  today: { count: number; loaded: boolean; error: string | null }
  onPrintTins: (size: TinLabelSize) => void
  onPrintBagSleeves: () => void
  onPrintToday: () => void
  onRemove: (id: string) => void
  onClear: () => void
}

const OPEN_DELAY_MS = 120
const CLOSE_DELAY_MS = 200

const ROW =
  'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent'

function MenuItem({
  disabled,
  title,
  onClick,
  children,
}: {
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={ROW}
      disabled={disabled}
      aria-disabled={disabled ? true : undefined}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * The certificates Print menu. Opens on a resting mouse and on any click or
 * tap (iPads have no hover). Presentational: the caller owns every action.
 */
export function PrintMenu({
  entries,
  today,
  onPrintTins,
  onPrintBagSleeves,
  onPrintToday,
  onRemove,
  onClear,
}: PrintMenuProps) {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // How the menu came open: a click on the trigger closes it only if a click opened it.
  const openedBy = useRef<'hover' | 'click' | null>(null)

  const clearOpenTimer = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = null
  }
  const clearCloseTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  useEffect(
    () => () => {
      clearOpenTimer()
      clearCloseTimer()
    },
    [],
  )

  const hoverEnter = () => {
    clearCloseTimer()
    if (open || openTimer.current) return
    openTimer.current = setTimeout(() => {
      openTimer.current = null
      openedBy.current = 'hover'
      setOpen(true)
    }, OPEN_DELAY_MS)
  }
  const hoverLeave = () => {
    clearOpenTimer()
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      openedBy.current = null
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }
  const toggle = () => {
    clearOpenTimer()
    clearCloseTimer()
    if (open && openedBy.current === 'hover') {
      openedBy.current = 'click'
      return
    }
    if (open) {
      openedBy.current = null
      setOpen(false)
      return
    }
    openedBy.current = 'click'
    setOpen(true)
  }
  const act = (fn: () => void) => () => {
    clearOpenTimer()
    clearCloseTimer()
    openedBy.current = null
    setOpen(false)
    fn()
  }

  const empty = entries.length === 0
  const noTins = certificatesToTinSampleIds(printListSelection(entries)).length === 0
  const todayUnavailable = !!today.error

  return (
    <Popover open={open} onOpenChange={(next) => {
        if (next) return
        openedBy.current = null
        setOpen(false)
      }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onMouseEnter={hoverEnter}
          onMouseLeave={hoverLeave}
          onClick={(e) => {
            e.preventDefault()
            toggle()
          }}
        >
          <Printer className="mr-2 h-4 w-4" />
          {empty ? 'Print' : `Print · ${entries.length}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-1"
        onMouseEnter={clearCloseTimer}
        onMouseLeave={hoverLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {empty ? 'Tick certificates to add them' : tinCountLine(entries)}
        </div>
        <MenuItem disabled={noTins} onClick={act(() => onPrintTins('4cm'))}>
          Tin labels 4 cm
        </MenuItem>
        <MenuItem disabled={noTins} onClick={act(() => onPrintTins('2.5cm'))}>
          Tin labels 2.5 cm
        </MenuItem>
        <MenuItem disabled={noTins} onClick={act(onPrintBagSleeves)}>
          Bag sleeves (6 per A4)
        </MenuItem>
        <Separator className="my-1" />
        <MenuItem
          disabled={todayUnavailable || today.count === 0}
          title={today.error ?? undefined}
          onClick={act(onPrintToday)}
        >
          {todayUnavailable ? "Today's batch unavailable" : `Today's batch · ${today.count}`}
        </MenuItem>
        {!empty && (
          <>
            <Separator className="my-1" />
            <ul className="max-h-72 overflow-y-auto">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono">{e.certificate_number}</div>
                    <div className={cn('truncate text-muted-foreground')}>
                      {[e.client_name, e.contract_ref].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${e.certificate_number}`}
                    onClick={() => onRemove(e.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Separator className="my-1" />
            <MenuItem onClick={act(onClear)}>Clear list</MenuItem>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
