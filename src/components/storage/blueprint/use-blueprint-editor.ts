'use client'

import { useEffect, useMemo, useReducer } from 'react'
import { EMPTY_FLOOR_PLAN, type Rect } from '@/lib/storage/floor-plan'
import type { AlignEdge, Axis, Turn } from '@/lib/storage/arrange'
import {
  editorReducer, initialEditorState,
  type Clip, type DrawTool, type EditorDoc, type RefPatch, type ShapePatch, type ShapeRef, type Tool,
} from './editor-state'

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function useBlueprintEditor() {
  const [state, dispatch] = useReducer(editorReducer, { plan: EMPTY_FLOOR_PLAN, shelves: [] }, initialEditorState)
  const actions = useMemo(() => ({
    load: (doc: EditorDoc) => dispatch({ type: 'load', doc }),
    saved: (doc: EditorDoc) => dispatch({ type: 'saved', doc }),
    setTool: (tool: Tool) => dispatch({ type: 'tool', tool }),
    select: (refs: ShapeRef[], exact = false) => dispatch({ type: 'select', refs, exact }),
    toggle: (ref: ShapeRef) => dispatch({ type: 'toggle', ref }),
    selectAll: () => dispatch({ type: 'selectAll' }),
    checkpoint: () => dispatch({ type: 'checkpoint' }),
    add: (shape: DrawTool, rect: Rect) => dispatch({ type: 'add', shape, rect, id: newId() }),
    patch: (ref: ShapeRef, patch: ShapePatch, record = false) => dispatch({ type: 'patch', ref, patch, record }),
    patchMany: (patches: RefPatch[], record = false) => dispatch({ type: 'patchMany', patches, record }),
    rotate: (turn: Turn = 1) => dispatch({ type: 'rotate', turn }),
    nudge: (dx: number, dy: number) => dispatch({ type: 'nudge', dx, dy }),
    lock: (locked: boolean) => dispatch({ type: 'lock', locked }),
    remove: () => dispatch({ type: 'delete' }),
    group: () => dispatch({ type: 'group', id: newId() }),
    ungroup: () => dispatch({ type: 'ungroup' }),
    renameGroup: (id: string, name: string | null) => dispatch({ type: 'renameGroup', id, name }),
    align: (edge: AlignEdge) => dispatch({ type: 'align', edge }),
    distribute: (axis: Axis) => dispatch({ type: 'distribute', axis }),
    duplicate: () => dispatch({ type: 'duplicate', seed: newId() }),
    paste: (clip: Clip, at: { x: number; y: number }) => dispatch({ type: 'paste', clip, at, seed: newId() }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
  }), [])
  // `actions` never changes identity, so callers can list it in effect dependencies.
  return { state, actions }
}

export type EditorActions = ReturnType<typeof useBlueprintEditor>['actions']

/**
 * Delete, R, Shift+R, Escape, Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z while editing.
 * Listens on `document`, which an event reaches before `window`, so an Escape
 * that only clears the selection is handled before the overlay's listener.
 */
export function useEditorKeyboard(enabled: boolean, selection: ShapeRef[], actions: EditorActions) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) actions.redo()
        else actions.undo()
        return
      }
      if (e.key === 'Escape' && selection.length > 0) {
        e.preventDefault()
        actions.select([])
        return
      }
      if (selection.length === 0 || mod) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        actions.remove()
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        actions.rotate(e.shiftKey ? -1 : 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, selection, actions])
}
