'use client'

import { useEffect, useMemo, useReducer } from 'react'
import { EMPTY_FLOOR_PLAN, type Rect } from '@/lib/storage/floor-plan'
import {
  editorReducer, initialEditorState, type DrawTool, type EditorDoc, type ShapePatch, type ShapeRef, type Tool,
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
    select: (ref: ShapeRef | null) => dispatch({ type: 'select', ref }),
    checkpoint: () => dispatch({ type: 'checkpoint' }),
    add: (shape: DrawTool, rect: Rect) => dispatch({ type: 'add', shape, rect, id: newId() }),
    patch: (ref: ShapeRef, patch: ShapePatch, record = false) => dispatch({ type: 'patch', ref, patch, record }),
    rotate: (ref: ShapeRef) => dispatch({ type: 'rotate', ref }),
    remove: (ref: ShapeRef) => dispatch({ type: 'delete', ref }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
  }), [])
  // `actions` never changes identity, so callers can list it in effect dependencies.
  return { state, actions }
}

export type EditorActions = ReturnType<typeof useBlueprintEditor>['actions']

/**
 * Delete, R, Escape, Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z while editing. Listens on
 * `document`, which an event reaches before `window`, so an Escape that only
 * deselects is marked handled before the overlay's window listener sees it.
 */
export function useEditorKeyboard(enabled: boolean, selected: ShapeRef | null, actions: EditorActions) {
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
      if (e.key === 'Escape' && selected) {
        e.preventDefault()
        actions.select(null)
        return
      }
      if (!selected) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        actions.remove(selected)
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        actions.rotate(selected)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, selected, actions])
}
