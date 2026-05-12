// src/components/samples/intake/entity-resolution-notice.tsx
'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  message: string
  action?: { label: string; onClick: () => void }
}

export function EntityResolutionNotice({ message, action }: Props) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs p-2 flex items-start gap-2 mt-1">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div>{message}</div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="underline mt-1 hover:opacity-80"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
