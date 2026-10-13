'use client'

import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, Lock, LockOpen, Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AlignEdge, Axis } from '@/lib/storage/arrange'
import type { FloorGroup } from '@/lib/storage/floor-plan'
import { TextField } from './inspector-fields'

const ALIGN: Array<{ edge: AlignEdge; label: string; icon: LucideIcon }> = [
  { edge: 'left', label: 'Align left', icon: AlignStartVertical },
  { edge: 'centre', label: 'Align centre', icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Align middle', icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
]

/** Lock when anything selected is unlocked; Unlock when all of it is locked. */
export function LockButton({ allLocked, onLock }: { allLocked: boolean; onLock: (locked: boolean) => void }) {
  return (
    <Button variant="outline" size="sm" aria-pressed={allLocked} onClick={() => onLock(!allLocked)}>
      {allLocked
        ? <><LockOpen className="mr-1.5 h-4 w-4" />Unlock</>
        : <><Lock className="mr-1.5 h-4 w-4" />Lock</>}
    </Button>
  )
}

function DeleteButton({ disabled, onDelete }: { disabled: boolean; onDelete: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="text-red-600" disabled={disabled} onClick={onDelete}>
      <Trash2 className="mr-1.5 h-4 w-4" />Delete
    </Button>
  )
}

export function GroupPanel({ group, count, allLocked, anyLocked, onRename, onLock, onUngroup, onDelete }: {
  group: FloorGroup
  count: number
  allLocked: boolean
  anyLocked: boolean
  onRename: (name: string | null) => void
  onLock: (locked: boolean) => void
  onUngroup: () => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{group.name || 'Group'}</h3>
      <TextField label="Group name" focus="name" value={group.name ?? ''} onCommit={(name) => onRename(name.trim() || null)} />
      <p className="text-xs text-muted-foreground">{count} shapes move together. Double-click one to edit it alone.</p>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <LockButton allLocked={allLocked} onLock={onLock} />
        <Button variant="outline" size="sm" onClick={onUngroup}>Ungroup</Button>
        <DeleteButton disabled={anyLocked} onDelete={onDelete} />
      </div>
    </div>
  )
}

export function MultiPanel({ count, hasRoom, allLocked, anyLocked, onGroup, onAlign, onDistribute, onLock, onDelete }: {
  count: number
  hasRoom: boolean
  allLocked: boolean
  anyLocked: boolean
  onGroup: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: Axis) => void
  onLock: (locked: boolean) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{count} shapes selected</h3>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Align and space</p>
        <div className="flex flex-wrap gap-1">
          {ALIGN.map(({ edge, label, icon: Icon }) => (
            <Button key={edge} variant="outline" size="icon" className="h-8 w-8" aria-label={label} title={label}
              onClick={() => onAlign(edge)}>
              <Icon className="h-4 w-4" />
            </Button>
          ))}
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Distribute horizontally"
            title="Distribute horizontally" disabled={count < 3} onClick={() => onDistribute('h')}>
            <AlignHorizontalDistributeCenter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Distribute vertically"
            title="Distribute vertically" disabled={count < 3} onClick={() => onDistribute('v')}>
            <AlignVerticalDistributeCenter className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" disabled={hasRoom} title={hasRoom ? 'Rooms cannot be grouped' : undefined}
          onClick={onGroup}>
          Group
        </Button>
        <LockButton allLocked={allLocked} onLock={onLock} />
        <DeleteButton disabled={anyLocked} onDelete={onDelete} />
      </div>
    </div>
  )
}
