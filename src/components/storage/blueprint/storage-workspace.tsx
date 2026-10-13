'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Maximize, Pencil, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import type { StorageCompany, StorageLayout } from '@/lib/storage/layout'
import { copySelection, defaultRect, fromLayout, planShift, toSavePayload, type ShapeRef } from './editor-state'
import { useBlueprintEditor } from './use-blueprint-editor'
import { useEditorKeyboard } from './use-editor-keyboard'
import { BlueprintCanvas, type MenuTarget, type Point } from './blueprint-canvas'
import { CanvasContextMenu, menuState, type MenuHandlers } from './canvas-context-menu'
import { readClipboard, writeClipboard } from './clipboard'
import { Inspector } from './inspector'
import type { FocusTarget } from './inspector-fields'
import { ToolPalette } from './tool-palette'
import { ViewPanel } from './view-panel'
import { zoneStyles } from './zone-colors'
import { carryZoneEdits, zoneChanges, zoneCounts } from './zones'
import { CubbyDisplay } from './cubby-display'

interface StorageWorkspaceProps {
  laboratoryId: string
  initialMode?: 'view' | 'edit'
  onDirtyChange?: (dirty: boolean) => void
  /** Never offer Edit here, e.g. an embed with no unsaved-changes guard. */
  readOnly?: boolean
}

/** Where Paste puts shapes before the view has reported its centre. */
const DEFAULT_CENTRE: Point = { x: 500, y: 350 }

