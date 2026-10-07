'use client'

import { AppWindow, Archive, Box, DoorOpen, Grid3x3, MousePointer2, RectangleHorizontal, Square, Table } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tool } from './editor-state'

const TOOLS: Array<{ tool: Tool; label: string; icon: LucideIcon }> = [
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'room', label: 'Room', icon: Square },
  { tool: 'shelf', label: 'Shelf', icon: Grid3x3 },
  { tool: 'bench', label: 'Bench', icon: RectangleHorizontal },
  { tool: 'table', label: 'Table', icon: Table },
  { tool: 'cabinet', label: 'Cabinet', icon: Archive },
  { tool: 'equipment', label: 'Equipment', icon: Box },
  { tool: 'door', label: 'Door', icon: DoorOpen },
  { tool: 'window', label: 'Window', icon: AppWindow },
]

export function ToolPalette({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <nav aria-label="Drawing tools" className="flex w-20 shrink-0 flex-col gap-1 border-r p-2">
      {TOOLS.map(({ tool: t, label, icon: Icon }) => (
        <button key={t} type="button" aria-pressed={tool === t} onClick={() => onTool(t)}
          className={cn('flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] hover:bg-muted',
            tool === t && 'bg-muted font-medium')}>
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  )
}
