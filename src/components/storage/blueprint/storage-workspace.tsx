'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Maximize, Pencil, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import type { StorageLayout } from '@/lib/storage/layout'
import { fromLayout, toSavePayload, type ShapeRef } from './editor-state'
import { useBlueprintEditor, useEditorKeyboard } from './use-blueprint-editor'
import { BlueprintCanvas } from './blueprint-canvas'
import { Inspector } from './inspector'
import { ToolPalette } from './tool-palette'
import { ViewPanel } from './view-panel'
import { zoneStyles } from './zone-colors'

interface StorageWorkspaceProps {
  laboratoryId: string
  initialMode?: 'view' | 'edit'
  onDirtyChange?: (dirty: boolean) => void
  /** Never offer Edit here, e.g. an embed with no unsaved-changes guard. */
  readOnly?: boolean
}

export function StorageWorkspace({ laboratoryId, initialMode = 'view', onDirtyChange, readOnly = false }: StorageWorkspaceProps) {
  const [layout, setLayout] = useState<StorageLayout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<{ message: string; items: string[] } | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [highlight, setHighlight] = useState<{ shelfKey: string; cubbyId: string } | null>(null)
  const { state, actions } = useBlueprintEditor()

  const load = useCallback(async () => {
    setLoadError(null)
    const res = await fetch(`/api/laboratories/${laboratoryId}/storage`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(body.error || 'Failed to load storage'); return }
    setLayout(body)
    actions.load(fromLayout(body))
    setFitToken((t) => t + 1)
    if (initialMode === 'edit' && body.can_edit && !readOnly) setMode('edit')
  }, [laboratoryId, initialMode, readOnly, actions])

  useEffect(() => { load() }, [load])
  useEffect(() => { onDirtyChange?.(state.dirty) }, [state.dirty, onDirtyChange])
  useEditorKeyboard(mode === 'edit', state.selected, actions)

  const zones = useMemo(() => zoneStyles((layout?.companies ?? []).map((c) => c.id)), [layout])

  const select = (ref: ShapeRef | null) => {
    actions.select(ref)
    if (!ref || ref.kind !== 'shelf' || ref.key !== highlight?.shelfKey) setHighlight(null)
  }

  const save = async () => {
    setSaving(true)
    setConflicts(null)
    try {
      const res = await fetch(`/api/laboratories/${laboratoryId}/storage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSavePayload(state.doc)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConflicts({ message: body.error || 'Failed to save the floor plan', items: body.conflicts ?? [] })
        return
      }
      setLayout(body)
      actions.saved(fromLayout(body))
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

  const selectedShelfKey = state.selected?.kind === 'shelf' ? state.selected.key : null
  const companiesInUse = layout.companies

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
          {layout.can_edit && !readOnly && (
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
        {mode === 'edit' && <ToolPalette tool={state.tool} onTool={actions.setTool} />}
        <div className="relative min-w-0 flex-1">
          <BlueprintCanvas
            doc={state.doc} mode={mode} tool={state.tool} selected={state.selected} zones={zones}
            highlightShelfKey={highlight?.shelfKey ?? null} fitToken={fitToken}
            onSelect={select} onCheckpoint={actions.checkpoint}
            onPatch={(ref, patch) => actions.patch(ref, patch, false)} onAdd={actions.add}
          />
          {mode === 'edit' && state.doc.plan.rooms.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border bg-background px-3 py-1.5 text-xs">
              Draw the room first: pick Room and drag out its walls.
            </div>
          )}
          {companiesInUse.length > 0 && (
            <ul className="absolute bottom-3 right-3 space-y-1 rounded-md border bg-background p-2 text-[11px]">
              {companiesInUse.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: zones.get(c.id)?.color }} />
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">
          {mode === 'edit' ? (
            <Inspector doc={state.doc} selected={state.selected} zones={zones}
              onPatch={(ref, patch) => actions.patch(ref, patch, true)} onRotate={actions.rotate} onDelete={actions.remove} />
          ) : (
            <ViewPanel laboratoryId={laboratoryId} doc={state.doc} selectedShelfKey={selectedShelfKey} zones={zones}
              highlightCubbyId={highlight?.cubbyId ?? null}
              onFound={(shelfKey, cubbyId) => { actions.select({ kind: 'shelf', key: shelfKey }); setHighlight({ shelfKey, cubbyId }) }} />
          )}
        </aside>
      </div>
    </div>
  )
}
