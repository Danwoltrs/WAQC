import * as React from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

/**
 * Docked under a table while rows are selected. Callers pass `size="sm"`
 * outline buttons as `actions`; `destructive` sits last, after a divider.
 *
 * Renders nothing at count 0. While mounted, count changes are announced
 * politely; the first selection is announced by the row checkbox's own
 * checked state, not by this bar. `z-10` keeps it above scrolling rows and
 * sticky table heads (callers may override via `className`).
 */
function SelectionBar({
  count,
  noun = "selected",
  onClear,
  actions,
  destructive,
  className,
}: {
  count: number
  noun?: string
  onClear: () => void
  actions: React.ReactNode
  destructive?: React.ReactNode
  className?: string
}) {
  if (count <= 0) return null

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 flex min-h-[44px] items-center gap-3 border-t bg-background px-4 py-2 sm:px-6",
        className
      )}
    >
      <span aria-live="polite" aria-atomic="true" className="text-sm font-medium">
        {count} {noun}
      </span>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {actions}
        {destructive ? (
          <>
            <Separator orientation="vertical" decorative={false} className="h-5" />
            {destructive}
          </>
        ) : null}
      </div>
    </div>
  )
}

export { SelectionBar }
