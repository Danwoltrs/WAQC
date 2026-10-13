'use client'

import { Fragment, type ReactNode } from 'react'
import {
  ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuRadioGroup,
  ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { AlignEdge, Axis, Turn } from '@/lib/storage/arrange'
import { FLOOR_ITEM_KINDS, FLOOR_ITEM_LABELS, type FloorItemKind } from '@/lib/storage/floor-plan'
import { selectionGroup, shapeGroupId, shapeLocked, type DrawTool, type EditorDoc, type ShapeRef } from './editor-state'
import type { MenuTarget, Point } from './blueprint-canvas'

export type MenuId =
  | 'edit' | 'rename' | 'rotateRight' | 'rotateLeft' | 'duplicate' | 'copy' | 'paste' | 'lock' | 'unlock'
  | 'group' | 'ungroup' | 'align' | 'distribute' | 'delete' | 'accessBoth' | 'viewCubbies' | 'changeType'
  | 'addHere' | 'pasteHere' | 'selectAll' | 'fit'

export interface MenuState {
  show: Set<MenuId>
  disabled: Set<MenuId>
  renameLabel: string
  accessBoth: boolean
  itemKind: FloorItemKind | null
}

export interface MenuHandlers {
  editDetails: () => void
  rename: () => void
  rotate: (turn: Turn) => void
  duplicate: () => void
  copy: () => void
  /** null: the middle of the view. */
  paste: (at: Point | null) => void
  lock: (locked: boolean) => void
  group: () => void
  ungroup: () => void
  align: (edge: AlignEdge) => void
  distribute: (axis: Axis) => void
  remove: () => void
  setAccessBoth: (both: boolean) => void
  viewCubbies: () => void
  changeType: (kind: FloorItemKind) => void
  addHere: (tool: DrawTool, at: Point) => void
  selectAll: () => void
  fit: () => void
}

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

const LABELS: Record<MenuId, [label: string, shortcut?: string]> = {
  edit: ['Edit details'],
  rename: ['Rename'],
  rotateRight: ['Rotate right', 'R'],
  rotateLeft: ['Rotate left', '⇧R'],
  duplicate: ['Duplicate', `${MOD}D`],
  copy: ['Copy', `${MOD}C`],
  paste: ['Paste', `${MOD}V`],
  lock: ['Lock', 'L'],
  unlock: ['Unlock', 'L'],
  group: ['Group', `${MOD}G`],
  ungroup: ['Ungroup', `⇧${MOD}G`],
  align: ['Align'],
  distribute: ['Distribute'],
  delete: ['Delete', 'Del'],
  accessBoth: ['Access from both sides'],
  viewCubbies: ['View cubbies'],
  changeType: ['Change type'],
  addHere: ['Add here'],
  pasteHere: ['Paste here'],
  selectAll: ['Select all', `${MOD}A`],
  fit: ['Fit plan to screen'],
}

const ALIGN_ENTRIES: Array<[AlignEdge, string]> = [
  ['left', 'Left'], ['centre', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom'],
]
export const ADD_ENTRIES: Array<[DrawTool, string]> = [
  ['shelf', 'Shelf'], ['wall', 'Wall'], ['door', 'Door'], ['window', 'Window'], ['bench', 'Bench'], ['table', 'Table'],
  ['cabinet', 'Cabinet'], ['equipment', 'Equipment'], ['other', 'Other'],
]

/** What the menu shows for a target and the selection the canvas made for it. */
export function menuState(
  doc: EditorDoc, selection: ShapeRef[], target: MenuTarget | null, mode: 'view' | 'edit', canPaste: boolean,
  canLayout = true,
): MenuState {
  const show = new Set<MenuId>()
  const disabled = new Set<MenuId>()
  const st: MenuState = { show, disabled, renameLabel: 'Rename', accessBoth: false, itemKind: null }
  if (!target) return st

  if (mode === 'view') {
    if (target.kind === 'shape' && target.ref.kind === 'shelf') show.add('viewCubbies')
    show.add('fit')
    return st
  }
  if (!canLayout) {
    if (target.kind === 'shape' && target.ref.kind === 'shelf') show.add('viewCubbies')
    show.add('selectAll')
    show.add('fit')
    return st
  }
  if (target.kind === 'floor') {
    for (const id of ['addHere', 'pasteHere', 'selectAll', 'fit'] as const) show.add(id)
    if (!canPaste) disabled.add('pasteHere')
    return st
  }

  const group = selectionGroup(doc, selection)
  const single = selection.length === 1 ? selection[0] : null
  const anyLocked = selection.some((r) => shapeLocked(doc, r))
  const allLocked = selection.length > 0 && selection.every((r) => shapeLocked(doc, r))
  const hasRoom = selection.some((r) => r.kind === 'room')

  if (single || group) {
    show.add('edit')
    show.add('rename')
    if (group) st.renameLabel = 'Name group'
  }
  show.add('rotateRight')
  show.add('rotateLeft')
  if (anyLocked || hasRoom) { disabled.add('rotateRight'); disabled.add('rotateLeft') }
  show.add('duplicate')
  show.add('copy')
  show.add('paste')
  if (!canPaste) disabled.add('paste')
  show.add(allLocked ? 'unlock' : 'lock')
  if (selection.length >= 2 && !group) {
    show.add('group')
    if (hasRoom) disabled.add('group')
  }
  if (selection.some((r) => shapeGroupId(doc, r))) show.add('ungroup')
  if (selection.length >= 2) {
    show.add('align')
    show.add('distribute')
    if (selection.length < 3) disabled.add('distribute')
  }
  show.add('delete')
  if (anyLocked) disabled.add('delete')

  if (single?.kind === 'shelf') {
    show.add('accessBoth')
    show.add('viewCubbies')
    st.accessBoth = doc.shelves.find((s) => s.key === single.key)?.access_side === 'both'
  }
  if (single?.kind === 'item') {
    show.add('changeType')
    st.itemKind = doc.plan.items.find((i) => i.id === single.key)?.kind ?? null
  }
  if (single?.kind === 'room') {
    show.add('addHere')
    show.add('pasteHere')
    if (!canPaste) disabled.add('pasteHere')
  }
  return st
}

/** The canvas wrapped in a right-click menu; the canvas reports the target before the menu opens. */
export function CanvasContextMenu({ children, menu, target, on, onOpenChange }: {
  children: ReactNode
  menu: MenuState
  target: MenuTarget | null
  on: MenuHandlers
  onOpenChange?: (open: boolean) => void
}) {
  const at = target?.at ?? { x: 0, y: 0 }
  const item = (id: MenuId, run: () => void) => menu.show.has(id) && (
    <ContextMenuItem key={id} disabled={menu.disabled.has(id)} onSelect={run}>
      {id === 'rename' ? menu.renameLabel : LABELS[id][0]}
      {LABELS[id][1] && <ContextMenuShortcut>{LABELS[id][1]}</ContextMenuShortcut>}
    </ContextMenuItem>
  )
  const sub = (id: MenuId, children: ReactNode) => menu.show.has(id) && (
    <ContextMenuSub key={id}>
      <ContextMenuSubTrigger disabled={menu.disabled.has(id)}>{LABELS[id][0]}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44">{children}</ContextMenuSubContent>
    </ContextMenuSub>
  )

  const sections: ReactNode[][] = [
    [item('edit', on.editDetails), item('rename', on.rename)],
    [item('rotateRight', () => on.rotate(1)), item('rotateLeft', () => on.rotate(-1))],
    [item('duplicate', on.duplicate), item('copy', on.copy), item('paste', () => on.paste(null))],
    [
      item('lock', () => on.lock(true)), item('unlock', () => on.lock(false)),
      item('group', on.group), item('ungroup', on.ungroup),
      sub('align', ALIGN_ENTRIES.map(([edge, label]) => (
        <ContextMenuItem key={edge} onSelect={() => on.align(edge)}>{label}</ContextMenuItem>
      ))),
      sub('distribute', [
        <ContextMenuItem key="h" onSelect={() => on.distribute('h')}>Horizontally</ContextMenuItem>,
        <ContextMenuItem key="v" onSelect={() => on.distribute('v')}>Vertically</ContextMenuItem>,
      ]),
    ],
    [
      menu.show.has('accessBoth') && (
        <ContextMenuCheckboxItem key="accessBoth" checked={menu.accessBoth} onCheckedChange={(c) => on.setAccessBoth(c === true)}>
          {LABELS.accessBoth[0]}
        </ContextMenuCheckboxItem>
      ),
      item('viewCubbies', on.viewCubbies),
      sub('changeType', (
        <ContextMenuRadioGroup value={menu.itemKind ?? ''} onValueChange={(v) => on.changeType(v as FloorItemKind)}>
          {FLOOR_ITEM_KINDS.map((k) => <ContextMenuRadioItem key={k} value={k}>{FLOOR_ITEM_LABELS[k]}</ContextMenuRadioItem>)}
        </ContextMenuRadioGroup>
      )),
    ],
    [
      sub('addHere', ADD_ENTRIES.map(([tool, label]) => (
        <ContextMenuItem key={tool} onSelect={() => on.addHere(tool, at)}>{label}</ContextMenuItem>
      ))),
      item('pasteHere', () => on.paste(at)),
      item('selectAll', on.selectAll),
      item('fit', on.fit),
    ],
    [item('delete', on.remove)],
  ]
  const visible = sections.map((s) => s.filter(Boolean)).filter((s) => s.length > 0)

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>
        <div className="h-full w-full">{children}</div>
      </ContextMenuTrigger>
      {/* Keep focus where a handler puts it (Edit details focuses the side panel). */}
      <ContextMenuContent className="w-60" onCloseAutoFocus={(e) => e.preventDefault()}>
        {visible.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && <ContextMenuSeparator />}
            {s}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
