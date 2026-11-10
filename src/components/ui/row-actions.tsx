'use client'

import * as React from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface RowAction {
  id: string
  label: string
  icon?: LucideIcon
  onSelect: () => void
  destructive?: boolean
  hidden?: boolean
}

/** Drops hidden actions and moves destructive ones last; order is otherwise kept. */
export function visibleRowActions(actions: RowAction[]): RowAction[] {
  const shown = actions.filter((a) => !a.hidden)
  return [...shown.filter((a) => !a.destructive), ...shown.filter((a) => a.destructive)]
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation()
const DESTRUCTIVE = 'text-destructive focus:text-destructive'

/** Menu portals still bubble React events to the row, so contain them here. */
function renderItems(
  actions: RowAction[],
  Item: typeof DropdownMenuItem | typeof ContextMenuItem,
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator,
) {
  const firstDestructive = actions.findIndex((a) => a.destructive)
  return actions.map((a, i) => (
    <React.Fragment key={a.id}>
      {i > 0 && i === firstDestructive && <Separator />}
      <Item className={a.destructive ? DESTRUCTIVE : undefined} onClick={stop} onSelect={() => a.onSelect()}>
        {a.icon && <a.icon className="mr-2 size-4" aria-hidden="true" />}
        {a.label}
      </Item>
    </React.Fragment>
  ))
}

export function RowActions({
  onOpen,
  openLabel,
  actions,
}: {
  onOpen: () => void
  openLabel?: string
  actions: RowAction[]
}) {
  const items = visibleRowActions(actions)
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
      >
        {openLabel ?? 'Open'}
      </Button>
      {items.length > 0 && (
        <DropdownMenu>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More actions" onClick={stop} onPointerDown={stop}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" onClick={stop}>
            {renderItems(items, DropdownMenuItem, DropdownMenuSeparator)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function RowContextMenu({ actions, children }: { actions: RowAction[]; children: React.ReactNode }) {
  const items = visibleRowActions(actions)
  if (items.length === 0) return <>{children}</>
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent onClick={stop}>{renderItems(items, ContextMenuItem, ContextMenuSeparator)}</ContextMenuContent>
    </ContextMenu>
  )
}
