'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CubbySampleRow } from '@/lib/storage/cubby-samples'
import type { EditorDoc } from './editor-state'
import { ShelfFrontGrid } from './shelf-front-grid'
import type { ZoneStyle } from './zone-colors'

interface ViewPanelProps {
  laboratoryId: string
  doc: EditorDoc
  selectedShelfKey: string | null
  zones: Map<string, ZoneStyle>
  highlightCubbyId: string | null
  onFound: (shelfKey: string, cubbyId: string) => void
}

interface SearchMatch { sample_id: string; position_id: string; label: string }
interface CubbyContents { cubby: { id: string; code: string }; samples: CubbySampleRow[] }

export function ViewPanel({ laboratoryId, doc, selectedShelfKey, zones, highlightCubbyId, onFound }: ViewPanelProps) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [contents, setContents] = useState<CubbyContents | null>(null)
  const [loading, setLoading] = useState(false)
  const shelf = doc.shelves.find((s) => s.key === selectedShelfKey) ?? null

  const shelfOf = useCallback(
    (positionId: string) => doc.shelves.find((s) => s.cubbies.some((c) => c.id === positionId)) ?? null,
    [doc.shelves],
  )

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setMatches([]); return }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/laboratories/${laboratoryId}/storage/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const body = await res.json()
        setMatches(res.ok ? body.matches ?? [] : [])
      } catch {
        // aborted by the next keystroke
      }
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [query, laboratoryId])

  useEffect(() => {
    if (!highlightCubbyId) { setContents(null); return }
    let alive = true
    setLoading(true)
    fetch(`/api/laboratories/${laboratoryId}/storage/cubbies/${highlightCubbyId}`)
      .then(async (res) => { if (alive) setContents(res.ok ? await res.json() : null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [highlightCubbyId, laboratoryId])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8"
          placeholder="Find a sample: certificate, contract or ref" aria-label="Find a stored sample" />
      </div>

      {matches.length > 0 && (
        <ul className="divide-y border text-sm">
          {matches.map((m) => {
            const found = shelfOf(m.position_id)
            const code = found?.cubbies.find((c) => c.id === m.position_id)?.code ?? ''
            return (
              <li key={m.sample_id}>
                <button type="button" className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => found && onFound(found.key, m.position_id)}>
                  <span className="truncate">{m.label}</span>
                  <span className="shrink-0 text-muted-foreground">{code}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="text-xs text-muted-foreground">No stored sample matches.</p>
      )}

      {shelf ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Shelf {shelf.shelf_letter}</h3>
          <ShelfFrontGrid letter={shelf.shelf_letter} rows={shelf.rows} columns={shelf.columns}
            capacity={shelf.samples_per_position} cubbies={shelf.cubbies} zones={zones}
            highlightCubbyId={highlightCubbyId} onCubbyClick={(c) => c && onFound(shelf.key, c.id)} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Click a shelf to see its cubbies.</p>
      )}

      {loading && <p className="text-xs text-muted-foreground">Loading cubby…</p>}
      {contents && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">{contents.cubby.code}</h3>
          {contents.samples.length === 0 ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : (
            <ul className="divide-y border text-sm">
              {contents.samples.map((s) => (
                <li key={s.id} className="px-2 py-1.5">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.client || null, s.contract ? `#${s.contract}` : null].filter(Boolean).join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
