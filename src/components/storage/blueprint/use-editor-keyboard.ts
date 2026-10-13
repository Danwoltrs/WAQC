'use client'

import { useEffect, useRef } from 'react'
import { copySelection, shapeLocked, type EditorState } from './editor-state'
import { readClipboard, writeClipboard } from './clipboard'
import { isTypingTarget, type EditorActions } from './use-blueprint-editor'
import type { Point } from './blueprint-canvas'

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

/**
 * Every editing shortcut, listening on `document` (which a key reaches before
 * `window`, so an Escape that only clears the selection is handled before the
 * overlay's close listener). Keys in a field, inside an open menu or the cubby
 * display, or already handled (a closing menu's Escape) are left alone. The menu
 * shows the same keys.
 */
export function useEditorKeyboard(enabled: boolean, state: EditorState, actions: EditorActions, viewCentre: () => Point) {
  const latest = useRef({ state, viewCentre })
  latest.current = { state, viewCentre }

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return
      if (e.target instanceof Element && e.target.closest('[role="menu"], [data-cubby-display]')) return
      const { state: s, viewCentre: centre } = latest.current
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const has = s.selection.length > 0
      const run = (fn: () => void) => { e.preventDefault(); fn() }

      if (mod) {
        if (k === 'z') return run(() => (e.shiftKey ? actions.redo() : actions.undo()))
        if (k === 'a') return run(actions.selectAll)
        if (k === 'v') {
          const clip = readClipboard()
          if (clip) run(() => actions.paste(clip, centre()))
          return
        }
        if (!has) return
        if (k === 'c') {
          const clip = copySelection(s.doc, s.selection)
          if (clip) run(() => writeClipboard(clip))
          return
        }
        if (k === 'd') return run(actions.duplicate)
        if (k === 'g') return run(() => (e.shiftKey ? actions.ungroup() : actions.group()))
        return
      }

      if (e.key === 'Escape' && has) return run(() => actions.select([]))
      if (!has) return
      if (e.key === 'Delete' || e.key === 'Backspace') return run(actions.remove)
      if (k === 'r') return run(() => actions.rotate(e.shiftKey ? -1 : 1))
      if (k === 'l') return run(() => actions.lock(!s.selection.every((r) => shapeLocked(s.doc, r))))
      const n = NUDGE[e.key]
      if (n) {
        const step = e.shiftKey ? 1 : 10
        run(() => actions.nudge(n[0] * step, n[1] * step))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, actions])
}
