# Storage Zone Assignment Implementation Plan, Part B (cubby display, panels, wiring)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shelf's cubbies open big in a centered window where lab staff pick cubbies and assign them to a client; side panels summarise shelves and assign several at once; Save writes layout then zones; history shows per shelf and per lab.

**Architecture:** Builds on Part A (`2026-10-13-storage-zone-assignment-part-a.md`): `zones.ts` helpers, `EditorState.cubbyPick` / `canLayout`, `assignZone`, and the zones and zone-history routes. New components: `ZoneAssignBox` (QC client search + assign button), `ZoneHistory`, `ShelfSummary`, `CubbyDisplay` (Radix Dialog). The workspace owns which shelf is open and runs the two-step save.

**Tech Stack:** Next.js 15, React, TypeScript, Radix Dialog (shadcn `@/components/ui/dialog`), Vitest 2 + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-13-storage-zone-assignment-design.md`

## Global Constraints

- Never render `samples.tracking_number` (SAN). A cubby's samples list shows the existing `cubby-samples` label (certificate number or contract refs).
- Client names: the clients API's `company` (trade name) first, then `name`; zone names from the layout come through `companyDisplayName` already.
- No emojis. Inter, black/white; the cubby window has 10 px corners, buttons 6 px, list options 4 px, cubbies and grids square.
- Keep every file under ~2000 lines.
- Commit to `main`; push only after Daniel has applied `20261013000002_storage_zone_assignment.sql` and its scenario script ran clean.
- Test commands: `npx vitest run <paths>`; type check `npx tsc --noEmit -p .`.

## Review Focus

1. Escape inside the cubby window closes only the window, never the storage screen (Task 9, overlay test with the real Radix Dialog).
2. The zones step fails after the layout step saved: the edits stay, Save stays enabled, and the retry sends the same zones; the editor takes the saved layout (shelf ids included), so new shelves are not inserted twice (Task 9 workspace failure test; `carryZoneEdits` unit test in Part A Task 3).
3. Lab staff without layout rights see no drawing tools and their Save never calls the layout PUT (Task 9, staff test).
4. The client search shows trade names and General first; nothing is assigned until a choice is made (Task 6, ZoneAssignBox tests).
5. A shelf drawn in this session (no id yet) opens its cubbies without a history request that would 400 (Task 7, display test for a new shelf).

---

### Task 6: Large front grid, client box, history list

**Files:**
- Modify: `src/components/storage/blueprint/shelf-front-grid.tsx` (whole file)
- Modify: `src/components/storage/blueprint/shelf-front-grid.test.tsx`
- Create: `src/components/storage/blueprint/zone-assign-box.tsx`, `zone-assign-box.test.tsx`
- Create: `src/components/storage/blueprint/zone-history.tsx`, `zone-history.test.tsx`

**Interfaces:**
- Consumes: `Cell`, `cell` (Part A Task 3); `ZoneEvent` (Part A Task 2); `StorageCompany` (`src/lib/storage/layout.ts`: `{ id: string; name: string }`).
- Produces:
  - `ShelfFrontGrid` props `zoneOf?: Map<Cell, string | null>`, `names?: Map<string, string>`, `picked?: ReadonlySet<Cell>`, `onCubbyClick?: (cubby: Cubby | null, row: number, column: number, how: CubbyClick) => void`; `interface CubbyClick { toggle: boolean; range: boolean }`
  - `ZoneAssignBox({ label: string; onAssign: (company: StorageCompany | null) => void })`
  - `zoneEventLine(e: ZoneEvent): { when: string; who: string; what: string }`, `ZoneHistory({ laboratoryId: string; shelfId: string | null; pageSize: number; token: number })`

- [ ] **Step 1: Write the failing tests**

`shelf-front-grid.test.tsx`: in the existing test change the last assertion to
`expect(onCubbyClick).toHaveBeenCalledWith(cubby, 1, 2, { toggle: false, range: false })`, and add:

```tsx
  it('reports Cmd/Ctrl and Shift, outlines picked cubbies, and names the client of a pending zone', () => {
    const onCubbyClick = vi.fn()
    render(
      <ShelfFrontGrid letter="B" rows={1} columns={2} capacity={42} cubbies={[]} zones={zoneStyles(['co-1'])}
        zoneOf={new Map([['1:1', 'co-1'], ['1:2', null]])} names={new Map([['co-1', 'Ahold']])}
        picked={new Set(['1:2'])} onCubbyClick={onCubbyClick} />,
    )
    expect(screen.getByTestId('cubby-B-A1')).toHaveTextContent('Ahold')
    expect(screen.getByTestId('cubby-B-A2')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('cubby-B-A1'), { metaKey: true })
    expect(onCubbyClick).toHaveBeenLastCalledWith(null, 1, 1, { toggle: true, range: false })
    fireEvent.click(screen.getByTestId('cubby-B-A2'), { shiftKey: true })
    expect(onCubbyClick).toHaveBeenLastCalledWith(null, 1, 2, { toggle: false, range: true })
  })
```

`zone-assign-box.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ZoneAssignBox } from './zone-assign-box'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({
    clients: String(url).includes('search=aho') ? [{ id: 'co-1', name: 'Ahold Delhaize USA', company: 'Ahold' }] : [],
  }))))
})

