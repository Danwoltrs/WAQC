'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SEND_WINDOWS, type SendWindow } from '@/lib/approval-notification/send-window'

interface Props {
  onSelect: (window: SendWindow) => void
}

// Long enough to cross from the button to the menu without it closing.
const CLOSE_DELAY_MS = 150

/**
 * "Send unsent" and its period menu. Opens on hover with a mouse, and on a tap
 * or click everywhere — the iPad has no hover. Periods stop at four weeks.
 */
export function SendUnsentMenu({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A menu opened by hovering must not pull focus back to the button on close.
  const openedByHover = useRef(false)

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  useEffect(() => cancelClose, [])

  const hoverOpen = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') return
    cancelClose()
    if (!open) openedByHover.current = true
    setOpen(true)
  }
  const hoverClose = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') return
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }
  const changeOpen = (next: boolean) => {
    if (next) openedByHover.current = false
    setOpen(next)
  }

  return (
    <DropdownMenu open={open} onOpenChange={changeOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          // Hovering already opened it; a click must not toggle it shut again.
          onPointerDown={(e) => {
            if (open && e.pointerType === 'mouse') e.preventDefault()
          }}
        >
          <Mail className="h-4 w-4 mr-2" />
          Send unsent
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onPointerEnter={hoverOpen}
        onPointerLeave={hoverClose}
        onCloseAutoFocus={(e) => {
          if (openedByHover.current) e.preventDefault()
        }}
      >
        <DropdownMenuLabel>Send certificates issued</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SEND_WINDOWS.map((w) => (
          <DropdownMenuItem key={w.value} onSelect={() => onSelect(w.value)}>
            <span className="w-7 font-medium">{w.label}</span>
            <span className="text-muted-foreground">{w.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
