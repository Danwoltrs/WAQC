import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The pinned footer for panels and wizards. Same slot layout as DialogFooter
 * (start on the left, children on the right), but it lives inside a container,
 * so it is square and carries no negative margins.
 */
function CommitBar({
  start,
  children,
  className,
}: {
  start?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 flex items-center gap-2 border-t bg-muted px-4 py-3 sm:px-6",
        className
      )}
    >
      {start}
      <div className="flex-1" />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {children}
      </div>
    </div>
  )
}

export { CommitBar }