describe('ZoneAssignBox', () => {
  it('offers General first and assigns nothing until a choice is made', () => {
    const onAssign = vi.fn()
    render(<ZoneAssignBox label="Assign 4 cubbies" onAssign={onAssign} />)
    const assign = screen.getByRole('button', { name: 'Assign 4 cubbies' })
    expect(assign).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'General (no client)' }))
    fireEvent.click(assign)
    expect(onAssign).toHaveBeenCalledWith(null)
  })

  it('searches QC clients and assigns the one picked, by trade name', async () => {
    const onAssign = vi.fn()
    render(<ZoneAssignBox label="Assign whole shelf" onAssign={onAssign} />)
    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'aho' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Ahold' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign whole shelf' }))
    expect(onAssign).toHaveBeenCalledWith({ id: 'co-1', name: 'Ahold' })
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/clients?search=aho'))).toBe(true)
  })
})
```

`zone-history.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ZoneHistory, zoneEventLine } from './zone-history'

describe('zoneEventLine', () => {
  it('writes the time, who, the cubbies in shelf order and the change', () => {
    const at = new Date(2026, 9, 13, 14, 2).toISOString()
    const codes = ['B-A10', 'B-A2', 'B-A1', 'B-A3', 'B-A4', 'B-A5', 'B-A6', 'B-A7', 'B-A8', 'B-A9']
    expect(zoneEventLine({ changed_at: at, changed_by_name: 'Daniel Wolthers', from_name: null, to_name: 'Ahold', codes })).toEqual({
      when: '13 Oct 14:02',
      who: 'Daniel Wolthers',
      what: 'B-A1, B-A2, B-A3, B-A4, B-A5, B-A6, B-A7, B-A8 +2 more: General → Ahold',
    })
  })
})

