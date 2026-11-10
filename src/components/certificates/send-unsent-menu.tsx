'use client'

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

/**
 * "Send unsent" and its period menu: the Certificates header's primary
 * action. Opens on a click or a tap, never on hover. Periods stop at four weeks.
 */
export function SendUnsentMenu({ onSelect }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Mail aria-hidden="true" />
          Send unsent
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
