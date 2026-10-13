'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CubbySampleRow } from '@/lib/storage/cubby-samples'
import type { StorageCompany } from '@/lib/storage/layout'
import type { EditorShelf } from './editor-state'
import { ShelfFrontGrid } from './shelf-front-grid'
import { ZoneAssignBox } from './zone-assign-box'
import { ZoneHistory } from './zone-history'
import { cell, shelfZones, zoneCounts, type Cell, type CubbyPick, type PickMode } from './zones'
import type { ZoneStyle } from './zone-colors'

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'

export interface CubbyDisplayProps {
  laboratoryId: string
  /** The shelf shown; null closes the window. */
  shelf: EditorShelf | null
  mode: 'view' | 'edit'
  zones: Map<string, ZoneStyle>
  names: Map<string, string>
  pick: CubbyPick | null
  highlightCubbyId: string | null
  historyToken: number
  onClose: () => void
  onPick: (cell: Cell, mode: PickMode) => void
  onAssign: (company: StorageCompany | null) => void
}

interface CubbyContents { cubby: { id: string; code: string }; samples: CubbySampleRow[] }

/**
 * A shelf's cubbies, big, in a centered window (spec 2026-10-13 zone assignment
 * §4.6). Editing: pick cubbies and assign them to a client. Viewing: a cubby's
 * samples. Both: the shelf's zone history. Escape or X closes only this window.
 */
export function CubbyDisplay(props: CubbyDisplayProps) {
  const { shelf, onClose, highlightCubbyId } = props
  return (
    <Dialog open={shelf !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      {shelf && (
        <DialogContent data-cubby-display="" aria-describedby={undefined}
          className="flex h-[85vh] w-[90vw] max-w-[1200px] flex-col gap-0 rounded-[10px] p-0 sm:p-0">
          <DisplayBody key={`${shelf.key}:${highlightCubbyId ?? ''}`} {...props} shelf={shelf} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function DisplayBody({ laboratoryId, shelf, mode, zones, names, pick, highlightCubbyId, historyToken, onPick, onAssign }:
  CubbyDisplayProps & { shelf: EditorShelf }) {
  const zoneOf = useMemo(() => shelfZones(shelf), [shelf])
  const counts = useMemo(() => zoneCounts(shelf), [shelf])
  const picked = useMemo(() => new Set(pick?.shelfKey === shelf.key ? pick.cells : []), [pick, shelf.key])
  const [cubbyId, setCubbyId] = useState<string | null>(highlightCubbyId)
  // undefined: loading; null: could not be loaded.
  const [contents, setContents] = useState<CubbyContents | null | undefined>(undefined)

  useEffect(() => {
    if (mode !== 'view' || !cubbyId) return
    let alive = true
    setContents(undefined)
    fetch(`/api/laboratories/${laboratoryId}/storage/cubbies/${cubbyId}`)
      .then(async (res) => { if (alive) setContents(res.ok ? await res.json() : null) })
      .catch(() => { if (alive) setContents(null) })
    return () => { alive = false }
  }, [mode, cubbyId, laboratoryId])

  const total = shelf.rows * shelf.columns
  const n = picked.size
  const cubbies = `${n} ${n === 1 ? 'cubby' : 'cubbies'}`
  return (
    <>
      <DialogHeader className="space-y-1 border-b px-5 py-3 pr-12 text-left">
        <DialogTitle className="text-sm font-semibold">Shelf {shelf.shelf_letter}</DialogTitle>
        <p className="text-xs text-muted-foreground">
          {shelf.rows} rows × {shelf.columns} columns · {(total * shelf.samples_per_position).toLocaleString()} samples
        </p>
        {counts.size > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {[...counts].map(([id, count]) => (
              <li key={id} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: zones.get(id)?.color }} />
                {names.get(id) ?? 'Client'} · {count}
              </li>
            ))}
          </ul>
        )}
      </DialogHeader>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-5">
          <ShelfFrontGrid letter={shelf.shelf_letter} rows={shelf.rows} columns={shelf.columns}
            capacity={shelf.samples_per_position} cubbies={shelf.cubbies} zones={zones} zoneOf={zoneOf} names={names}
            picked={mode === 'edit' ? picked : undefined} highlightCubbyId={mode === 'view' ? cubbyId : null}
            onCubbyClick={(cubby, row, column, how) => {
              if (mode === 'edit') onPick(cell(row, column), how.toggle ? 'toggle' : how.range ? 'range' : 'only')
              else setCubbyId(cubby?.id ?? null)
            }} />
        </div>
        <aside className="w-[300px] shrink-0 space-y-4 overflow-y-auto border-l p-4">
          {mode === 'edit' ? (
            <section className="space-y-2">
              <p className="text-sm font-medium">{n > 0 ? `${cubbies} picked` : 'Whole shelf'}</p>
              <p className="text-xs text-muted-foreground">
                Click a cubby to pick it, {MOD}+click to add or remove one, Shift+click for a block.
              </p>
              <ZoneAssignBox label={n > 0 ? `Assign ${cubbies}` : 'Assign whole shelf'} onAssign={onAssign} />
            </section>
          ) : (
            <CubbySamples contents={cubbyId ? contents : null} picked={cubbyId !== null} />
          )}
          {shelf.id
            ? <ZoneHistory laboratoryId={laboratoryId} shelfId={shelf.id} pageSize={10} token={historyToken} />
            : <p className="text-xs text-muted-foreground">Save the plan to start this shelf&apos;s zone history.</p>}
        </aside>
      </div>
    </>
  )
}

function CubbySamples({ contents, picked }: { contents: CubbyContents | null | undefined; picked: boolean }) {
  if (!picked) return <p className="text-sm text-muted-foreground">Click a cubby to see its samples.</p>
  if (contents === undefined) return <p className="text-xs text-muted-foreground">Loading cubby…</p>
  if (contents === null) return <p className="text-xs text-muted-foreground">The cubby could not be loaded.</p>
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-semibold">{contents.cubby.code}</h4>
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
  )
}
