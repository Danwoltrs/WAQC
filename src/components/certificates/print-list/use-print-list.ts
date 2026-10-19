'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { certificateListUrl } from '@/lib/certificate-list-query'
import {
  MAX_PRINT_LIST,
  readPrintList,
  toPrintListEntry,
  writePrintList,
  type PrintListEntry,
  type PrintListSource,
} from '@/lib/print-list'

export interface PrintList {
  entries: PrintListEntry[]
  count: number
  full: boolean
  ready: boolean
  has(id: string): boolean
  /** false = refused (the list is full, or it is not ready / has no user yet). */
  toggle(cert: PrintListSource): boolean
  /** How many were added (cap respected, duplicates skipped). */
  addMany(certs: PrintListSource[]): number
  remove(id: string): void
  removeMany(ids: string[]): void
  clear(): void
  restore(entries: PrintListEntry[]): void
}

interface State {
  owner: string | null
  entries: PrintListEntry[]
  ready: boolean
}

const EMPTY: PrintListEntry[] = []

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Keep the first occurrence of each id, never more than MAX_PRINT_LIST. */
function dedupeCapped(entries: PrintListEntry[]): PrintListEntry[] {
  const seen = new Set<string>()
  const out: PrintListEntry[] = []
  for (const e of entries) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push(e)
    if (out.length >= MAX_PRINT_LIST) break
  }
  return out
}

export function usePrintList(
  userId: string | null,
  opts?: { onRestored?: (r: { kept: number; dropped: number }) => void },
): PrintList {
  const user = userId ? userId : null
  const [state, setState] = useState<State>({ owner: null, entries: EMPTY, ready: false })
  // The ref is the source of truth for mutators, so toggle can answer synchronously.
  const ref = useRef<State>(state)
  const onRestoredRef = useRef(opts?.onRestored)
  onRestoredRef.current = opts?.onRestored

  const commit = useCallback((next: State) => {
    ref.current = next
    setState(next)
  }, [])

  useEffect(() => {
    if (!user) {
      commit({ owner: null, entries: EMPTY, ready: false })
      return
    }
    const stored = dedupeCapped(readPrintList(getStorage(), user))
    commit({ owner: user, entries: stored, ready: stored.length === 0 })
    if (stored.length === 0) return

    const controller = new AbortController()
    let ignore = false
    const finish = (entries: PrintListEntry[]) => {
      if (ignore) return
      commit({ owner: user, entries, ready: true })
      return true
    }
    ;(async () => {
      try {
        const res = await fetch(certificateListUrl({ ids: stored.map((e) => e.id) }), {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
        const body = (await res.json()) as { certificates?: PrintListSource[] }
        const fresh = new Map<string, PrintListEntry>()
        for (const c of body.certificates ?? []) fresh.set(c.id, toPrintListEntry(c))
        const kept = stored.flatMap((e) => {
          const f = fresh.get(e.id)
          return f ? [f] : []
        })
        if (finish(kept)) {
          writePrintList(getStorage(), user, kept)
          onRestoredRef.current?.({ kept: kept.length, dropped: stored.length - kept.length })
        }
      } catch {
        // Offline or failed: keep the stored entries as they were.
        finish(stored)
      }
    })()
    return () => {
      ignore = true
      controller.abort()
    }
  }, [user, commit])

  // Until the effect has switched to this user, show nothing of the previous one.
  const current = state.owner === user && user ? state : null
  const entries = current?.entries ?? EMPTY
  const ready = current?.ready ?? false

  const apply = useCallback(
    (fn: (entries: PrintListEntry[]) => PrintListEntry[]) => {
      const cur = ref.current
      if (!cur.owner || !cur.ready || cur.owner !== user) return
      const next = fn(cur.entries)
      if (next === cur.entries) return
      writePrintList(getStorage(), cur.owner, next)
      commit({ ...cur, entries: next })
    },
    [user, commit],
  )

  const has = useCallback((id: string) => entries.some((e) => e.id === id), [entries])

  const toggle = useCallback(
    (cert: PrintListSource): boolean => {
      const cur = ref.current
      if (!cur.owner || !cur.ready || cur.owner !== user) return false
      if (cur.entries.some((e) => e.id === cert.id)) {
        apply((list) => list.filter((e) => e.id !== cert.id))
        return true
      }
      if (cur.entries.length >= MAX_PRINT_LIST) return false
      apply((list) => [...list, toPrintListEntry(cert)])
      return true
    },
    [user, apply],
  )

  const addMany = useCallback(
    (certs: PrintListSource[]): number => {
      const cur = ref.current
      if (!cur.owner || !cur.ready || cur.owner !== user) return 0
      const have = new Set(cur.entries.map((e) => e.id))
      const added: PrintListEntry[] = []
      for (const c of certs) {
        if (cur.entries.length + added.length >= MAX_PRINT_LIST) break
        if (have.has(c.id)) continue
        have.add(c.id)
        added.push(toPrintListEntry(c))
      }
      if (added.length > 0) apply((list) => [...list, ...added])
      return added.length
    },
    [user, apply],
  )

  const remove = useCallback(
    (id: string) => apply((list) => (list.some((e) => e.id === id) ? list.filter((e) => e.id !== id) : list)),
    [apply],
  )

  const removeMany = useCallback(
    (ids: string[]) => {
      const drop = new Set(ids)
      apply((list) => (list.some((e) => drop.has(e.id)) ? list.filter((e) => !drop.has(e.id)) : list))
    },
    [apply],
  )

  const clear = useCallback(() => apply((list) => (list.length === 0 ? list : EMPTY)), [apply])

  const restore = useCallback(
    (restored: PrintListEntry[]) => apply(() => dedupeCapped(restored)),
    [apply],
  )

  return {
    entries,
    count: entries.length,
    full: entries.length >= MAX_PRINT_LIST,
    ready,
    has,
    toggle,
    addMany,
    remove,
    removeMany,
    clear,
    restore,
  }
}