describe('ZoneHistory', () => {
  it("loads one shelf's history and says when there is none", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [] })))
    vi.stubGlobal('fetch', fetchMock)
    render(<ZoneHistory laboratoryId="lab" shelfId="s-1" pageSize={10} token={0} />)
    expect(await screen.findByText('No zone changes yet')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/laboratories/lab/storage/zone-history?limit=10&shelf=s-1')
  })

  it('says the history is unavailable when it fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    render(<ZoneHistory laboratoryId="lab" shelfId={null} pageSize={20} token={0} />)
    expect(await screen.findByText('Zone history unavailable')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/shelf-front-grid.test.tsx src/components/storage/blueprint/zone-assign-box.test.tsx src/components/storage/blueprint/zone-history.test.tsx`
Expected: FAIL: the click reports three arguments, no client name or `aria-pressed`; `./zone-assign-box` and `./zone-history` cannot be resolved.

- [ ] **Step 3: Implement**

`shelf-front-grid.tsx`, whole file:

```tsx
'use client'

import { Fragment, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { rowLetter } from '@/lib/storage/floor-plan'
import type { Cubby } from '@/lib/storage/layout'
import { cell, type Cell } from './zones'
import type { ZoneStyle } from './zone-colors'

/** How a cubby was clicked: Cmd/Ctrl adds or removes it, Shift picks a block. */
export interface CubbyClick { toggle: boolean; range: boolean }

interface ShelfFrontGridProps {
  letter: string
  rows: number
  columns: number
  /** Samples per cubby, for cubbies the database has not created yet. */
  capacity: number
  cubbies: Cubby[]
  zones: Map<string, ZoneStyle>
  /** Each cell's zone, pending assignments included; without it, the saved cubbies' zones. */
  zoneOf?: Map<Cell, string | null>
  /** Client names, written in a zoned cubby. */
  names?: Map<string, string>
  /** Picked cubbies (editing); each cubby then says whether it is picked. */
  picked?: ReadonlySet<Cell>
  highlightCubbyId?: string | null
  onCubbyClick?: (cubby: Cubby | null, row: number, column: number, how: CubbyClick) => void
}

/** A shelf seen from the front: row A on top, column 1 on the left, one large square per cubby. */
export function ShelfFrontGrid({
  letter, rows, columns, capacity, cubbies, zones, zoneOf, names, picked, highlightCubbyId, onCubbyClick,
}: ShelfFrontGridProps) {
  const byPosition = new Map(cubbies.map((c) => [cell(c.row, c.column), c]))
  const click = (cubby: Cubby | null, row: number, column: number) => (e: MouseEvent) =>
    onCubbyClick?.(cubby, row, column, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey })
  return (
    <div className="overflow-auto">
      <div
        className="inline-grid gap-px bg-border"
        style={{ gridTemplateColumns: `1.5rem repeat(${columns}, minmax(5.5rem, 1fr))` }}
      >
        <div className="bg-background" />
        {Array.from({ length: columns }, (_, c) => (
          <div key={`col-${c}`} className="bg-background py-1 text-center text-xs text-muted-foreground">{c + 1}</div>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <Fragment key={`row-${r}`}>
            <div className="flex items-center justify-center bg-background text-xs text-muted-foreground">
              {rowLetter(r + 1)}
            </div>
            {Array.from({ length: columns }, (_, c) => {
              const at = cell(r + 1, c + 1)
              const cubby = byPosition.get(at) ?? null
              const companyId = zoneOf ? zoneOf.get(at) ?? null : cubby?.company_id ?? null
              const zone = companyId ? zones.get(companyId) : undefined
              const client = companyId ? names?.get(companyId) : undefined
              const occupied = cubby?.occupied ?? 0
              const cap = cubby?.capacity ?? capacity
              const code = `${letter}-${rowLetter(r + 1)}${c + 1}`
              const isPicked = picked?.has(at) ?? false
              return (
                <button
                  key={code}
                  type="button"
                  data-testid={`cubby-${code}`}
                  aria-label={`${code}, ${occupied} of ${cap}${client ? `, ${client}` : ''}`}
                  aria-pressed={picked ? isPicked : undefined}
                  onClick={click(cubby, r + 1, c + 1)}
                  className={cn(
                    'flex h-[4.5rem] flex-col items-start justify-between bg-background p-2 text-left text-xs tabular-nums hover:bg-muted',
                    occupied >= cap && 'font-semibold',
                    (isPicked || (cubby !== null && cubby.id === highlightCubbyId)) &&
                      'outline outline-2 -outline-offset-2 outline-foreground',
                  )}
                  style={zone ? {
                    backgroundColor: `${zone.color}24`,
                    boxShadow: `inset 3px 0 0 ${zone.color}`,
                    backgroundImage: zone.hatched
                      ? `repeating-linear-gradient(45deg, ${zone.color}33 0 4px, transparent 4px 8px)`
                      : undefined,
                  } : undefined}
                >
                  <span className="block font-medium">{code}</span>
                  <span className="block text-muted-foreground">{occupied}/{cap}</span>
                  {client && <span className="block w-full truncate">{client}</span>}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
```

`zone-assign-box.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { StorageCompany } from '@/lib/storage/layout'

interface ClientRow { id: string; name?: string | null; company?: string | null }

/**
 * Which client to give the picked cubbies or shelves: General first, then the
 * QC clients the New Sample wizard lists (server search, trade names), and the
 * button that assigns the choice.
 */
export function ZoneAssignBox({ label, onAssign }: { label: string; onAssign: (company: StorageCompany | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StorageCompany[]>([])
  const [failed, setFailed] = useState(false)
  // undefined: nothing chosen yet; null: General.
  const [choice, setChoice] = useState<StorageCompany | null | undefined>(undefined)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(query.trim())}&limit=8`, { signal: ctrl.signal })
        const body = await res.json().catch(() => ({}))
        setFailed(!res.ok)
        setResults(res.ok
          ? ((body.clients ?? []) as ClientRow[]).map((c) => ({ id: c.id, name: c.company?.trim() || c.name?.trim() || 'Unnamed company' }))
          : [])
      } catch {
        // aborted by the next keystroke
      }
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [query])

  const option = (key: string, text: string, value: StorageCompany | null) => {
    const on = choice !== undefined && (choice?.id ?? null) === (value?.id ?? null)
    return (
      <li key={key}>
        <button type="button" aria-pressed={on} onClick={() => setChoice(value)}
          className={cn('w-full truncate rounded-[4px] px-2 py-1 text-left text-sm hover:bg-muted', on && 'bg-muted font-medium')}>
          {text}
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Assign to</span>
        <span className="relative block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8"
            placeholder="Search clients" aria-label="Search clients" />
        </span>
      </label>
      <ul className="max-h-56 space-y-px overflow-y-auto" aria-label="Clients">
        {option('general', 'General (no client)', null)}
        {results.map((c) => option(c.id, c.name, c))}
      </ul>
      {failed && <p className="text-xs text-red-600">Clients could not be loaded.</p>}
      <Button size="sm" className="w-full" disabled={choice === undefined}
        onClick={() => { if (choice !== undefined) onAssign(choice) }}>
        {label}
      </Button>
    </div>
  )
}
```

`zone-history.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ZoneEvent } from '@/lib/storage/zone-changes'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SHOWN_CODES = 8
const MAX_EVENTS = 100

/** One history line: "13 Oct 14:02", who, and "B-A1, B-A2: General → Ahold" (local time). */
export function zoneEventLine(e: ZoneEvent): { when: string; who: string; what: string } {
  const d = new Date(e.changed_at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const when = `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const codes = [...e.codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const more = codes.length > SHOWN_CODES ? ` +${codes.length - SHOWN_CODES} more` : ''
  const what = `${codes.slice(0, SHOWN_CODES).join(', ')}${more}: ${e.from_name ?? 'General'} → ${e.to_name ?? 'General'}`
  return { when, who: e.changed_by_name, what }
}

/** Zone changes for one shelf (`shelfId`) or the whole lab (null), newest first; reloads when `token` changes. */
export function ZoneHistory({ laboratoryId, shelfId, pageSize, token }: {
  laboratoryId: string; shelfId: string | null; pageSize: number; token: number
}) {
  const [limit, setLimit] = useState(pageSize)
  const [events, setEvents] = useState<ZoneEvent[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => { setLimit(pageSize) }, [shelfId, pageSize])

  useEffect(() => {
    let alive = true
    const shelf = shelfId ? `&shelf=${shelfId}` : ''
    fetch(`/api/laboratories/${laboratoryId}/storage/zone-history?limit=${limit}${shelf}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!alive) return
        setFailed(!res.ok)
        setEvents(res.ok ? body.events ?? [] : [])
      })
      .catch(() => { if (alive) { setFailed(true); setEvents([]) } })
    return () => { alive = false }
  }, [laboratoryId, shelfId, limit, token])

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold">Zone history</h4>
      {failed ? (
        <p className="text-xs text-muted-foreground">Zone history unavailable</p>
      ) : events === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No zone changes yet</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {events.map((e, i) => {
            const line = zoneEventLine(e)
            return (
              <li key={`${e.changed_at}-${i}`}>
                <div className="text-muted-foreground">{line.when} · {line.who}</div>
                <div>{line.what}</div>
              </li>
            )
          })}
        </ul>
      )}
      {!failed && events !== null && events.length >= limit && limit < MAX_EVENTS && (
        <Button variant="ghost" size="sm" onClick={() => setLimit((l) => Math.min(l + pageSize, MAX_EVENTS))}>
          Show more
        </Button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/storage/blueprint/shelf-front-grid.test.tsx src/components/storage/blueprint/zone-assign-box.test.tsx src/components/storage/blueprint/zone-history.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/shelf-front-grid.tsx src/components/storage/blueprint/shelf-front-grid.test.tsx src/components/storage/blueprint/zone-assign-box.tsx src/components/storage/blueprint/zone-assign-box.test.tsx src/components/storage/blueprint/zone-history.tsx src/components/storage/blueprint/zone-history.test.tsx
git commit -m "feat(storage): large cubby grid with picking, client box, zone history list"
```

---

### Task 7: Cubby display window

**Files:**
- Create: `src/components/storage/blueprint/cubby-display.tsx`, `cubby-display.test.tsx`

**Interfaces:**
- Consumes: `ShelfFrontGrid`, `ZoneAssignBox`, `ZoneHistory` (Task 6); `cell`, `shelfZones`, `zoneCounts`, `Cell`, `CubbyPick`, `PickMode` (Part A Task 3); `CubbySampleRow` (`src/lib/storage/cubby-samples.ts`: `{ id; label; contract: string | null; client: string }`); `GET /api/laboratories/[id]/storage/cubbies/[positionId]` → `{ cubby: { id, code }, samples: CubbySampleRow[] }`.
- Produces: `CubbyDisplay(props: CubbyDisplayProps)` with

```ts
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
```

The content element carries `data-cubby-display` (Part A Task 5's keyboard skips it).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CubbyDisplay, type CubbyDisplayProps } from './cubby-display'
import type { EditorShelf } from './editor-state'
import { zoneStyles } from './zone-colors'

const shelf: EditorShelf = {
  key: 's-b', id: 's-b', shelf_letter: 'B', rows: 2, columns: 2, samples_per_position: 42,
  x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null,
  cubbies: [{ id: 'p1', row: 1, column: 1, code: 'B-A1', capacity: 42, occupied: 2, company_id: null }],
  zone_edits: { '1:2': 'co-1' },
}
const props = (over: Partial<CubbyDisplayProps> = {}): CubbyDisplayProps => ({
  laboratoryId: 'lab', shelf, mode: 'edit', zones: zoneStyles(['co-1']), names: new Map([['co-1', 'Ahold']]),
  pick: null, highlightCubbyId: null, historyToken: 0, onClose: vi.fn(), onPick: vi.fn(), onAssign: vi.fn(), ...over,
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/cubbies/')) {
      return new Response(JSON.stringify({
        cubby: { id: 'p1', code: 'B-A1' },
        samples: [{ id: 'x', label: 'SAG-011895/26', contract: '42273/26', client: 'Ahold' }],
      }))
    }
    if (url.includes('zone-history')) return new Response(JSON.stringify({ events: [] }))
    return new Response(JSON.stringify({ clients: [] }))
  }))
})

describe('CubbyDisplay', () => {
  it('shows the shelf big with its pending zones, and turns clicks into picks', () => {
    const p = props()
    render(<CubbyDisplay {...p} />)
    expect(screen.getByRole('dialog', { name: 'Shelf B' })).toBeInTheDocument()
    expect(screen.getByTestId('cubby-B-A2')).toHaveTextContent('Ahold')
    fireEvent.click(screen.getByTestId('cubby-B-A1'))
    fireEvent.click(screen.getByTestId('cubby-B-B2'), { metaKey: true })
    fireEvent.click(screen.getByTestId('cubby-B-B1'), { shiftKey: true })
    expect(vi.mocked(p.onPick).mock.calls).toEqual([['1:1', 'only'], ['2:2', 'toggle'], ['2:1', 'range']])
  })

  it('names the assign button by the pick and outlines the picked cubbies', () => {
    render(<CubbyDisplay {...props({ pick: { shelfKey: 's-b', cells: ['1:1', '1:2'], anchor: '1:1' } })} />)
    expect(screen.getByRole('button', { name: 'Assign 2 cubbies' })).toBeInTheDocument()
    expect(screen.getByTestId('cubby-B-A1')).toHaveAttribute('aria-pressed', 'true')
  })

  it("when viewing, lists a clicked cubby's samples by certificate number, with no assigning", async () => {
    render(<CubbyDisplay {...props({ mode: 'view' })} />)
    fireEvent.click(screen.getByTestId('cubby-B-A1'))
    expect(await screen.findByText('SAG-011895/26')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Assign/ })).toBeNull()
  })

  it('asks no history for a shelf drawn in this session', () => {
    render(<CubbyDisplay {...props({ shelf: { ...shelf, id: undefined } })} />)
    expect(screen.getByText("Save the plan to start this shelf's zone history.")).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes('zone-history'))).toBe(false)
  })

  it('closes on Escape, and the page behind sees the key as handled', () => {
    const p = props()
    const behind = vi.fn()
    window.addEventListener('keydown', behind)
    render(<CubbyDisplay {...p} />)
    fireEvent.keyDown(screen.getByTestId('cubby-B-A1'), { key: 'Escape' })
    window.removeEventListener('keydown', behind)
    expect(p.onClose).toHaveBeenCalled()
    expect(behind.mock.calls.every(([e]) => (e as KeyboardEvent).defaultPrevented)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/storage/blueprint/cubby-display.test.tsx`
Expected: FAIL: cannot resolve `./cubby-display`.

- [ ] **Step 3: Implement `cubby-display.tsx`**

```tsx
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/storage/blueprint/cubby-display.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/cubby-display.tsx src/components/storage/blueprint/cubby-display.test.tsx
git commit -m "feat(storage): cubbies open big in a centered window: pick and assign, samples, history"
```

---

### Task 8: Side panels

**Files:**
- Create: `src/components/storage/blueprint/shelf-summary.tsx`
- Modify: `src/components/storage/blueprint/selection-panel.tsx` (`MultiPanel`, `GroupPanel`, add `shelvesLabel`)
- Modify: `src/components/storage/blueprint/inspector.tsx` (props, `Inspector`, `ShapePanel` shelf block, new `ZonesOnlyPanel`)
- Modify: `src/components/storage/blueprint/view-panel.tsx` (drop the grid and cubby contents; summary, lab history)
- Test: `src/components/storage/blueprint/inspector.test.tsx`; Create `src/components/storage/blueprint/view-panel.test.tsx`

**Interfaces:**
- Consumes: `ZoneAssignBox`, `ZoneHistory` (Task 6); `zoneCounts` (Part A Task 3).
- Produces:
  - `ShelfSummary({ shelf: EditorShelf; zones: Map<string, ZoneStyle>; names: Map<string, string>; onOpen: () => void })`
  - `shelvesLabel(n: number): string` → `"Assign 1 shelf"`, `"Assign 3 shelves"`
  - `MultiPanel` and `GroupPanel` gain `shelfCount: number; onAssign: (company: StorageCompany | null) => void`
  - `InspectorProps` gains `canLayout?: boolean` (default true), `names?: Map<string, string>`, `onOpenShelf: (shelfKey: string) => void`, `onAssign: (company: StorageCompany | null) => void`
  - `ViewPanelProps` becomes `{ laboratoryId; doc; selectedShelfKey; zones; names: Map<string, string>; historyToken: number; onFound(shelfKey, cubbyId); onOpenShelf(shelfKey) }` (no `highlightCubbyId`)

- [ ] **Step 1: Write the failing tests**

`inspector.test.tsx`: add `import { beforeEach } from 'vitest'` to the vitest import, `import { zoneStyles } from './zone-colors'`, extend `handlers()` with `onOpenShelf: vi.fn(), onAssign: vi.fn()`, add

```tsx
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ clients: [] }))))
})
```

and append inside `describe('Inspector')`:

```tsx
  it('shows a shelf as a summary with Open cubbies instead of the small grid', () => {
    const h = handlers()
    const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf('a', 'A', 40, { zone_edits: { '1:1': 'co-1' } })] }
    render(<Inspector doc={doc} zones={zoneStyles(['co-1'])} names={new Map([['co-1', 'Ahold']])} {...h}
      selection={[{ kind: 'shelf', key: 'a' }]} />)
    expect(screen.queryByTestId('cubby-A-A1')).toBeNull()
    expect(screen.getByText('Ahold')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open cubbies' }))
    expect(h.onOpenShelf).toHaveBeenCalledWith('a')
  })

  it('assigns several selected shelves at once', () => {
    const h = handlers()
    const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf('a', 'A', 40), shelf('b', 'B', 40)] }
    render(<Inspector doc={doc} zones={new Map()} {...h}
      selection={[{ kind: 'shelf', key: 'a' }, { kind: 'shelf', key: 'b' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'General (no client)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign 2 shelves' }))
    expect(h.onAssign).toHaveBeenCalledWith(null)
  })

  it('without layout rights shows no layout fields or buttons, only the summary and assigning', () => {
    const h = handlers()
    const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf('a', 'A', 40), shelf('b', 'B', 40)] }
    const { rerender } = render(<Inspector doc={doc} zones={new Map()} {...h} canLayout={false}
      selection={[{ kind: 'shelf', key: 'a' }]} />)
    expect(screen.queryByLabelText('X (cm)')).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open cubbies' })).toBeInTheDocument()
    expect(screen.getByText('Only lab managers can change the layout.')).toBeInTheDocument()
    rerender(<Inspector doc={doc} zones={new Map()} {...h} canLayout={false}
      selection={[{ kind: 'shelf', key: 'a' }, { kind: 'shelf', key: 'b' }]} />)
    expect(screen.queryByRole('button', { name: 'Group' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Assign 2 shelves' })).toBeInTheDocument()
  })
```

`view-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import { ViewPanel } from './view-panel'
import type { EditorDoc } from './editor-state'

const doc: EditorDoc = {
  plan: EMPTY_FLOOR_PLAN,
  shelves: [{
    key: 's-a', id: 's-a', shelf_letter: 'A', rows: 2, columns: 2, samples_per_position: 42,
    x_cm: 0, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
    locked: false, group_id: null, company_id: null, cubbies: [],
  }],
}

describe('ViewPanel', () => {
  it("shows the whole lab's zone history with no shelf selected, and a shelf's summary otherwise", async () => {
    const event = { changed_at: '2026-10-13T17:02:00Z', changed_by_name: 'Daniel Wolthers', from_name: null, to_name: 'Ahold', codes: ['A-A1'] }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [event] })))
    vi.stubGlobal('fetch', fetchMock)
    const onOpenShelf = vi.fn()
    const base = { laboratoryId: 'lab', doc, zones: new Map(), names: new Map(), historyToken: 0, onFound: vi.fn(), onOpenShelf }
    const { rerender } = render(<ViewPanel {...base} selectedShelfKey={null} />)
    expect(await screen.findByText('A-A1: General → Ahold')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/laboratories/lab/storage/zone-history?limit=20')
    rerender(<ViewPanel {...base} selectedShelfKey="s-a" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open cubbies' }))
    expect(onOpenShelf).toHaveBeenCalledWith('s-a')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/inspector.test.tsx src/components/storage/blueprint/view-panel.test.tsx`
Expected: FAIL: the shelf panel still renders the small grid, no "Open cubbies", no assign box, layout fields shown without rights, no lab history.

- [ ] **Step 3: Implement**

Create `shelf-summary.tsx`:

```tsx
'use client'

import { Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EditorShelf } from './editor-state'
import { zoneCounts } from './zones'
import type { ZoneStyle } from './zone-colors'

/** A shelf in the side panel: its size, how many cubbies each client holds, and Open cubbies. */
export function ShelfSummary({ shelf, zones, names, onOpen }: {
  shelf: EditorShelf; zones: Map<string, ZoneStyle>; names: Map<string, string>; onOpen: () => void
}) {
  const counts = zoneCounts(shelf)
  const total = shelf.rows * shelf.columns
  const zoned = [...counts.values()].reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {total} cubbies, {(total * shelf.samples_per_position).toLocaleString()} samples
      </p>
      <ul className="space-y-1 text-xs">
        {[...counts].map(([id, n]) => (
          <li key={id} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ backgroundColor: zones.get(id)?.color }} />
            <span className="truncate">{names.get(id) ?? 'Client'}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{n}</span>
          </li>
        ))}
        {zoned < total && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 border" />
            <span>General</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{total - zoned}</span>
          </li>
        )}
      </ul>
      <Button variant="outline" size="sm" className="w-full" onClick={onOpen}>
        <Grid3x3 className="mr-1.5 h-4 w-4" />Open cubbies
      </Button>
    </div>
  )
}
```

`selection-panel.tsx`: import `type { StorageCompany } from '@/lib/storage/layout'` and `ZoneAssignBox` from `./zone-assign-box`; add

```tsx
export const shelvesLabel = (n: number): string => `Assign ${n} ${n === 1 ? 'shelf' : 'shelves'}`

function ShelvesAssign({ shelfCount, onAssign }: { shelfCount: number; onAssign: (company: StorageCompany | null) => void }) {
  if (shelfCount === 0) return null
  return (
    <div className="border-t pt-3">
      <ZoneAssignBox label={shelvesLabel(shelfCount)} onAssign={onAssign} />
    </div>
  )
}
```

then add `shelfCount: number` and `onAssign: (company: StorageCompany | null) => void` to the props of `MultiPanel` and `GroupPanel`, and render `<ShelvesAssign shelfCount={shelfCount} onAssign={onAssign} />` as the last child of each panel's outer `div`.

`inspector.tsx`:

1. Imports: drop `ShelfFrontGrid`; add `type StorageCompany` from `@/lib/storage/layout`, `ShelfSummary` from `./shelf-summary`, `ZoneAssignBox` from `./zone-assign-box`, and `shelvesLabel` from `./selection-panel`.
2. `InspectorProps` add:

```ts
  /** False: details read-only; the panel only summarises shelves and assigns zones. */
  canLayout?: boolean
  /** Client names for the zones shown. */
  names?: Map<string, string>
  onOpenShelf: (shelfKey: string) => void
  onAssign: (company: StorageCompany | null) => void
```

3. `Inspector`:

```tsx
const NO_NAMES = new Map<string, string>()

/** The Edit-mode side panel: one shape, one group, or several shapes; zones only without layout rights. */
export function Inspector(props: InspectorProps) {
  const { doc, selection, canLayout = true } = props
  const names = props.names ?? NO_NAMES
  const shelfCount = selection.filter((r) => r.kind === 'shelf').length
  if (!canLayout) return <ZonesOnlyPanel {...props} names={names} shelfCount={shelfCount} />
  if (selection.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a shape to edit it, or pick a tool on the left and drag on the plan. Right-click a shape for more.
      </p>
    )
  }
  const anyLocked = selection.some((r) => shapeLocked(doc, r))
  const allLocked = selection.every((r) => shapeLocked(doc, r))
  const group = selectionGroup(doc, selection)
  if (group) {
    return (
      <GroupPanel group={group} count={selection.length} allLocked={allLocked} anyLocked={anyLocked}
        onRename={(name) => props.onRenameGroup(group.id, name)} onLock={props.onLock}
        onUngroup={props.onUngroup} onDelete={props.onDelete} shelfCount={shelfCount} onAssign={props.onAssign} />
    )
  }
  if (selection.length > 1) {
    return (
      <MultiPanel count={selection.length} hasRoom={selection.some((r) => r.kind === 'room')}
        allLocked={allLocked} anyLocked={anyLocked} onGroup={props.onGroup} onAlign={props.onAlign}
        onDistribute={props.onDistribute} onLock={props.onLock} onDelete={props.onDelete}
        shelfCount={shelfCount} onAssign={props.onAssign} />
    )
  }
  return <ShapePanel {...props} names={names} selected={selection[0]} locked={anyLocked} />
}
```

4. `ShapePanel`: take `names` and `onOpenShelf` from its props (type `InspectorProps & { selected: ShapeRef; locked: boolean; names: Map<string, string> }`), and replace the shelf block's `<p>…cubbies, … samples</p>` and `<ShelfFrontGrid … />` with:

```tsx
          <ShelfSummary shelf={shelf} zones={zones} names={names} onOpen={() => onOpenShelf(shelf.key)} />
```

5. Add at the end of the file:

```tsx
/** Lab staff without layout rights: what a shape is, its cubbies, and assigning shelves to a client. */
function ZonesOnlyPanel({ doc, selection, zones, names, shelfCount, onOpenShelf, onAssign }:
  InspectorProps & { names: Map<string, string>; shelfCount: number }) {
  const note = <p className="text-xs text-muted-foreground">Only lab managers can change the layout.</p>
  if (selection.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select shelves to assign them to a client, or double-click a shelf to open its cubbies.
      </p>
    )
  }
  if (selection.length === 1) {
    const found = findShape(doc, selection[0])
    if (!found) return null
    const { item, room, shelf } = found
    const title = shelf ? `Shelf ${shelf.shelf_letter}` : item ? FLOOR_ITEM_LABELS[item.kind] : room?.name || 'Room'
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {shelf && <ShelfSummary shelf={shelf} zones={zones} names={names} onOpen={() => onOpenShelf(shelf.key)} />}
        {note}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{selection.length} shapes selected</h3>
      {shelfCount > 0
        ? <ZoneAssignBox label={shelvesLabel(shelfCount)} onAssign={onAssign} />
        : <p className="text-xs text-muted-foreground">None of these is a shelf.</p>}
      {note}
    </div>
  )
}
```

`view-panel.tsx`: remove `ShelfFrontGrid`, the `contents`/`loading` state and its effect, and `highlightCubbyId`; import `ShelfSummary` and `ZoneHistory`; props become

```ts
interface ViewPanelProps {
  laboratoryId: string
  doc: EditorDoc
  selectedShelfKey: string | null
  zones: Map<string, ZoneStyle>
  names: Map<string, string>
  /** Bumped after each save, so the history reloads. */
  historyToken: number
  onFound: (shelfKey: string, cubbyId: string) => void
  onOpenShelf: (shelfKey: string) => void
}
```

and everything after the search results becomes:

```tsx
      {shelf ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Shelf {shelf.shelf_letter}</h3>
          <ShelfSummary shelf={shelf} zones={zones} names={names} onOpen={() => onOpenShelf(shelf.key)} />
        </section>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Click a shelf to open its cubbies.</p>
          <ZoneHistory laboratoryId={laboratoryId} shelfId={null} pageSize={20} token={historyToken} />
        </>
      )}
```

(the `CubbySampleRow` import and `CubbyContents` interface go; the search and `onFound` stay).

- [ ] **Step 4: Run them to see them pass, then the storage suite**

Run: `npx vitest run src/components/storage`
Expected: PASS for the panels; `storage-workspace.tsx` does not compile yet against the new `ViewPanel`/`Inspector` props (vitest may still pass); Task 9 wires them. Do not run tsc until Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/shelf-summary.tsx src/components/storage/blueprint/selection-panel.tsx src/components/storage/blueprint/inspector.tsx src/components/storage/blueprint/inspector.test.tsx src/components/storage/blueprint/view-panel.tsx src/components/storage/blueprint/view-panel.test.tsx
git commit -m "feat(storage): shelf summary with Open cubbies; assign several shelves; zones-only panel; lab zone history"
```

---

### Task 9: Workspace wiring and the two-step save

**Files:**
- Modify: `src/components/storage/blueprint/storage-workspace.tsx`
- Test: `src/components/storage/blueprint/storage-workspace.test.tsx`, `src/components/storage/blueprint/storage-overlay.test.tsx`

**Interfaces:**
- Consumes: everything above: `actions.load(doc, canLayout)`, `actions.saved(doc, shift, dirty)`, `actions.pickCubby`, `actions.clearPick`, `actions.assignZone`; `state.canLayout`, `state.cubbyPick`; `zoneChanges`, `carryZoneEdits`, `zoneCounts`; `CubbyDisplay`; the new `Inspector`/`ViewPanel` props; `menuState(…, canLayout)`; canvas `canLayout`, `onOpenShelf`; `layout.can_assign`.
- Produces: the finished feature.

- [ ] **Step 1: Write the failing tests**

`storage-workspace.test.tsx`: add `within` to the Testing Library import and append inside `describe('StorageWorkspace')`:

```tsx
  const CO = '11111111-1111-4111-8111-111111111111'
  const cubbies = [
    { id: 'p1', row: 1, column: 1, code: 'A-A1', capacity: 42, occupied: 0, company_id: null },
    { id: 'p2', row: 1, column: 2, code: 'A-A2', capacity: 42, occupied: 0, company_id: null },
  ]
  const zoned = (over: Record<string, unknown>) => ({ ...layout, ...over, shelves: [{ ...layout.shelves[0], cubbies }] })
  function serve(body: object, zonesStatus = 200) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('/api/clients')) return new Response(JSON.stringify({ clients: [{ id: CO, name: 'Ahold Delhaize USA', company: 'Ahold' }] }))
      if (u.includes('zone-history')) return new Response(JSON.stringify({ events: [] }))
      if (u.endsWith('/storage/zones')) {
        return new Response(JSON.stringify(zonesStatus === 200 ? body : { error: 'A client in these changes no longer exists' }), { status: zonesStatus })
      }
      return new Response(JSON.stringify(body))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  const calls = (m: ReturnType<typeof serve>, end: string) =>
    m.mock.calls.filter(([u, i]) => String(u).endsWith(end) && (i as RequestInit | undefined)?.method === 'PUT')
  async function assignWholeShelfA() {
    fireEvent.doubleClick(screen.getByTestId('shelf-A'))
    const dialog = await screen.findByRole('dialog', { name: 'Shelf A' })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ahold' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign whole shelf' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Shelf A' })).toBeNull())
  }

  it('lets lab staff without layout rights assign a whole shelf, and saves only the zones', async () => {
    const fetchMock = serve(zoned({ can_edit: false, can_assign: true }))
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('navigation', { name: 'Drawing tools' })).toBeNull()
    await assignWholeShelfA()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/storage/zones')).toHaveLength(1))
    expect(calls(fetchMock, '/storage')).toHaveLength(0)
    expect(JSON.parse(String(calls(fetchMock, '/storage/zones')[0][1]!.body))).toEqual({
      changes: [{ code: 'A-A1', company_id: CO }, { code: 'A-A2', company_id: CO }],
    })
  })

  it("saves a manager's layout first, then the zones", async () => {
    const fetchMock = serve(zoned({ can_edit: true, can_assign: true }))
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await assignWholeShelfA()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/storage/zones')).toHaveLength(1))
    const order = fetchMock.mock.calls.map(([u, i]) => ((i as RequestInit | undefined)?.method === 'PUT' ? String(u) : null)).filter(Boolean)
    expect(order).toEqual(['/api/laboratories/lab/storage', '/api/laboratories/lab/storage/zones'])
  })

  it('keeps the zone edits and stays unsaved when the zones fail after the layout saved', async () => {
    const fetchMock = serve(zoned({ can_edit: true, can_assign: true }), 400)
    render(<StorageWorkspace laboratoryId="lab" />)
    await screen.findByTestId('shelf-A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await assignWholeShelfA()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A client in these changes no longer exists')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/storage/zones')).toHaveLength(2))
    const [first, retry] = calls(fetchMock, '/storage/zones').map(([, i]) => (i as RequestInit).body)
    expect(retry).toBe(first)
  })
```

`storage-overlay.test.tsx`, append inside `describe('StorageOverlay')`:

```tsx
  it('closes the cubby window on Escape and leaves the storage screen open', async () => {
    const onClose = vi.fn()
    render(<StorageOverlay laboratoryId="lab" labName="Santos" onClose={onClose} />)
    fireEvent.click(await screen.findByTestId('shelf-A'))
    const dialog = await screen.findByRole('dialog', { name: 'Shelf A' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Shelf A' })).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Storage · Santos' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/storage-workspace.test.tsx src/components/storage/blueprint/storage-overlay.test.tsx`
Expected: FAIL: no Edit button for staff without `can_edit`; double-click and click open nothing; no zones PUT.

- [ ] **Step 3: Implement in `storage-workspace.tsx`**

1. Imports: add `type StorageCompany` next to `StorageLayout`; `planShift` stays; add `import { carryZoneEdits, zoneChanges, zoneCounts } from './zones'` and `import { CubbyDisplay } from './cubby-display'`.

2. State, after `asideRef`:

```ts
  const [openShelf, setOpenShelf] = useState<string | null>(null)
  /** Clients assigned in this session, so the legend and colours know them before Save. */
  const [assigned, setAssigned] = useState<StorageCompany[]>([])
  const [historyToken, setHistoryToken] = useState(0)
```

3. `load`:

```ts
    setLayout(body)
    setAssigned([])
    actions.load(fromLayout(body), body.can_edit === true && !readOnly)
    setFitToken((t) => t + 1)
    if (initialMode === 'edit' && (body.can_edit || body.can_assign) && !readOnly) setMode('edit')
```

4. Replace the `zones` memo with:

```ts
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
```

5. `save`, whole function:

```ts
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
```

6. Menu: `menuState(state.doc, state.selection, menuTarget, mode, canPaste, state.canLayout)`, and the `viewCubbies` handler:

```ts
    viewCubbies: () => {
      if (menuTarget?.kind !== 'shape') return
      select([menuTarget.ref], true)
      if (menuTarget.ref.kind === 'shelf') setOpenShelf(menuTarget.ref.key)
    },
```

7. Toolbar Edit button condition: `(layout.can_edit || layout.can_assign) && !readOnly && (…)`. Tool palette: `{mode === 'edit' && state.canLayout && <ToolPalette … />}`. Empty-room hint: `mode === 'edit' && state.canLayout && state.doc.plan.rooms.length === 0`. Legend: map `inUse` instead of `companiesInUse` (delete `companiesInUse`).

8. Canvas: add `canLayout={state.canLayout} onOpenShelf={setOpenShelf}`.

9. Side panel:

```tsx
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
```

10. After the outer layout `div`'s last child (inside the root `div`), mount the window:

```tsx
      <CubbyDisplay laboratoryId={laboratoryId} shelf={state.doc.shelves.find((s) => s.key === openShelf) ?? null}
        mode={mode} zones={zones} names={names} pick={state.cubbyPick}
        highlightCubbyId={highlight && highlight.shelfKey === openShelf ? highlight.cubbyId : null}
        historyToken={historyToken}
        onClose={() => { setOpenShelf(null); actions.clearPick() }}
        onPick={(c, how) => { if (openShelf) actions.pickCubby(openShelf, c, how) }}
        onAssign={assign} />
```

- [ ] **Step 4: Run them to see them pass, then everything**

Run: `npx vitest run src/components/storage src/lib/storage src/app/api/laboratories`
Expected: PASS.

Run: `npx tsc --noEmit -p .`
Expected: exit 0.

Run (with `SCRATCH` set to the session scratchpad directory): `npx vitest run > "$SCRATCH/vitest.log" 2>&1; grep -E "Test Files|Tests " "$SCRATCH/vitest.log"`
Expected: every test file passes. Unhandled errors, if any, come only from the cupping and sample-intake files that already reported them before this plan (`CvaJourney`, `sample-intake-form.*`); name any other in the report.

- [ ] **Step 5: Commit**

```bash
git add src/components/storage/blueprint/storage-workspace.tsx src/components/storage/blueprint/storage-workspace.test.tsx src/components/storage/blueprint/storage-overlay.test.tsx
git commit -m "feat(storage): cubby window, zone assignment for lab staff, layout-then-zones save"
```

- [ ] **Step 6: Hand the SQL to Daniel, then push**

Paste `database/migrations/20261013000002_storage_zone_assignment.sql` and then `database/tests/storage_zone_scenarios.sql` for Daniel to run. After he confirms the verify rows (8 columns, 2 functions, 1 policy) and a clean scenario run: `git push origin HEAD:main`. Smoke test list for him:

1. As a lab technician: Edit shows no drawing tools; double-click shelf A opens the big window.
2. Click A-A1, Cmd+click A-A3, Shift+click A-C4: the outline follows; the button reads "Assign N cubbies".
3. Search a client, pick it, Assign: the cubbies tint and carry its name; the plan's shelf tints too.
4. Escape closes only the window; Save; reopen: the zones stay; the shelf's Zone history shows the change with your name.
5. Shift+click two shelves on the plan, "Assign 2 shelves" to General: both clear.
6. As a manager: move a shelf and assign cubbies in one session; Save; both kept.
7. View mode: click a shelf, click a cubby: its samples list by certificate number; nothing selected: the lab's zone history.