export function StorageWorkspace({ laboratoryId, initialMode = 'view', onDirtyChange, readOnly = false }: StorageWorkspaceProps) {
  const [layout, setLayout] = useState<StorageLayout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<{ message: string; items: string[] } | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [highlight, setHighlight] = useState<{ shelfKey: string; cubbyId: string } | null>(null)
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null)
  const [canPaste, setCanPaste] = useState(false)
  const viewCentre = useRef<Point | null>(null)
  const asideRef = useRef<HTMLElement>(null)
  const [openShelf, setOpenShelf] = useState<string | null>(null)
  /** Clients assigned in this session, so the legend and colours know them before Save. */
  const [assigned, setAssigned] = useState<StorageCompany[]>([])
  const [historyToken, setHistoryToken] = useState(0)
  const { state, actions } = useBlueprintEditor()

  const load = useCallback(async () => {
    setLoadError(null)
    const res = await fetch(`/api/laboratories/${laboratoryId}/storage`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(body.error || 'Failed to load storage'); return }
    setLayout(body)
    setAssigned([])
    actions.load(fromLayout(body), body.can_edit === true && !readOnly)
    setFitToken((t) => t + 1)
    if (initialMode === 'edit' && (body.can_edit || body.can_assign) && !readOnly) setMode('edit')
  }, [laboratoryId, initialMode, readOnly, actions])

  useEffect(() => { load() }, [load])
  useEffect(() => { onDirtyChange?.(state.dirty) }, [state.dirty, onDirtyChange])
  useEffect(() => { if (state.notice) toast({ title: state.notice.text }) }, [state.notice])
  useEditorKeyboard(mode === 'edit', state, actions, () => viewCentre.current ?? DEFAULT_CENTRE)

  const companies = useMemo(() => {
    const all = [...(layout?.companies ?? [])]
    for (const c of assigned) if (!all.some((x) => x.id === c.id)) all.push(c)
    return all
  }, [layout, assigned])
  const zones = useMemo(() => zoneStyles(companies.map((c) => c.id)), [companies])
  const names = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies])
  const inUse = useMemo(() => {
    const ids = new Set(state.doc.shelves.flatMap((s) => [...zoneCounts(s).keys()]))
    return companies.filter((c) => ids.has(c.id))
  }, [companies, state.doc.shelves])

  const assign = (company: StorageCompany | null) => {
    if (company && !companies.some((c) => c.id === company.id)) setAssigned((a) => [...a, company])
    actions.assignZone(company?.id ?? null)
  }

  const select = (refs: ShapeRef[], exact = false) => {
    actions.select(refs, exact)
    const only = refs.length === 1 ? refs[0] : null
    if (!only || only.kind !== 'shelf' || only.key !== highlight?.shelfKey) setHighlight(null)
  }

  /** Put the cursor in a side-panel field once the menu has closed. */
  const focusPanel = (field: FocusTarget) => {
    window.setTimeout(() => {
      const aside = asideRef.current
      const el = aside?.querySelector<HTMLInputElement>(`[data-focus="${field}"]`)
        ?? aside?.querySelector<HTMLInputElement>('[data-focus]')
      el?.focus()
    }, 0)
  }

  const save = async () => {
    if (!layout) return
    setSaving(true)
    setConflicts(null)
    // Shapes pushed past the plan's corner: the save moves everything back to start at 0, 0.
    const shift = state.canLayout ? planShift(state.doc) : { dx: 0, dy: 0 }
    const put = (path: string, payload: unknown) => fetch(`/api/laboratories/${laboratoryId}/storage${path}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    try {
      let fresh: StorageLayout = layout
      if (state.canLayout) {
        const res = await put('', toSavePayload(state.doc))
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setConflicts({ message: body.error || 'Failed to save the floor plan', items: body.conflicts ?? [] })
          return
        }
        fresh = body
      }
      const changes = zoneChanges(state.doc, fresh)
      if (changes.length > 0) {
        const res = await put('/zones', { changes })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          // The layout may be saved already: take it, keep the zone edits, stay unsaved so Save retries them.
          if (fresh !== layout) {
            setLayout(fresh)
            actions.saved(carryZoneEdits(fromLayout(fresh), state.doc), shift, true)
          }
          setConflicts({ message: body.error || 'Failed to save the zones', items: [] })
          return
        }
        fresh = body
      }
      setLayout(fresh)
      actions.saved(fromLayout(fresh), shift)
      setHistoryToken((t) => t + 1)
      toast({ title: 'Floor plan saved' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="p-6 text-sm">
        <p className="text-red-600">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>Try again</Button>
      </div>
    )
  }
  if (!layout) return <div className="p-6 text-sm text-muted-foreground">Loading storage…</div>

  const single = state.selection.length === 1 ? state.selection[0] : null
  const selectedShelfKey = single?.kind === 'shelf' ? single.key : null
  const menu = menuState(state.doc, state.selection, menuTarget, mode, canPaste, state.canLayout)
  const menuHandlers: MenuHandlers = {
    editDetails: () => focusPanel('first'),
    rename: () => focusPanel('name'),
    rotate: actions.rotate,
    duplicate: actions.duplicate,
    copy: () => {
      const clip = copySelection(state.doc, state.selection)
      if (clip) writeClipboard(clip)
    },
    paste: (at) => {
      const clip = readClipboard()
      if (clip) actions.paste(clip, at ?? viewCentre.current ?? DEFAULT_CENTRE)
    },
    lock: actions.lock,
    group: actions.group,
    ungroup: actions.ungroup,
    align: actions.align,
    distribute: actions.distribute,
    remove: actions.remove,
    setAccessBoth: (both) => {
      if (single?.kind === 'shelf') actions.patch(single, { access_side: both ? 'both' : 'front' }, true)
    },
    viewCubbies: () => {
      if (menuTarget?.kind !== 'shape') return
      select([menuTarget.ref], true)
      if (menuTarget.ref.kind === 'shelf') setOpenShelf(menuTarget.ref.key)
    },
    changeType: (kind) => {
      if (single?.kind === 'item') actions.patch(single, { kind }, true)
    },
    addHere: (tool, at) => actions.add(tool, defaultRect(tool, at)),
    selectAll: actions.selectAll,
    fit: () => setFitToken((t) => t + 1),
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="text-xs text-muted-foreground">
          {layout.shelves.length} shelves · {layout.laboratory.storage_capacity.toLocaleString()} samples capacity
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Fit to screen" onClick={() => setFitToken((t) => t + 1)}>
            <Maximize className="h-4 w-4" />
          </Button>
          {mode === 'edit' && (
            <>
              <Button variant="ghost" size="sm" aria-label="Undo" disabled={state.past.length === 0} onClick={actions.undo}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Redo" disabled={state.future.length === 0} onClick={actions.redo}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {(layout.can_edit || layout.can_assign) && !readOnly && (
            mode === 'view' ? (
              <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
                <Pencil className="mr-1.5 h-4 w-4" />Edit
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={state.dirty}
                title={state.dirty ? 'Save or undo your changes first' : undefined}
                onClick={() => { setMode('view'); actions.setTool('select') }}>
                <Eye className="mr-1.5 h-4 w-4" />View
              </Button>
            )
          )}
          {mode === 'edit' && (
            <Button size="sm" disabled={!state.dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
          )}
        </div>
      </div>

      {conflicts && (
        <div role="alert" className="border-b border-red-500/40 bg-red-500/5 px-4 py-2 text-sm">
          <p className="font-medium text-red-600">{conflicts.message}</p>
          {conflicts.items.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-600">
              {conflicts.items.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {mode === 'edit' && state.canLayout && <ToolPalette tool={state.tool} onTool={actions.setTool} />}
        <div className="relative min-w-0 flex-1">
          <CanvasContextMenu menu={menu} target={menuTarget} on={menuHandlers}
            onOpenChange={(open) => { if (open) setCanPaste(readClipboard() !== null) }}>
            <BlueprintCanvas
              doc={state.doc} mode={mode} tool={state.tool} selection={state.selection} zones={zones}
              highlightShelfKey={highlight?.shelfKey ?? null} fitToken={fitToken} viewCentre={viewCentre} shift={state.shift}
              onSelect={select} onToggle={actions.toggle} onCheckpoint={actions.checkpoint}
              onPatchMany={(patches) => actions.patchMany(patches, false)} onAdd={actions.add}
              onContextTarget={setMenuTarget} canLayout={state.canLayout} onOpenShelf={setOpenShelf}
            />
          </CanvasContextMenu>
          {mode === 'edit' && state.canLayout && state.doc.plan.rooms.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border bg-background px-3 py-1.5 text-xs">
              Draw the room first: pick Room and drag out its walls.
            </div>
          )}
          {inUse.length > 0 && (
            <ul className="absolute bottom-3 right-3 space-y-1 rounded-md border bg-background p-2 text-[11px]">
              {inUse.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: zones.get(c.id)?.color }} />
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside ref={asideRef} className="w-80 shrink-0 overflow-y-auto border-l p-4">
          {mode === 'edit' ? (
            <Inspector doc={state.doc} selection={state.selection} zones={zones} names={names} canLayout={state.canLayout}
              onPatch={(ref, patch) => actions.patch(ref, patch, true)} onRotate={() => actions.rotate(1)}
              onDelete={actions.remove} onLock={actions.lock} onGroup={actions.group} onUngroup={actions.ungroup}
              onRenameGroup={actions.renameGroup} onAlign={actions.align} onDistribute={actions.distribute}
              onOpenShelf={setOpenShelf} onAssign={assign} />
          ) : (
            <ViewPanel laboratoryId={laboratoryId} doc={state.doc} selectedShelfKey={selectedShelfKey} zones={zones}
              names={names} historyToken={historyToken} onOpenShelf={setOpenShelf}
              onFound={(shelfKey, cubbyId) => {
                actions.select([{ kind: 'shelf', key: shelfKey }], true)
                setHighlight({ shelfKey, cubbyId })
                setOpenShelf(shelfKey)
              }} />
          )}
        </aside>
      </div>
      <CubbyDisplay laboratoryId={laboratoryId} shelf={state.doc.shelves.find((s) => s.key === openShelf) ?? null}
        mode={mode} zones={zones} names={names} pick={state.cubbyPick}
        highlightCubbyId={highlight && highlight.shelfKey === openShelf ? highlight.cubbyId : null}
        historyToken={historyToken}
        onClose={() => { setOpenShelf(null); actions.clearPick() }}
        onPick={(c, how) => { if (openShelf) actions.pickCubby(openShelf, c, how) }}
        onAssign={assign} />
    </div>
  )
}
