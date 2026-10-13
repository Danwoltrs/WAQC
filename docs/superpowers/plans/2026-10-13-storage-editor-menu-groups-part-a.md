# Storage editor menu, lock and groups: Implementation Plan, Part A (Tasks 1-5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the storage blueprint editor a right-click menu, lock in place, groups that move together and carry a name, several-shape selection, align/distribute, duplicate/copy/paste, and room names.

**Architecture:** Lock and group live on each shape: `locked` on rooms, items and shelves, `group_id` on items and shelves, group names in `floor_plan.groups`. Shelves are DB rows and get two columns, written by `save_lab_floor_plan`. The editor's pure reducer moves from one selected shape to a list; every set operation (turn, nudge, align, duplicate) works on footprints through a new pure module `src/lib/storage/arrange.ts`. Part B (separate file) adds the canvas gestures, keyboard, side panels and the menu.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, shadcn/Radix (`@radix-ui/react-context-menu` already installed), Supabase Postgres, Vitest 2 + Testing Library (jsdom).

**Spec:** [`docs/superpowers/specs/2026-10-13-storage-editor-menu-groups-design.md`](../specs/2026-10-13-storage-editor-menu-groups-design.md). Part B: [`2026-10-13-storage-editor-menu-groups-part-b.md`](2026-10-13-storage-editor-menu-groups-part-b.md).

## Global Constraints

- Lock and group live on each shape; group names in `floor_plan.groups: [{ id, name }]`; shelves get `lab_shelves.locked` and `lab_shelves.group_id`.
- Rooms can be locked and named, never grouped.
- Plans saved before this keep loading: missing `name`/`locked`/`group_id`/`groups` read as `null`/`false`/`null`/`[]`.
- Room and group names: trimmed, at most 40 characters, blank is `null`. Group id 1..64 characters. At most 100 groups.
- A locked shape cannot be moved, resized, rotated or deleted (nor a set that contains one); its details stay editable. Refusals show the toast "Unlock it first".
- Shortcuts, exactly: R rotate right, ⇧R rotate left, ⌘D duplicate, ⌘C copy, ⌘V paste, L lock/unlock, ⌘G group, ⇧⌘G ungroup, ⌘A select all, Del delete; arrows nudge 10 cm, Shift+arrow 1 cm. (Ctrl for ⌘ off a Mac.)
- SQL: Daniel applies every migration himself from SQL pasted in chat. Wrap in `BEGIN; … COMMIT;`. Never write `SELECT … INTO` or `RETURNING … INTO` (the Supabase editor appends `ALTER TABLE … ENABLE RLS` for them); use `v := (SELECT …)` / `ARRAY(SELECT …)`. The editor shows only the last result set.
- Push only after Daniel has applied `20261013000001_storage_lock_groups.sql`: the layout query selects the new columns, and the storage screen fails without them. Trunk-based: `git push origin HEAD:main` deploys Production.
- `route.ts` files export only HTTP handlers (`next build` rejects other exports). Run `npm run build` before pushing.
- UI: Inter, black/white palette, no emojis; corners 10px containers, 6px controls, square data. User-facing company names via `companyDisplayName`. Never render `samples.tracking_number`.
- Every file stays under ~2000 lines.
- jsdom here has no `PointerEvent` or `DOMPoint`: canvas tests install the `TestPointerEvent` stand-in; `getScreenCTM` is null, so every pointer maps to plan point (0, 0). Keyboard tests dispatch on `document`.
- `useBlueprintEditor()` returns `{ state, actions }` with `actions` memoized once; never spread `actions` into a new object (the workspace's load effect depends on its identity).
- Test command: `npx vitest run <path>`; typecheck `npx tsc --noEmit -p .`; build `npm run build`.

## Review Focus

1. **Paste into a lab that already has those letters** (e.g. copy A, B in one lab and paste where A, B exist): the copies must take the next free letters, never collide. Test in Task 5.
2. **Turn a group standing against the plan edge**: the turned set must shift back onto the plan instead of producing an unsaveable negative footprint. Tests in Tasks 3 and 4.
3. **Delete one member of a two-shape group**: the survivor must leave the group and the group must disappear, or the save sends a one-member group. Test in Task 4.
4. **Undo after dragging a group**: one Undo must put every member back. Test in Task 4.
5. **Press Escape (or an arrow) while the right-click menu is open**: the menu closes; the selection, the shapes and the storage overlay stay. Test in Part B Task 7.

## File Structure (both parts)

| File | Responsibility | Task |
|---|---|---|
| `src/lib/storage/floor-plan.ts` | Types and parsers: room `name`/`locked`, item `locked`/`group_id`, `groups`, shelf `locked`/`group_id`, `cleanName` | 1 |
| `src/lib/storage/layout.ts` | Selects `locked, group_id`; drops a shelf group the plan does not name | 1 |
| `src/app/api/laboratories/[id]/storage/route.ts` | PUT checks shelf groups against the plan | 1 |
| `database/migrations/20261013000001_storage_lock_groups.sql` | Two shelf columns; `save_lab_floor_plan` writes them | 2 |
| `database/tests/storage_blueprint_scenarios.sql` | Scenarios 12-13 | 2 |
| `src/lib/storage/arrange.ts` (new) | Pure footprint maths for sets: union, quarter turn about a centre, keep on plan, align, distribute, duplicate offset, move by offset | 3 |
| `src/components/storage/blueprint/editor-state.ts` | Selection list, group expansion, lock, set turn/nudge/delete, groups, align, distribute, copy/paste, `boxSelection` | 4, 5, 6 |
| `src/components/storage/blueprint/clipboard.ts` (new) | Clipboard in memory + `localStorage` | 5 |
| `src/components/storage/blueprint/use-blueprint-editor.ts` | Memoized actions | 4, 5, 7 |
| `src/components/storage/blueprint/use-editor-keyboard.ts` (new) | Every shortcut | 7 |
| `src/components/storage/blueprint/blueprint-canvas.tsx` | Shift+click, box, group drag, lock glyphs, room and group labels, right-click target | 4, 6 |
| `src/components/storage/blueprint/shapes.tsx` | `data-shape`, double-click, `LockGlyph` | 6 |
| `src/components/storage/blueprint/inspector-fields.tsx` (new) | `useDraft`, `NumberField`, `TextField` (moved), `data-focus` | 8 |
| `src/components/storage/blueprint/selection-panel.tsx` (new) | Group panel, several-shapes panel, lock button | 8 |
| `src/components/storage/blueprint/inspector.tsx` | Routes to the right panel; room name, lock, disabled place fields | 4, 8 |
| `src/components/storage/blueprint/canvas-context-menu.tsx` (new) | `menuState` (pure) and the Radix menu | 9 |
| `src/components/storage/blueprint/storage-workspace.tsx` | Wiring: selection, notices, keyboard, menu, focus | 4-9 |

---

### Task 1: Lock, group and room-name fields load and save

**Files:**
- Modify: `src/lib/storage/floor-plan.ts`
- Modify: `src/lib/storage/layout.ts`
- Modify: `src/app/api/laboratories/[id]/storage/route.ts`
- Modify: `src/components/storage/blueprint/editor-state.ts` (`add`, `fromLayout`, `toSavePayload` only)
- Test: `src/lib/storage/floor-plan.test.ts`, `src/lib/storage/layout.test.ts`, `src/app/api/laboratories/[id]/storage/route.test.ts`, `src/components/storage/blueprint/editor-state.test.ts`, `src/components/storage/blueprint/inspector.test.tsx` (fixtures only)

**Interfaces:**
- Produces:
  - `interface FloorRoom extends Rect { id: string; name: string | null; locked: boolean }`
  - `interface FloorItem extends Rect { id; kind; label; rot; locked: boolean; group_id: string | null }`
  - `interface FloorGroup { id: string; name: string | null }`
  - `interface FloorPlan { version: 1; rooms; items; groups: FloorGroup[] }`
  - `ShelfInput` gains `locked: boolean; group_id: string | null`
  - `const MAX_NAME_LENGTH = 40`, `const MAX_GROUPS = 100`
  - `function cleanName(v: unknown): string | null`
  - `function parseShelfInputs(input: unknown, groupIds?: ReadonlySet<string>): Parsed<ShelfInput[]>`
  - `EMPTY_FLOOR_PLAN = { version: 1, rooms: [], items: [], groups: [] }`
  - `fromLayout` fills defaults, so test fixtures and older API bodies without the new fields still load.

- [ ] **Step 1: Write the failing parser tests**

In `src/lib/storage/floor-plan.test.ts`, change the existing "upper-cases letters and keeps an existing id" expectation to include the new defaults:

```ts
    expect(parsed).toEqual({ ok: true, value: [{ ...shelf({ id }), shelf_letter: 'A', locked: false, group_id: null }] })
```

and append:

```ts
describe('lock, groups and room names', () => {
  it('reads a plan saved before them as unlocked, ungrouped and unnamed', () => {
    const parsed = parseFloorPlan({
      version: 1,
      rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600 }],
      items: [{ id: 'i1', kind: 'bench', label: null, x: 0, y: 0, w: 200, d: 70, rot: 0 }],
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        version: 1,
        rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }],
        items: [{ id: 'i1', kind: 'bench', label: null, x: 0, y: 0, w: 200, d: 70, rot: 0, locked: false, group_id: null }],
        groups: [],
      },
    })
  })

  it('trims names to 40 characters, keeps locks, and keeps only groups the plan names', () => {
    const parsed = parseFloorPlan({
      version: 1,
      rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: '  Sample room  ', locked: true }],
      items: [
        { id: 'i1', kind: 'bench', label: null, x: 0, y: 0, w: 200, d: 70, rot: 0, locked: true, group_id: 'g1' },
        { id: 'i2', kind: 'table', label: null, x: 300, y: 0, w: 160, d: 80, rot: 0, group_id: 'gone' },
      ],
      groups: [{ id: 'g1', name: 'x'.repeat(50) }],
    })
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.value.rooms[0]).toMatchObject({ name: 'Sample room', locked: true })
    expect(parsed.value.items.map((i) => [i.locked, i.group_id])).toEqual([[true, 'g1'], [false, null]])
    expect(parsed.value.groups).toEqual([{ id: 'g1', name: 'x'.repeat(40) }])
  })

  it('refuses a group id used twice', () => {
    const g = { id: 'g1', name: null }
    expect(parseFloorPlan({ version: 1, rooms: [], items: [], groups: [g, g] }).ok).toBe(false)
  })

  it('needs a shelf group to be one the plan names', () => {
    expect(parseShelfInputs([shelf({ group_id: 'g1', locked: true })], new Set(['g1']))).toMatchObject({
      ok: true, value: [{ group_id: 'g1', locked: true }],
    })
    expect(parseShelfInputs([shelf({ group_id: 'g2' })], new Set(['g1']))).toEqual({ ok: false, error: 'Shelf A: unknown group' })
  })
})
```

- [ ] **Step 2: Write the failing layout, route and editor tests**

In `src/lib/storage/layout.test.ts`, append inside `describe('assembleLayout', …)`:

```ts
  it('reads a shelf group only when the plan names it', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: { version: 1, rooms: [], items: [], groups: [{ id: 'g1', name: 'Wall rack' }] } },
      shelves: [{ ...shelfRow, locked: true, group_id: 'g1' }, { ...shelfRow, id: 's-b', shelf_letter: 'B', group_id: 'gone' }],
      positions: [], occupancy: [], companies: [],
    })
    expect(layout.shelves.map((s) => [s.shelf_letter, s.locked, s.group_id])).toEqual([['A', true, 'g1'], ['B', false, null]])
  })
```

In `src/app/api/laboratories/[id]/storage/route.test.ts`, change the expectation in "saves the parsed plan through save_lab_floor_plan" to:

```ts
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'save_lab_floor_plan',
      args: {
        p_lab: LAB,
        p_plan: { ...validBody.floor_plan, rooms: [{ ...validBody.floor_plan.rooms[0], name: null, locked: false }], groups: [] },
        p_shelves: [{ ...validBody.shelves[0], locked: false, group_id: null }],
      },
    })
```

and add inside `describe('PUT …')`:

```ts
  it('refuses a shelf whose group the plan does not name', async () => {
    state.db = fakeSupabase({ tables: tables(manager) })
    const body = { ...validBody, shelves: [{ ...validBody.shelves[0], group_id: 'g9' }] }
    const res = await PUT(put(body), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Shelf A: unknown group')
  })
```

In `src/components/storage/blueprint/editor-state.test.ts`, add `locked: false, group_id: null,` to the `shelf` fixture (after `access_side`), change the room expectation in "adds a room…" to

```ts
    expect(s.doc.plan.rooms).toEqual([{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }])
```

and change "sends only what the database stores" to

```ts
    expect(payload.shelves[0]).toEqual({
      id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
      x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0, access_side: 'front', locked: false, group_id: null,
    })
```

Then append inside `describe('helpers', …)`:

```ts
  it('loads an API body without the new fields as unlocked and ungrouped', () => {
    const doc = fromLayout({
      laboratory: { id: 'lab', name: 'Santos', floor_plan: { version: 1, rooms: [], items: [] } as never, storage_capacity: 0 },
      shelves: [{ ...shelf, locked: undefined as never, group_id: undefined as never }],
    })
    expect(doc.plan.groups).toEqual([])
    expect(doc.shelves[0]).toMatchObject({ key: 's-a', locked: false, group_id: null })
  })
```

and add `fromLayout` to that file's import from `./editor-state`.

In `src/components/storage/blueprint/inspector.test.tsx`, add `locked: false, group_id: null,` to the `shelf` fixture after `access_side`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/lib/storage src/app/api/laboratories src/components/storage/blueprint/editor-state.test.ts`
Expected: FAIL (new fields missing; `parseShelfInputs` ignores the group set; `fromLayout` not normalizing).

- [ ] **Step 4: Implement the types and parsers**

In `src/lib/storage/floor-plan.ts` replace the interfaces block (from `export interface Rect` through the end of `ShelfInput`) with:

```ts
export interface Rect { x: number; y: number; w: number; d: number }
export interface FloorRoom extends Rect { id: string; name: string | null; locked: boolean }
export interface FloorItem extends Rect {
  id: string
  kind: FloorItemKind
  label: string | null
  rot: Rotation
  locked: boolean
  group_id: string | null
}
/** A set of items and shelves that move together; members point at it by group_id. */
export interface FloorGroup { id: string; name: string | null }
export interface FloorPlan { version: 1; rooms: FloorRoom[]; items: FloorItem[]; groups: FloorGroup[] }

export interface ShelfInput {
  id?: string
  shelf_letter: string
  rows: number
  columns: number
  samples_per_position: number
  x_cm: number
  y_cm: number
  width_cm: number
  depth_cm: number
  rot: Rotation
  access_side: AccessSide
  locked: boolean
  group_id: string | null
}
```

After `export const MAX_CUBBY_CAPACITY = 500` add:

```ts
export const MAX_NAME_LENGTH = 40
export const MAX_GROUPS = 100
```

Replace `EMPTY_FLOOR_PLAN` with:

```ts
export const EMPTY_FLOOR_PLAN: FloorPlan = { version: 1, rooms: [], items: [], groups: [] }
```

After the `isId` helper add:

```ts
/** A trimmed name of at most 40 characters; anything else, or blank, is no name. */
export function cleanName(v: unknown): string | null {
  return typeof v === 'string' ? v.trim().slice(0, MAX_NAME_LENGTH) || null : null
}
```

Replace `parseFloorPlan` with:

```ts
/** Validate a stored or submitted plan; null/undefined is an empty room. Fields added later read as off. */
export function parseFloorPlan(input: unknown): Parsed<FloorPlan> {
  if (input === null || input === undefined) return { ok: true, value: EMPTY_FLOOR_PLAN }
  if (!isObj(input) || input.version !== 1) return { ok: false, error: 'Floor plan must be version 1' }
  const { rooms, items } = input
  const groups = input.groups ?? []
  if (!Array.isArray(rooms) || rooms.length > 50) return { ok: false, error: 'A floor plan has at most 50 room rectangles' }
  if (!Array.isArray(items) || items.length > 500) return { ok: false, error: 'A floor plan has at most 500 items' }
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS) {
    return { ok: false, error: `A floor plan has at most ${MAX_GROUPS} groups` }
  }

  const outGroups: FloorGroup[] = []
  for (const [i, g] of groups.entries()) {
    if (!isObj(g) || !isId(g.id)) return { ok: false, error: `Group ${i + 1}: missing id` }
    if (outGroups.some((x) => x.id === g.id)) return { ok: false, error: `Group ${i + 1}: id used twice` }
    outGroups.push({ id: g.id, name: cleanName(g.name) })
  }
  const groupIds = new Set(outGroups.map((g) => g.id))

  const outRooms: FloorRoom[] = []
  for (const [i, r] of rooms.entries()) {
    if (!isObj(r) || !isId(r.id)) return { ok: false, error: `Room ${i + 1}: missing id` }
    const err = rectError(r, `Room ${i + 1}`)
    if (err) return { ok: false, error: err }
    outRooms.push({
      id: r.id, x: r.x as number, y: r.y as number, w: r.w as number, d: r.d as number,
      name: cleanName(r.name), locked: r.locked === true,
    })
  }

  const outItems: FloorItem[] = []
  for (const [i, it] of items.entries()) {
    const what = `Item ${i + 1}`
    if (!isObj(it) || !isId(it.id)) return { ok: false, error: `${what}: missing id` }
    if (!FLOOR_ITEM_KINDS.includes(it.kind as FloorItemKind)) return { ok: false, error: `${what}: unknown kind` }
    if (!ROTATIONS.includes(it.rot as Rotation)) return { ok: false, error: `${what}: rotation must be 0, 90, 180 or 270` }
    if (it.label !== null && it.label !== undefined && typeof it.label !== 'string') {
      return { ok: false, error: `${what}: label must be text` }
    }
    const err = rectError(it, what, it.rot as Rotation)
    if (err) return { ok: false, error: err }
    const label = typeof it.label === 'string' ? it.label.trim().slice(0, 60) || null : null
    outItems.push({
      id: it.id, kind: it.kind as FloorItemKind, label, rot: it.rot as Rotation,
      x: it.x as number, y: it.y as number, w: it.w as number, d: it.d as number,
      locked: it.locked === true,
      group_id: typeof it.group_id === 'string' && groupIds.has(it.group_id) ? it.group_id : null,
    })
  }

  return { ok: true, value: { version: 1, rooms: outRooms, items: outItems, groups: outGroups } }
}
```

Change the `parseShelfInputs` signature and doc comment to:

```ts
/**
 * Validate the shelves sent with a plan; letters are upper-cased and must be
 * unique. With `groupIds`, a shelf's group must be one the plan names.
 */
export function parseShelfInputs(input: unknown, groupIds?: ReadonlySet<string>): Parsed<ShelfInput[]> {
```

and, inside the loop, replace the `out.push({ … })` call with:

```ts
    const group = s.group_id ?? null
    if (group !== null && (!isId(group) || (groupIds !== undefined && !groupIds.has(group)))) {
      return { ok: false, error: `${name}: unknown group` }
    }
    out.push({
      ...(typeof s.id === 'string' ? { id: s.id } : {}),
      shelf_letter: letter,
      rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm as number, y_cm: s.y_cm as number, width_cm: s.width_cm as number, depth_cm: s.depth_cm as number,
      rot: s.rot as Rotation, access_side: s.access_side,
      locked: s.locked === true,
      group_id: typeof group === 'string' ? group : null,
    })
```

- [ ] **Step 5: Implement layout, route and editor defaults**

In `src/lib/storage/layout.ts`:

Replace `type ShelfRow = Omit<StorageShelf, 'cubbies'>` with:

```ts
/** A lab_shelves row; lock and group may be missing on rows read before 2026-10-13. */
type ShelfRow = Omit<StorageShelf, 'cubbies' | 'locked' | 'group_id'> & { locked?: boolean | null; group_id?: string | null }
```

In `assembleLayout`, replace the `const shelves: StorageShelf[] = …` statement with:

```ts
  const floorPlan = plan.ok ? plan.value : EMPTY_FLOOR_PLAN
  const groupIds = new Set(floorPlan.groups.map((g) => g.id))
  const shelves: StorageShelf[] = rows.shelves.map((s) => ({
    ...s,
    locked: s.locked === true,
    group_id: s.group_id && groupIds.has(s.group_id) ? s.group_id : null,
    cubbies: (byShelf.get(s.id) ?? []).sort((a, b) => a.row - b.row || a.column - b.column),
  }))
```

and in the `return`, use `floor_plan: floorPlan`. Change `SHELF_COLUMNS` to:

```ts
const SHELF_COLUMNS =
  'id, shelf_letter, rows, columns, samples_per_position, x_cm, y_cm, width_cm, depth_cm, rot, access_side, company_id, locked, group_id'
```

In `src/app/api/laboratories/[id]/storage/route.ts`, replace

```ts
  const shelves = parseShelfInputs(body?.shelves)
```

with

```ts
  const shelves = parseShelfInputs(body?.shelves, new Set(plan.value.groups.map((g) => g.id)))
```

In `src/components/storage/blueprint/editor-state.ts`:

Add `parseFloorPlan` to the import from `@/lib/storage/floor-plan`. Replace `fromLayout` with:

```ts
/** The editor's copy of a layout; older bodies without lock or group read as unlocked and ungrouped. */
export function fromLayout(layout: Pick<StorageLayout, 'laboratory' | 'shelves'>): EditorDoc {
  const plan = parseFloorPlan(layout.laboratory.floor_plan)
  return {
    plan: plan.ok ? plan.value : layout.laboratory.floor_plan,
    shelves: layout.shelves.map((s) => ({ ...s, key: s.id, locked: s.locked === true, group_id: s.group_id ?? null })),
  }
}
```

In `toSavePayload`, after `access_side: s.access_side,` add `locked: s.locked, group_id: s.group_id,`.

In the reducer's `add` case: the room becomes `{ id, ...rect, name: null, locked: false }`; the new shelf gains `locked: false, group_id: null,`; the item becomes `{ id, kind: shape, label: null, rot: 0, locked: false, group_id: null, ...rect }`.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run src/lib/storage src/app/api/laboratories src/components/storage`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors. (If a test fixture elsewhere builds an `EditorShelf` or `FloorItem` by hand, add `locked: false, group_id: null` to it.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage src/app/api/laboratories src/components/storage/blueprint/editor-state.ts src/components/storage/blueprint/editor-state.test.ts src/components/storage/blueprint/inspector.test.tsx
git commit -m "feat(storage): lock, groups and room names load and save with the plan"
```

---

### Task 2: Shelf lock and group columns (SQL)

**Files:**
- Create: `database/migrations/20261013000001_storage_lock_groups.sql`
- Modify: `database/tests/storage_blueprint_scenarios.sql`

**Interfaces:**
- Consumes: the payload from Task 1 (`locked`, `group_id` on each shelf; `groups` in the plan).
- Produces: `lab_shelves.locked boolean not null default false`, `lab_shelves.group_id text` (1..64 or null); `save_lab_floor_plan(uuid, jsonb, jsonb)` writes both.

- [ ] **Step 1: Write the migration**

Create `database/migrations/20261013000001_storage_lock_groups.sql`:

```sql
-- Storage editor: lock and group on shelves
-- (spec docs/superpowers/specs/2026-10-13-storage-editor-menu-groups-design.md).
-- Rooms and furniture keep lock and group in laboratories.floor_plan; shelves
-- are rows, so they get two columns. save_lab_floor_plan writes them, and a
-- group id the plan does not name is stored as NULL.

BEGIN;

ALTER TABLE public.lab_shelves
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE public.lab_shelves DROP CONSTRAINT IF EXISTS lab_shelves_group_id_valid;
ALTER TABLE public.lab_shelves
  ADD CONSTRAINT lab_shelves_group_id_valid CHECK (group_id IS NULL OR length(group_id) BETWEEN 1 AND 64);

CREATE OR REPLACE FUNCTION public.save_lab_floor_plan(p_lab uuid, p_plan jsonb, p_shelves jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_shelf jsonb;
  v_id uuid;
  v_letter text;
  v_rows integer;
  v_cols integer;
  v_cap integer;
  v_next_number integer;
  v_conflicts text[] := ARRAY[]::text[];
  v_payload_ids uuid[];
  v_group_ids text[];
  v_group text;
  v_locked boolean;
BEGIN
  -- Who: global admins, global quality admins, this lab's quality manager.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR p.qc_role::text IN ('global_admin', 'global_quality_admin')
           OR (p.qc_role::text = 'lab_quality_manager' AND p.laboratory_id = p_lab))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_shelves) IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  -- One save at a time per lab.
  PERFORM 1 FROM laboratories WHERE id = p_lab FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_lab' USING ERRCODE = '22023';
  END IF;

  v_payload_ids := ARRAY(
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_shelves) e WHERE e->>'id' IS NOT NULL);

  -- A shelf id this lab does not have: the plan changed elsewhere.
  IF EXISTS (
    SELECT 1 FROM unnest(v_payload_ids) pid
    WHERE NOT EXISTS (SELECT 1 FROM lab_shelves sh WHERE sh.id = pid AND sh.laboratory_id = p_lab)
  ) THEN
    RAISE EXCEPTION 'unknown_shelf' USING ERRCODE = '22023';
  END IF;

  -- Duplicate letters.
  v_conflicts := v_conflicts || ARRAY(
    SELECT 'Shelf letter ' || l || ' is used twice'
    FROM (SELECT upper(trim(e->>'shelf_letter')) AS l FROM jsonb_array_elements(p_shelves) e) x
    GROUP BY l HAVING count(*) > 1);

  -- Shelves dropped from the plan that still hold samples.
  v_conflicts := v_conflicts || ARRAY(
    SELECT 'Shelf ' || sh.shelf_letter || ' still holds samples in '
           || string_agg(sp.position_code, ', ' ORDER BY sp.row_number, sp.column_number)
    FROM lab_shelves sh
    JOIN storage_positions sp ON sp.shelf_id = sh.id
    JOIN storage_lab_occupancy(p_lab) o ON o.position_id = sp.id AND o.occupied > 0
    WHERE sh.laboratory_id = p_lab AND NOT (sh.id = ANY (v_payload_ids))
    GROUP BY sh.shelf_letter);

  -- Kept shelves whose new grid or capacity would drop samples.
  v_conflicts := v_conflicts || ARRAY(
    SELECT 'Cubby ' || sp.position_code || ' holds ' || o.occupied || ' samples'
           || CASE WHEN sp.row_number > (e->>'rows')::int OR sp.column_number > (e->>'columns')::int
                   THEN ' and is outside the new grid'
                   ELSE ', more than the new capacity of ' || (e->>'samples_per_position') END
    FROM jsonb_array_elements(p_shelves) e
    JOIN storage_positions sp ON sp.shelf_id = (e->>'id')::uuid
    JOIN storage_lab_occupancy(p_lab) o ON o.position_id = sp.id AND o.occupied > 0
    WHERE e->>'id' IS NOT NULL
      AND (sp.row_number > (e->>'rows')::int
           OR sp.column_number > (e->>'columns')::int
           OR o.occupied > (e->>'samples_per_position')::int));

  IF array_length(v_conflicts, 1) > 0 THEN
    RAISE EXCEPTION 'storage_conflict' USING ERRCODE = 'P0001', DETAIL = array_to_json(v_conflicts)::text;
  END IF;

  -- The groups this plan names; a shelf pointing anywhere else is ungrouped.
  v_group_ids := ARRAY(
    SELECT g->>'id'
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_plan->'groups') = 'array' THEN p_plan->'groups' ELSE '[]'::jsonb END) g
    WHERE g->>'id' IS NOT NULL);

  UPDATE laboratories SET floor_plan = p_plan WHERE id = p_lab;

  DELETE FROM lab_shelves sh WHERE sh.laboratory_id = p_lab AND NOT (sh.id = ANY (v_payload_ids));

  -- Free every code first so letters can move between shelves in one save.
  UPDATE storage_positions SET position_code = id::text WHERE laboratory_id = p_lab;

  v_next_number := COALESCE((SELECT max(shelf_number) FROM lab_shelves WHERE laboratory_id = p_lab), 0);

  FOR v_shelf IN SELECT e FROM jsonb_array_elements(p_shelves) e LOOP
    v_letter := upper(trim(v_shelf->>'shelf_letter'));
    v_rows := (v_shelf->>'rows')::int;
    v_cols := (v_shelf->>'columns')::int;
    v_cap := (v_shelf->>'samples_per_position')::int;
    v_locked := COALESCE(v_shelf->'locked' = 'true'::jsonb, false);
    v_group := CASE WHEN v_shelf->>'group_id' = ANY (v_group_ids) THEN v_shelf->>'group_id' END;

    IF v_shelf->>'id' IS NULL THEN
      v_id := gen_random_uuid();
      v_next_number := v_next_number + 1;
      INSERT INTO lab_shelves (id, laboratory_id, shelf_number, shelf_letter, rows, columns,
                               samples_per_position, position_layout, x_cm, y_cm, width_cm,
                               depth_cm, rot, access_side, locked, group_id)
      VALUES (v_id, p_lab, v_next_number, v_letter, v_rows, v_cols, v_cap, 'grid',
              (v_shelf->>'x_cm')::int, (v_shelf->>'y_cm')::int, (v_shelf->>'width_cm')::int,
              (v_shelf->>'depth_cm')::int, (v_shelf->>'rot')::smallint, v_shelf->>'access_side',
              v_locked, v_group);
    ELSE
      v_id := (v_shelf->>'id')::uuid;
      UPDATE lab_shelves SET
        shelf_letter = v_letter, rows = v_rows, columns = v_cols, samples_per_position = v_cap,
        x_cm = (v_shelf->>'x_cm')::int, y_cm = (v_shelf->>'y_cm')::int,
        width_cm = (v_shelf->>'width_cm')::int, depth_cm = (v_shelf->>'depth_cm')::int,
        rot = (v_shelf->>'rot')::smallint, access_side = v_shelf->>'access_side',
        locked = v_locked, group_id = v_group,
        updated_at = now()
      WHERE id = v_id;
    END IF;

    -- Cubbies outside the grid are empty (checked above).
    DELETE FROM storage_positions
    WHERE shelf_id = v_id AND (row_number > v_rows OR column_number > v_cols);

    -- Kept cubbies keep their id and zone; code and capacity follow the shelf.
    UPDATE storage_positions sp
    SET position_code = generate_position_code(v_letter, sp.row_number, sp.column_number),
        capacity_per_position = v_cap,
        updated_at = now()
    WHERE sp.shelf_id = v_id;

    INSERT INTO storage_positions (laboratory_id, shelf_id, position_code, row_number, column_number, capacity_per_position)
    SELECT p_lab, v_id, generate_position_code(v_letter, r, c), r, c, v_cap
    FROM generate_series(1, v_rows) r CROSS JOIN generate_series(1, v_cols) c
    WHERE NOT EXISTS (
      SELECT 1 FROM storage_positions sp WHERE sp.shelf_id = v_id AND sp.row_number = r AND sp.column_number = c);

    -- The text code on samples follows a renamed cubby.
    UPDATE samples s SET storage_position = sp.position_code
    FROM storage_positions sp
    WHERE s.storage_position_id = sp.id AND sp.shelf_id = v_id
      AND s.storage_position IS DISTINCT FROM sp.position_code;
  END LOOP;

  UPDATE laboratories l
  SET storage_capacity = COALESCE((
    SELECT sum(sh.rows * sh.columns * sh.samples_per_position) FROM lab_shelves sh WHERE sh.laboratory_id = p_lab), 0)
  WHERE l.id = p_lab;

  RETURN jsonb_build_object('storage_capacity', (SELECT storage_capacity FROM laboratories WHERE id = p_lab));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_lab_floor_plan(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_lab_floor_plan(uuid, jsonb, jsonb) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify (the last statement; the editor shows only its result): expect two
-- rows, locked boolean NO default false, group_id text YES.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'lab_shelves' AND column_name IN ('locked', 'group_id')
ORDER BY column_name;
```

- [ ] **Step 2: Add scenarios 12-13**

In `database/tests/storage_blueprint_scenarios.sql`, change the header's third line to `-- means every scenario passed. Needs the 20261007 and 20261013 migrations applied.` Then insert this block between the `END $$;` that closes scenarios 8-11 and the `-- 6. A lab user without a management role…` comment:

```sql
-- 12-13: lock and group on a shelf.
DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000a0001';
  v_a uuid;
  v_shelf jsonb;
BEGIN
  v_a := (SELECT id FROM public.lab_shelves WHERE laboratory_id = v_lab);
  v_shelf := (SELECT jsonb_build_object('id', id, 'shelf_letter', shelf_letter, 'rows', rows, 'columns', columns,
                'samples_per_position', samples_per_position, 'x_cm', x_cm, 'y_cm', y_cm, 'width_cm', width_cm,
                'depth_cm', depth_cm, 'rot', rot, 'access_side', access_side)
              FROM public.lab_shelves WHERE id = v_a);

  -- 12. Lock and group are kept, through a letter change.
  PERFORM public.save_lab_floor_plan(v_lab,
    '{"version":1,"rooms":[],"items":[],"groups":[{"id":"g1","name":"Wall rack"}]}'::jsonb,
    jsonb_build_array(v_shelf || '{"shelf_letter":"D","locked":true,"group_id":"g1"}'::jsonb));
  IF (SELECT locked FROM public.lab_shelves WHERE id = v_a) IS DISTINCT FROM true
     OR (SELECT group_id FROM public.lab_shelves WHERE id = v_a) IS DISTINCT FROM 'g1'
     OR (SELECT shelf_letter FROM public.lab_shelves WHERE id = v_a) IS DISTINCT FROM 'D' THEN
    RAISE EXCEPTION 'scenario 12: lock or group not kept';
  END IF;

  -- 13. A group the plan does not name is cleared; leaving `locked` out unlocks.
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    jsonb_build_array(v_shelf || '{"shelf_letter":"D","group_id":"nowhere"}'::jsonb));
  IF (SELECT group_id FROM public.lab_shelves WHERE id = v_a) IS NOT NULL
     OR (SELECT locked FROM public.lab_shelves WHERE id = v_a) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'scenario 13: unknown group kept or lock not cleared';
  END IF;
END $$;
```

- [ ] **Step 3: Lint for the SQL editor traps**

Run: `grep -niE "select[^;]*\binto\b|returning[^;]*\binto\b|create (temp|table)" database/migrations/20261013000001_storage_lock_groups.sql database/tests/storage_blueprint_scenarios.sql`
Expected: no output (exit 1).

- [ ] **Step 4: Commit, then hand the SQL to Daniel**

```bash
git add database/migrations/20261013000001_storage_lock_groups.sql database/tests/storage_blueprint_scenarios.sql
git commit -m "feat(storage): shelves keep lock and group; save_lab_floor_plan writes them"
```

Paste the whole migration in chat for Daniel to apply, then the whole scenario script. Expected: the migration's last result shows the two columns; the scenario script ends with "Success. No rows returned" (its first `set_config` row may be the only result shown). Continue with Task 3 while he runs them; do not push until he confirms both.

---

### Task 3: Arranging several shapes (`arrange.ts`)

**Files:**
- Create: `src/lib/storage/arrange.ts`
- Test: `src/lib/storage/arrange.test.ts`

**Interfaces:**
- Consumes: `Rect`, `Rotation`, `MAX_PLAN_CM` from `floor-plan.ts`; `footprint`, `fromFootprint` from `geometry.ts`.
- Produces:
  - `type Turn = 1 | -1` (1 = clockwise on screen)
  - `type AlignEdge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'`
  - `type Axis = 'h' | 'v'`
  - `interface Offset { dx: number; dy: number }`
  - `const DUPLICATE_GAP_CM = 10`
  - `unionRect(rects: Rect[]): Rect` (non-empty input)
  - `turnFootprint(fp: Rect, c: { x: number; y: number }, turn: Turn): Rect`
  - `onPlanOffset(box: Rect): Offset`
  - `alignOffsets(fps: Rect[], movable: boolean[], edge: AlignEdge): Offset[]`
  - `distributeOffsets(fps: Rect[], movable: boolean[], axis: Axis): Offset[]`
  - `duplicateOffset(box: Rect): Offset`
  - `moveFootprintBy(rect: Rect, rot: Rotation, o: Offset): Rect`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/arrange.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  alignOffsets, distributeOffsets, duplicateOffset, moveFootprintBy, onPlanOffset, turnFootprint, unionRect,
} from './arrange'

describe('unionRect', () => {
  it('is the box around every rectangle', () => {
    expect(unionRect([{ x: 0, y: 10, w: 100, d: 40 }, { x: 200, y: 0, w: 50, d: 20 }])).toEqual({ x: 0, y: 0, w: 250, d: 50 })
  })
})

describe('turnFootprint', () => {
  it('turns two shapes side by side into a column about their shared centre', () => {
    const a = { x: 0, y: 0, w: 100, d: 40 }
    const b = { x: 200, y: 0, w: 100, d: 40 }
    const c = { x: 150, y: 20 }
    expect(turnFootprint(a, c, 1)).toEqual({ x: 130, y: -130, w: 40, d: 100 })
    expect(turnFootprint(b, c, 1)).toEqual({ x: 130, y: 70, w: 40, d: 100 })
  })

  it('comes back after a turn each way', () => {
    const a = { x: 40, y: 60, w: 120, d: 40 }
    const c = { x: 300, y: 200 }
    expect(turnFootprint(turnFootprint(a, c, 1), c, -1)).toEqual(a)
  })
})

describe('onPlanOffset', () => {
  it('moves a set back onto the plan, and leaves one already on it', () => {
    expect(onPlanOffset({ x: 130, y: -130, w: 40, d: 300 })).toEqual({ dx: 0, dy: 130 })
    expect(onPlanOffset({ x: 9990, y: 0, w: 40, d: 40 })).toEqual({ dx: -30, dy: 0 })
    expect(onPlanOffset({ x: 10, y: 10, w: 40, d: 40 })).toEqual({ dx: 0, dy: 0 })
  })
})

describe('alignOffsets', () => {
  it('lines shapes up with the left edge; a locked one stays and anchors', () => {
    const fps = [{ x: 0, y: 0, w: 100, d: 40 }, { x: 50, y: 100, w: 80, d: 40 }]
    expect(alignOffsets(fps, [false, true], 'left')).toEqual([{ dx: 0, dy: 0 }, { dx: -50, dy: 0 }])
    expect(alignOffsets(fps, [true, true], 'bottom')).toEqual([{ dx: 0, dy: 100 }, { dx: 0, dy: 0 }])
  })
})

describe('distributeOffsets', () => {
  it('leaves equal gaps between the first and the last', () => {
    const fps = [{ x: 0, y: 0, w: 100, d: 40 }, { x: 500, y: 0, w: 100, d: 40 }, { x: 150, y: 0, w: 100, d: 40 }]
    expect(distributeOffsets(fps, [true, true, true], 'h')).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 100, dy: 0 }])
  })

  it('needs three shapes', () => {
    const fps = [{ x: 0, y: 0, w: 100, d: 40 }, { x: 500, y: 0, w: 100, d: 40 }]
    expect(distributeOffsets(fps, [true, true], 'h')).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }])
  })
})

describe('duplicateOffset', () => {
  it('puts copies to the right, or below when the right edge is near', () => {
    expect(duplicateOffset({ x: 0, y: 0, w: 300, d: 40 })).toEqual({ dx: 310, dy: 0 })
    expect(duplicateOffset({ x: 9800, y: 0, w: 150, d: 40 })).toEqual({ dx: 0, dy: 50 })
  })
})

describe('moveFootprintBy', () => {
  it('moves a turned shape by what it covers', () => {
    // 120 x 40 turned 90 covers 40 x 120 centred on it: stored x 50 covers from x 90.
    expect(moveFootprintBy({ x: 50, y: 50, w: 120, d: 40 }, 90, { dx: 10, dy: -20 })).toEqual({ x: 60, y: 30, w: 120, d: 40 })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/storage/arrange.test.ts`
Expected: FAIL with "Failed to resolve import './arrange'".

- [ ] **Step 3: Implement `arrange.ts`**

Create `src/lib/storage/arrange.ts`:

```ts
/**
 * Arranging several shapes at once by what they cover on the floor
 * (footprints, whole centimetres): their combined box, a quarter turn of the
 * set about its centre, keeping a set on the plan, align, distribute, and
 * where a duplicate goes.
 */
import { MAX_PLAN_CM, type Rect, type Rotation } from './floor-plan'
import { footprint, fromFootprint } from './geometry'

/** 1 turns clockwise on screen (y grows downwards), -1 anticlockwise. */
export type Turn = 1 | -1
export type AlignEdge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'
export type Axis = 'h' | 'v'
export interface Offset { dx: number; dy: number }

export const DUPLICATE_GAP_CM = 10

const NONE: Offset = { dx: 0, dy: 0 }

/** The box around every rectangle; callers pass at least one. */
export function unionRect(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.d))
  return { x: minX, y: minY, w: maxX - minX, d: maxY - minY }
}

/** A footprint turned a quarter about `c`: its centre goes round `c`, width and depth swap. */
export function turnFootprint(fp: Rect, c: { x: number; y: number }, turn: Turn): Rect {
  const dx = fp.x + fp.w / 2 - c.x
  const dy = fp.y + fp.d / 2 - c.y
  const cx = c.x + (turn === 1 ? -dy : dy)
  const cy = c.y + (turn === 1 ? dx : -dx)
  return { x: Math.round(cx - fp.d / 2), y: Math.round(cy - fp.w / 2), w: fp.d, d: fp.w }
}

/** How far to move a set so its box lies on the plan (0..MAX_PLAN_CM); zero when it already does. */
export function onPlanOffset(box: Rect): Offset {
  const fix = (start: number, size: number) =>
    start < 0 ? -start : start + size > MAX_PLAN_CM ? MAX_PLAN_CM - (start + size) : 0
  return { dx: fix(box.x, box.w), dy: fix(box.y, box.d) }
}

/** Offsets lining each movable footprint up with an edge (or centre line) of the combined box. */
export function alignOffsets(fps: Rect[], movable: boolean[], edge: AlignEdge): Offset[] {
  const box = unionRect(fps)
  return fps.map((r, i) => {
    if (!movable[i]) return NONE
    switch (edge) {
      case 'left': return { dx: box.x - r.x, dy: 0 }
      case 'right': return { dx: box.x + box.w - (r.x + r.w), dy: 0 }
      case 'centre': return { dx: Math.round(box.x + box.w / 2 - (r.x + r.w / 2)), dy: 0 }
      case 'top': return { dx: 0, dy: box.y - r.y }
      case 'bottom': return { dx: 0, dy: box.y + box.d - (r.y + r.d) }
      case 'middle': return { dx: 0, dy: Math.round(box.y + box.d / 2 - (r.y + r.d / 2)) }
    }
  })
}

/**
 * Offsets leaving equal gaps between footprints along an axis. The first and
 * the last (by position) stay put; a locked one in between keeps its place.
 */
export function distributeOffsets(fps: Rect[], movable: boolean[], axis: Axis): Offset[] {
  const out = fps.map(() => NONE)
  if (fps.length < 3) return out
  const start = (r: Rect) => (axis === 'h' ? r.x : r.y)
  const size = (r: Rect) => (axis === 'h' ? r.w : r.d)
  const order = fps.map((_, i) => i).sort((a, b) => start(fps[a]) - start(fps[b]))
  const first = order[0]
  const last = order[order.length - 1]
  const span = start(fps[last]) + size(fps[last]) - start(fps[first])
  const gap = (span - order.reduce((n, i) => n + size(fps[i]), 0)) / (order.length - 1)
  let at = start(fps[first])
  for (const i of order) {
    if (movable[i] && i !== first && i !== last) {
      const d = Math.round(at) - start(fps[i])
      out[i] = axis === 'h' ? { dx: d, dy: 0 } : { dx: 0, dy: d }
    }
    at += size(fps[i]) + gap
  }
  return out
}

/** Where copies of a set go: right of it, else below, else left, else above; in place if none fits. */
export function duplicateOffset(box: Rect): Offset {
  const fits = (o: Offset) => {
    const x = box.x + o.dx
    const y = box.y + o.dy
    return x >= 0 && y >= 0 && x + box.w <= MAX_PLAN_CM && y + box.d <= MAX_PLAN_CM
  }
  const tries: Offset[] = [
    { dx: box.w + DUPLICATE_GAP_CM, dy: 0 },
    { dx: 0, dy: box.d + DUPLICATE_GAP_CM },
    { dx: -(box.w + DUPLICATE_GAP_CM), dy: 0 },
    { dx: 0, dy: -(box.d + DUPLICATE_GAP_CM) },
  ]
  return tries.find(fits) ?? NONE
}

/** A shape's stored rectangle after what it covers moves by an offset. */
export function moveFootprintBy(rect: Rect, rot: Rotation, o: Offset): Rect {
  const fp = footprint({ ...rect, rot })
  return fromFootprint({ ...fp, x: fp.x + o.dx, y: fp.y + o.dy }, rot)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/storage/arrange.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/arrange.ts src/lib/storage/arrange.test.ts
git commit -m "feat(storage): arrange sets of shapes by footprint (turn, align, distribute, duplicate)"
```

---

### Task 4: Selection becomes a list

The reducer moves from `selected: ShapeRef | null` to `selection: ShapeRef[]`, clicking a group member selects its group, and rotate / nudge / lock / delete act on the selection with lock refusals. Consumers change only as far as needed to keep today's behaviour: the canvas shows outlines for every selected shape and handles for one, the inspector shows the single-shape panel for one shape and a count otherwise. Multi-shape gestures come in Part B.

**Files:**
- Modify: `src/components/storage/blueprint/editor-state.ts`
- Modify: `src/components/storage/blueprint/use-blueprint-editor.ts`
- Modify: `src/components/storage/blueprint/blueprint-canvas.tsx`
- Modify: `src/components/storage/blueprint/inspector.tsx`
- Modify: `src/components/storage/blueprint/storage-workspace.tsx`
- Test: `src/components/storage/blueprint/editor-state.test.ts`, `src/components/storage/blueprint/inspector.test.tsx`

**Interfaces:**
- Consumes: Task 1 types; Task 3 `Turn`, `unionRect`, `turnFootprint`, `onPlanOffset`, `moveFootprintBy`.
- Produces (all exported from `editor-state.ts`):
  - `EditorState { doc; past; future; selection: ShapeRef[]; tool; dirty; notice: { seq: number; text: string } | null }`
  - `ShapeInfo` gains `locked: boolean; group: string | null`
  - `ShapePatch` gains `name?: string | null`
  - `interface RefPatch { ref: ShapeRef; patch: ShapePatch }`
  - Actions: `select { refs; exact? }`, `toggle { ref }`, `selectAll`, `patchMany { patches; record }`, `rotate { turn }`, `nudge { dx; dy }`, `lock { locked }`, `delete` (no ref); `patch` unchanged.
  - `LOCKED_NOTICE = 'Unlock it first'`
  - `refFromKey(k: string): ShapeRef | null`, `isSelected(selection, ref): boolean`
  - `shapeLocked(doc, ref): boolean`, `shapeGroupId(doc, ref): string | null`, `groupMembers(doc, groupId): ShapeRef[]`
  - `expandSelection(doc, refs): ShapeRef[]`, `selectedShapes(doc, selection): ShapeInfo[]`, `pruneGroups(doc): EditorDoc`
  - `findShape` also returns `room?: FloorRoom`
- Hook actions (Task 4): `select(refs, exact = false)`, `toggle(ref)`, `selectAll()`, `patchMany(patches, record = false)`, `rotate(turn: Turn = 1)`, `nudge(dx, dy)`, `lock(locked)`, `remove()`; `load`, `saved`, `setTool`, `checkpoint`, `add`, `patch`, `undo`, `redo` unchanged.

- [ ] **Step 1: Write the failing reducer tests**

In `src/components/storage/blueprint/editor-state.test.ts`:

Change the import to:

```ts
import { EMPTY_FLOOR_PLAN, type FloorItem } from '@/lib/storage/floor-plan'
import {
  editorReducer, fromLayout, initialEditorState, nextShelfLetter, toSavePayload, LOCKED_NOTICE,
  type EditorDoc, type EditorShelf,
} from './editor-state'
```

In "adds a room…", replace `expect(s.selected).toEqual({ kind: 'room', key: 'r1' })` with `expect(s.selection).toEqual([{ kind: 'room', key: 'r1' }])`.

Replace the test "records inspector edits, rotates and deletes" with:

```ts
  it('records inspector edits, rotates and deletes the selection', () => {
    const ref = { kind: 'shelf' as const, key: 's-a' }
    let s = editorReducer(initialEditorState(doc), { type: 'patch', ref, patch: { rows: 3, shelf_letter: ' c ' }, record: true })
    expect(s.doc.shelves[0]).toMatchObject({ rows: 3, shelf_letter: 'C' })
    s = editorReducer(s, { type: 'select', refs: [ref] })
    s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc.shelves[0].rot).toBe(90)
    s = editorReducer(s, { type: 'delete' })
    expect(s.doc.shelves).toEqual([])
    expect(s.selection).toEqual([])
    expect(s.past).toHaveLength(3)
  })
```

Append after the `describe('helpers', …)` block:

```ts
const R1 = { kind: 'room' as const, key: 'r1' }
const I1 = { kind: 'item' as const, key: 'i1' }
const I2 = { kind: 'item' as const, key: 'i2' }
const SA = { kind: 'shelf' as const, key: 's-a' }
const SB = { kind: 'shelf' as const, key: 's-b' }

const bench = (id: string, x: number, over: Partial<FloorItem> = {}): FloorItem => ({
  id, kind: 'bench', label: null, x, y: 300, w: 100, d: 50, rot: 0, locked: false, group_id: null, ...over,
})
const shelfAt = (key: string, letter: string, x: number, over: Partial<EditorShelf> = {}): EditorShelf => ({
  key, id: key, shelf_letter: letter, rows: 1, columns: 2, samples_per_position: 42,
  x_cm: x, y_cm: 0, width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front',
  locked: false, group_id: null, company_id: null, cubbies: [], ...over,
})
const grouped: EditorDoc = {
  plan: {
    version: 1,
    rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600, name: null, locked: false }],
    items: [bench('i1', 100, { group_id: 'g1' }), bench('i2', 300, { group_id: 'g1' })],
    groups: [{ id: 'g1', name: 'Bench pair' }],
  },
  shelves: [shelfAt('s-a', 'A', 0), shelfAt('s-b', 'B', 200)],
}
const start = (d: EditorDoc = grouped) => initialEditorState(d)

describe('selection', () => {
  it('selects a whole group on click, and one member when asked exactly', () => {
    expect(editorReducer(start(), { type: 'select', refs: [I1] }).selection).toEqual([I1, I2])
    expect(editorReducer(start(), { type: 'select', refs: [I1], exact: true }).selection).toEqual([I1])
  })

  it('adds and removes a group as a whole on Shift+click', () => {
    let s = editorReducer(start(), { type: 'toggle', ref: SA })
    expect(s.selection).toEqual([SA])
    s = editorReducer(s, { type: 'toggle', ref: I2 })
    expect(s.selection).toEqual([SA, I1, I2])
    s = editorReducer(s, { type: 'toggle', ref: I1 })
    expect(s.selection).toEqual([SA])
  })

  it('selects every shape', () => {
    expect(editorReducer(start(), { type: 'selectAll' }).selection).toEqual([R1, I1, I2, SA, SB])
  })
})

describe('turning, nudging and locks', () => {
  it('turns two shelves side by side into a column, kept on the plan, as one undo step', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA, SB] })
    s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc.shelves.map((x) => [x.x_cm, x.y_cm, x.rot])).toEqual([[100, 30, 90], [100, 230, 90]])
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.shelves.map((x) => [x.x_cm, x.y_cm, x.rot])).toEqual([[0, 0, 0], [200, 0, 0]])
  })

  it('never turns a room', () => {
    const s = editorReducer(editorReducer(start(), { type: 'select', refs: [R1] }), { type: 'rotate', turn: 1 })
    expect(s.past).toHaveLength(0)
  })

  it('refuses to move, turn or delete a locked shape, but edits its details', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA] })
    s = editorReducer(s, { type: 'lock', locked: true })
    expect(s.doc.shelves[0].locked).toBe(true)
    const locked = s.doc
    s = editorReducer(s, { type: 'rotate', turn: 1 })
    expect(s.doc).toBe(locked)
    expect(s.notice).toEqual({ seq: 1, text: LOCKED_NOTICE })
    s = editorReducer(s, { type: 'patch', ref: SA, patch: { x: 10 }, record: true })
    expect(s.notice?.seq).toBe(2)
    s = editorReducer(s, { type: 'delete' })
    expect(s.doc.shelves).toHaveLength(2)
    s = editorReducer(s, { type: 'patch', ref: SA, patch: { shelf_letter: 'Z' }, record: true })
    expect(s.doc.shelves[0].shelf_letter).toBe('Z')
  })

  it('nudges the selection and keeps it on the plan', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA] })
    s = editorReducer(s, { type: 'nudge', dx: -10, dy: 0 })
    expect(s.doc.shelves[0].x_cm).toBe(0)
    s = editorReducer(s, { type: 'nudge', dx: 10, dy: 1 })
    expect([s.doc.shelves[0].x_cm, s.doc.shelves[0].y_cm]).toEqual([10, 1])
  })

  it('puts a whole group drag back with one undo', () => {
    let s = editorReducer(start(), { type: 'checkpoint' })
    s = editorReducer(s, { type: 'patchMany', record: false, patches: [{ ref: I1, patch: { x: 110 } }, { ref: I2, patch: { x: 310 } }] })
    s = editorReducer(s, { type: 'patchMany', record: false, patches: [{ ref: I1, patch: { x: 120 } }, { ref: I2, patch: { x: 320 } }] })
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.plan.items.map((i) => i.x)).toEqual([100, 300])
  })

  it('dissolves a group left with one member when the other is deleted', () => {
    let s = editorReducer(start(), { type: 'select', refs: [I1], exact: true })
    s = editorReducer(s, { type: 'delete' })
    expect(s.doc.plan.items).toEqual([bench('i2', 300)])
    expect(s.doc.plan.groups).toEqual([])
  })

  it('names a room', () => {
    const s = editorReducer(start(), { type: 'patch', ref: R1, patch: { name: '  Sample room  ' }, record: true })
    expect(s.doc.plan.rooms[0].name).toBe('Sample room')
  })

  it('never saves a group with one member', () => {
    const lonely: EditorDoc = { ...grouped, plan: { ...grouped.plan, items: [bench('i1', 100, { group_id: 'g1' })] } }
    const payload = toSavePayload(lonely)
    expect(payload.floor_plan.groups).toEqual([])
    expect(payload.floor_plan.items[0].group_id).toBeNull()
  })
})
```

In `src/components/storage/blueprint/inspector.test.tsx`, change the two renders to `selection={[{ kind: 'shelf', key: 'a' }]}` and `selection={[{ kind: 'shelf', key: 'b' }]}`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/editor-state.test.ts`
Expected: FAIL (no `selection`, no `toggle`, `rotate` needs a ref, …).

- [ ] **Step 3: Rewrite `editor-state.ts`**

Replace `src/components/storage/blueprint/editor-state.ts` with:

```ts
/**
 * The blueprint editor's state as a pure reducer: the document being drawn,
 * undo/redo history, the selection and the active tool. A drag is one undo
 * step: the canvas sends `checkpoint` on the first movement, then unrecorded
 * patches. Clicking a group member selects the whole group; a locked shape
 * refuses anything that would move it, and says so through `notice`.
 */
import {
  cleanName, parseFloorPlan,
  type AccessSide, type FloorItem, type FloorItemKind, type FloorPlan, type FloorRoom, type Rect, type Rotation,
  type ShelfInput,
} from '@/lib/storage/floor-plan'
import { footprint, fromFootprint, snap } from '@/lib/storage/geometry'
import { moveFootprintBy, onPlanOffset, turnFootprint, unionRect, type Turn } from '@/lib/storage/arrange'
import type { Cubby, StorageLayout } from '@/lib/storage/layout'

export type ShapeKind = 'room' | 'item' | 'shelf'
export interface ShapeRef { kind: ShapeKind; key: string }
export interface EditorShelf extends ShelfInput { key: string; company_id: string | null; cubbies: Cubby[] }
export interface EditorDoc { plan: FloorPlan; shelves: EditorShelf[] }
export type Tool = 'select' | 'room' | 'shelf' | FloorItemKind
export type DrawTool = Exclude<Tool, 'select'>

export interface EditorState {
  doc: EditorDoc
  past: EditorDoc[]
  future: EditorDoc[]
  selection: ShapeRef[]
  tool: Tool
  dirty: boolean
  /** Why the last action was refused; `seq` changes on every refusal so each one can be shown. */
  notice: { seq: number; text: string } | null
}

export type ShapePatch = Partial<Rect> & {
  rot?: Rotation
  label?: string | null
  name?: string | null
  kind?: FloorItemKind
  shelf_letter?: string
  rows?: number
  columns?: number
  samples_per_position?: number
  access_side?: AccessSide
}

export interface RefPatch { ref: ShapeRef; patch: ShapePatch }

export type EditorAction =
  | { type: 'load'; doc: EditorDoc }
  | { type: 'tool'; tool: Tool }
  | { type: 'select'; refs: ShapeRef[]; exact?: boolean }
  | { type: 'toggle'; ref: ShapeRef }
  | { type: 'selectAll' }
  | { type: 'checkpoint' }
  | { type: 'add'; shape: DrawTool; rect: Rect; id: string }
  | { type: 'patch'; ref: ShapeRef; patch: ShapePatch; record: boolean }
  | { type: 'patchMany'; patches: RefPatch[]; record: boolean }
  | { type: 'rotate'; turn: Turn }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'lock'; locked: boolean }
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; doc: EditorDoc }

export interface ShapeInfo {
  ref: ShapeRef
  rect: Rect
  rot: Rotation
  fp: Rect
  blocks: boolean
  locked: boolean
  group: string | null
}

export const LOCKED_NOTICE = 'Unlock it first'

const HISTORY = 100

export function initialEditorState(doc: EditorDoc): EditorState {
  return { doc, past: [], future: [], selection: [], tool: 'select', dirty: false, notice: null }
}

export const shapeKey = (ref: ShapeRef): string => `${ref.kind}:${ref.key}`
export const sameRef = (a: ShapeRef | null | undefined, b: ShapeRef | null | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.key === b.key
export const isSelected = (selection: ShapeRef[], ref: ShapeRef): boolean => selection.some((r) => sameRef(r, ref))

/** The inverse of shapeKey: `shelf:abc` back to a ref; null for anything else. */
export function refFromKey(k: string): ShapeRef | null {
  const i = k.indexOf(':')
  const kind = k.slice(0, i)
  if (i < 1 || (kind !== 'room' && kind !== 'item' && kind !== 'shelf')) return null
  return { kind, key: k.slice(i + 1) }
}

export function shelfRect(s: Pick<ShelfInput, 'x_cm' | 'y_cm' | 'width_cm' | 'depth_cm'>): Rect {
  return { x: s.x_cm, y: s.y_cm, w: s.width_cm, d: s.depth_cm }
}

const rectOf = (r: Rect): Rect => ({ x: r.x, y: r.y, w: r.w, d: r.d })

export function listShapes(doc: EditorDoc): ShapeInfo[] {
  const rooms: ShapeInfo[] = doc.plan.rooms.map((r) => ({
    ref: { kind: 'room', key: r.id }, rect: rectOf(r), rot: 0, fp: rectOf(r), blocks: false, locked: r.locked, group: null,
  }))
  const items: ShapeInfo[] = doc.plan.items.map((it) => ({
    ref: { kind: 'item', key: it.id }, rect: rectOf(it), rot: it.rot, fp: footprint(it),
    blocks: it.kind !== 'door' && it.kind !== 'window', locked: it.locked, group: it.group_id,
  }))
  const shelves: ShapeInfo[] = doc.shelves.map((s) => {
    const rect = shelfRect(s)
    return {
      ref: { kind: 'shelf', key: s.key }, rect, rot: s.rot, fp: footprint({ ...rect, rot: s.rot }),
      blocks: true, locked: s.locked, group: s.group_id,
    }
  })
  return [...rooms, ...items, ...shelves]
}

export function findShape(doc: EditorDoc, ref: ShapeRef | null):
  { info: ShapeInfo; room?: FloorRoom; item?: FloorItem; shelf?: EditorShelf } | null {
  if (!ref) return null
  const info = listShapes(doc).find((s) => sameRef(s.ref, ref))
  if (!info) return null
  if (ref.kind === 'room') return { info, room: doc.plan.rooms.find((r) => r.id === ref.key) }
  if (ref.kind === 'item') return { info, item: doc.plan.items.find((i) => i.id === ref.key) }
  return { info, shelf: doc.shelves.find((s) => s.key === ref.key) }
}

export function shapeLocked(doc: EditorDoc, ref: ShapeRef): boolean {
  if (ref.kind === 'room') return doc.plan.rooms.find((r) => r.id === ref.key)?.locked === true
  if (ref.kind === 'item') return doc.plan.items.find((i) => i.id === ref.key)?.locked === true
  return doc.shelves.find((s) => s.key === ref.key)?.locked === true
}

export function shapeGroupId(doc: EditorDoc, ref: ShapeRef): string | null {
  if (ref.kind === 'item') return doc.plan.items.find((i) => i.id === ref.key)?.group_id ?? null
  if (ref.kind === 'shelf') return doc.shelves.find((s) => s.key === ref.key)?.group_id ?? null
  return null
}

export function groupMembers(doc: EditorDoc, groupId: string): ShapeRef[] {
  return [
    ...doc.plan.items.filter((i) => i.group_id === groupId).map((i): ShapeRef => ({ kind: 'item', key: i.id })),
    ...doc.shelves.filter((s) => s.group_id === groupId).map((s): ShapeRef => ({ kind: 'shelf', key: s.key })),
  ]
}

function uniqueRefs(refs: ShapeRef[]): ShapeRef[] {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const k = shapeKey(r)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Every member of each group a ref belongs to; rooms and ungrouped shapes stand alone. */
export function expandSelection(doc: EditorDoc, refs: ShapeRef[]): ShapeRef[] {
  return uniqueRefs(refs.flatMap((r) => {
    const g = shapeGroupId(doc, r)
    return g ? groupMembers(doc, g) : [r]
  }))
}

/** The refs that still name a shape in `doc`, in the order given. */
function keepSelection(doc: EditorDoc, refs: ShapeRef[]): ShapeRef[] {
  const keys = new Set(listShapes(doc).map((s) => shapeKey(s.ref)))
  return refs.filter((r) => keys.has(shapeKey(r)))
}

export function selectedShapes(doc: EditorDoc, selection: ShapeRef[]): ShapeInfo[] {
  return listShapes(doc).filter((s) => isSelected(selection, s.ref))
}

export function nextShelfLetter(existing: string[]): string {
  const used = new Set(existing.map((l) => l.toUpperCase()))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const l of letters) if (!used.has(l)) return l
  for (const a of letters) for (const b of letters) if (!used.has(a + b)) return a + b
  return 'ZZ'
}

const DEFAULT_SIZES: Record<DrawTool, { w: number; d: number }> = {
  room: { w: 600, d: 400 }, shelf: { w: 120, d: 40 }, bench: { w: 200, d: 70 }, table: { w: 160, d: 80 },
  cabinet: { w: 100, d: 50 }, equipment: { w: 80, d: 60 }, door: { w: 90, d: 20 }, window: { w: 120, d: 20 },
  other: { w: 100, d: 60 },
}

/** A click without a drag places the shape at its usual size, centred on the click. */
export function defaultRect(tool: DrawTool, at: { x: number; y: number }, free = false): Rect {
  const { w, d } = DEFAULT_SIZES[tool]
  return { x: Math.max(0, snap(at.x - w / 2, free)), y: Math.max(0, snap(at.y - d / 2, free)), w, d }
}

/** The editor's copy of a layout; older bodies without lock or group read as unlocked and ungrouped. */
export function fromLayout(layout: Pick<StorageLayout, 'laboratory' | 'shelves'>): EditorDoc {
  const plan = parseFloorPlan(layout.laboratory.floor_plan)
  return {
    plan: plan.ok ? plan.value : layout.laboratory.floor_plan,
    shelves: layout.shelves.map((s) => ({ ...s, key: s.id, locked: s.locked === true, group_id: s.group_id ?? null })),
  }
}

/** What PUT sends; a group left with fewer than two members is dropped first. */
export function toSavePayload(doc: EditorDoc): { floor_plan: FloorPlan; shelves: ShelfInput[] } {
  const d = pruneGroups(doc)
  return {
    floor_plan: d.plan,
    shelves: d.shelves.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
      locked: s.locked, group_id: s.group_id,
    })),
  }
}

function pickRect(p: ShapePatch): Partial<Rect> {
  const out: Partial<Rect> = {}
  if (p.x !== undefined) out.x = p.x
  if (p.y !== undefined) out.y = p.y
  if (p.w !== undefined) out.w = p.w
  if (p.d !== undefined) out.d = p.d
  return out
}

function patchShelf(s: EditorShelf, p: ShapePatch): EditorShelf {
  return {
    ...s,
    ...(p.x !== undefined ? { x_cm: p.x } : {}),
    ...(p.y !== undefined ? { y_cm: p.y } : {}),
    ...(p.w !== undefined ? { width_cm: p.w } : {}),
    ...(p.d !== undefined ? { depth_cm: p.d } : {}),
    ...(p.rot !== undefined ? { rot: p.rot } : {}),
    ...(p.shelf_letter !== undefined ? { shelf_letter: p.shelf_letter.trim().toUpperCase() } : {}),
    ...(p.rows !== undefined ? { rows: p.rows } : {}),
    ...(p.columns !== undefined ? { columns: p.columns } : {}),
    ...(p.samples_per_position !== undefined ? { samples_per_position: p.samples_per_position } : {}),
    ...(p.access_side !== undefined ? { access_side: p.access_side } : {}),
  }
}

function applyPatch(doc: EditorDoc, ref: ShapeRef, p: ShapePatch): EditorDoc {
  if (ref.kind === 'room') {
    return {
      ...doc,
      plan: {
        ...doc.plan,
        rooms: doc.plan.rooms.map((r) => (r.id === ref.key
          ? { ...r, ...pickRect(p), ...(p.name !== undefined ? { name: cleanName(p.name) } : {}) }
          : r)),
      },
    }
  }
  if (ref.kind === 'item') {
    return {
      ...doc,
      plan: {
        ...doc.plan,
        items: doc.plan.items.map((it) =>
          it.id === ref.key
            ? {
                ...it,
                ...pickRect(p),
                ...(p.rot !== undefined ? { rot: p.rot } : {}),
                ...(p.label !== undefined ? { label: p.label?.trim() || null } : {}),
                ...(p.kind !== undefined ? { kind: p.kind } : {}),
              }
            : it,
        ),
      },
    }
  }
  return { ...doc, shelves: doc.shelves.map((s) => (s.key === ref.key ? patchShelf(s, p) : s)) }
}

const applyMany = (doc: EditorDoc, patches: RefPatch[]): EditorDoc =>
  patches.reduce((d, p) => applyPatch(d, p.ref, p.patch), doc)

function removeShapes(doc: EditorDoc, refs: ShapeRef[]): EditorDoc {
  const gone = (kind: ShapeKind, key: string) => isSelected(refs, { kind, key })
  return {
    plan: {
      ...doc.plan,
      rooms: doc.plan.rooms.filter((r) => !gone('room', r.id)),
      items: doc.plan.items.filter((i) => !gone('item', i.id)),
    },
    shelves: doc.shelves.filter((s) => !gone('shelf', s.key)),
  }
}

function setLocked(doc: EditorDoc, refs: ShapeRef[], locked: boolean): EditorDoc {
  const on = (kind: ShapeKind, key: string) => isSelected(refs, { kind, key })
  return {
    plan: {
      ...doc.plan,
      rooms: doc.plan.rooms.map((r) => (on('room', r.id) ? { ...r, locked } : r)),
      items: doc.plan.items.map((i) => (on('item', i.id) ? { ...i, locked } : i)),
    },
    shelves: doc.shelves.map((s) => (on('shelf', s.key) ? { ...s, locked } : s)),
  }
}

/** A group needs two members: one left alone, or none, dissolves. */
export function pruneGroups(doc: EditorDoc): EditorDoc {
  const count = new Map<string, number>()
  for (const g of [...doc.plan.items.map((i) => i.group_id), ...doc.shelves.map((s) => s.group_id)]) {
    if (g) count.set(g, (count.get(g) ?? 0) + 1)
  }
  const keeps = (g: string | null): boolean => !!g && (count.get(g) ?? 0) >= 2
  return {
    plan: {
      ...doc.plan,
      items: doc.plan.items.map((i) => (i.group_id && !keeps(i.group_id) ? { ...i, group_id: null } : i)),
      groups: doc.plan.groups.filter((g) => keeps(g.id)),
    },
    shelves: doc.shelves.map((s) => (s.group_id && !keeps(s.group_id) ? { ...s, group_id: null } : s)),
  }
}

const turnRot = (rot: Rotation, turn: Turn): Rotation => ((rot + (turn === 1 ? 90 : 270)) % 360) as Rotation

/** Shapes turned a quarter about the centre of what they cover together, then kept on the plan. */
function turnShapes(shapes: ShapeInfo[], turn: Turn): RefPatch[] {
  const box = unionRect(shapes.map((s) => s.fp))
  const c = { x: box.x + box.w / 2, y: box.y + box.d / 2 }
  const turned = shapes.map((s) => ({ s, fp: turnFootprint(s.fp, c, turn), rot: turnRot(s.rot, turn) }))
  const o = onPlanOffset(unionRect(turned.map((t) => t.fp)))
  return turned.map(({ s, fp, rot }) => {
    const r = fromFootprint({ ...fp, x: fp.x + o.dx, y: fp.y + o.dy }, rot)
    return { ref: s.ref, patch: { x: r.x, y: r.y, rot } }
  })
}

/** Shapes moved together by an offset, stopping at the plan's edge. */
function moveShapes(shapes: ShapeInfo[], dx: number, dy: number): RefPatch[] {
  const box = unionRect(shapes.map((s) => s.fp))
  const fix = onPlanOffset({ ...box, x: box.x + dx, y: box.y + dy })
  const o = { dx: dx + fix.dx, dy: dy + fix.dy }
  return shapes.map((s) => {
    const r = moveFootprintBy(s.rect, s.rot, o)
    return { ref: s.ref, patch: { x: r.x, y: r.y } }
  })
}

const MOVES: Array<keyof ShapePatch> = ['x', 'y', 'w', 'd', 'rot']
const movesShape = (p: ShapePatch): boolean => MOVES.some((k) => p[k] !== undefined)

function refuse(s: EditorState, text = LOCKED_NOTICE): EditorState {
  return { ...s, notice: { seq: (s.notice?.seq ?? 0) + 1, text } }
}

function recorded(s: EditorState, doc: EditorDoc, extra: Partial<EditorState> = {}): EditorState {
  return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [], doc, dirty: true, ...extra }
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load':
      return initialEditorState(a.doc)
    case 'saved':
      return { ...initialEditorState(a.doc), selection: keepSelection(a.doc, s.selection) }
    case 'tool':
      return { ...s, tool: a.tool }
    case 'select':
      return { ...s, selection: keepSelection(s.doc, a.exact ? uniqueRefs(a.refs) : expandSelection(s.doc, a.refs)) }
    case 'toggle': {
      const set = keepSelection(s.doc, expandSelection(s.doc, [a.ref]))
      const all = set.every((r) => isSelected(s.selection, r))
      return { ...s, selection: all ? s.selection.filter((r) => !isSelected(set, r)) : uniqueRefs([...s.selection, ...set]) }
    }
    case 'selectAll':
      return { ...s, selection: listShapes(s.doc).map((x) => x.ref) }
    case 'checkpoint':
      return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [] }
    case 'add': {
      const { shape, rect, id } = a
      if (shape === 'room') {
        const doc = { ...s.doc, plan: { ...s.doc.plan, rooms: [...s.doc.plan.rooms, { id, ...rect, name: null, locked: false }] } }
        return recorded(s, doc, { selection: [{ kind: 'room', key: id }], tool: 'select' })
      }
      if (shape === 'shelf') {
        const shelf: EditorShelf = {
          key: id, shelf_letter: nextShelfLetter(s.doc.shelves.map((x) => x.shelf_letter)),
          rows: 6, columns: 4, samples_per_position: 42,
          x_cm: rect.x, y_cm: rect.y, width_cm: rect.w, depth_cm: rect.d, rot: 0, access_side: 'front',
          locked: false, group_id: null, company_id: null, cubbies: [],
        }
        return recorded(s, { ...s.doc, shelves: [...s.doc.shelves, shelf] }, { selection: [{ kind: 'shelf', key: id }], tool: 'select' })
      }
      const item: FloorItem = { id, kind: shape, label: null, rot: 0, locked: false, group_id: null, ...rect }
      const doc = { ...s.doc, plan: { ...s.doc.plan, items: [...s.doc.plan.items, item] } }
      return recorded(s, doc, { selection: [{ kind: 'item', key: id }], tool: 'select' })
    }
    case 'patch': {
      if (movesShape(a.patch) && shapeLocked(s.doc, a.ref)) return refuse(s)
      const doc = applyPatch(s.doc, a.ref, a.patch)
      return a.record ? recorded(s, doc) : { ...s, doc, dirty: true }
    }
    case 'patchMany': {
      if (a.patches.some((p) => movesShape(p.patch) && shapeLocked(s.doc, p.ref))) return refuse(s)
      const doc = applyMany(s.doc, a.patches)
      return a.record ? recorded(s, doc) : { ...s, doc, dirty: true }
    }
    case 'rotate': {
      const shapes = selectedShapes(s.doc, s.selection)
      if (shapes.length === 0 || shapes.some((x) => x.ref.kind === 'room')) return s
      if (shapes.some((x) => x.locked)) return refuse(s)
      return recorded(s, applyMany(s.doc, turnShapes(shapes, a.turn)))
    }
    case 'nudge': {
      const shapes = selectedShapes(s.doc, s.selection)
      if (shapes.length === 0) return s
      if (shapes.some((x) => x.locked)) return refuse(s)
      return recorded(s, applyMany(s.doc, moveShapes(shapes, a.dx, a.dy)))
    }
    case 'lock':
      return s.selection.length === 0 ? s : recorded(s, setLocked(s.doc, s.selection, a.locked))
    case 'delete': {
      if (s.selection.length === 0) return s
      if (s.selection.some((r) => shapeLocked(s.doc, r))) return refuse(s)
      return recorded(s, pruneGroups(removeShapes(s.doc, s.selection)), { selection: [] })
    }
    case 'undo': {
      if (s.past.length === 0) return s
      const doc = s.past[s.past.length - 1]
      return { ...s, doc, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: true, selection: keepSelection(doc, s.selection) }
    }
    case 'redo': {
      if (s.future.length === 0) return s
      const [doc, ...rest] = s.future
      return { ...s, doc, past: [...s.past, s.doc], future: rest, dirty: true, selection: keepSelection(doc, s.selection) }
    }
  }
}
```

- [ ] **Step 4: Update the hook**

In `src/components/storage/blueprint/use-blueprint-editor.ts`:

Change the imports to:

```ts
import { useEffect, useMemo, useReducer } from 'react'
import { EMPTY_FLOOR_PLAN, type Rect } from '@/lib/storage/floor-plan'
import type { Turn } from '@/lib/storage/arrange'
import {
  editorReducer, initialEditorState,
  type DrawTool, type EditorDoc, type RefPatch, type ShapePatch, type ShapeRef, type Tool,
} from './editor-state'
```

Replace the `actions` memo body with:

```ts
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
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
  }), [])
```

Replace `useEditorKeyboard` (Part B Task 7 moves and extends it) with:

```ts
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
```

- [ ] **Step 5: Adapt the canvas**

In `src/components/storage/blueprint/blueprint-canvas.tsx`:

- Add `isSelected` to the import from `./editor-state`.
- In `BlueprintCanvasProps`, replace `selected: ShapeRef | null` with `selection: ShapeRef[]` and `onSelect: (ref: ShapeRef | null) => void` with `onSelect: (refs: ShapeRef[], exact?: boolean) => void`.
- In the destructured props, replace `selected` with `selection`.
- In `onBackgroundDown`, replace `onSelect(null)` with `onSelect([])`.
- In `onShapeDown`, replace `onSelect(ref)` with `onSelect([ref], mode === 'view')`.
- Replace `const selectedShape = shapes.find((s) => sameRef(s.ref, selected))` with:

```ts
  const selectedShapes = shapes.filter((s) => isSelected(selection, s.ref))
  const single = selectedShapes.length === 1 ? selectedShapes[0] : null
```

- Replace the whole `{selectedShape && ( <g> … </g> )}` block with:

```tsx
        {selectedShapes.map((s) => (
          <rect key={`sel-${shapeKey(s.ref)}`} {...svgRect(s.fp)} fill="none" className="stroke-foreground" strokeDasharray="4 3"
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {single && mode === 'edit' && !single.locked && HANDLES.map((h) => {
          const p = handlePoint(single.fp, h)
          const s = px(9)
          return (
            <rect key={h} data-testid={`handle-${h}`} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
              className="fill-background stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              style={{ cursor: HANDLE_CURSOR[h] }}
              onPointerDown={onHandleDown(single.ref, single.rect, single.rot, h)} />
          )
        })}
```

- [ ] **Step 6: Adapt the inspector**

In `src/components/storage/blueprint/inspector.tsx`:

- In `InspectorProps`, replace `selected: ShapeRef | null` with `selection: ShapeRef[]`, `onRotate: (ref: ShapeRef) => void` with `onRotate: () => void`, and `onDelete: (ref: ShapeRef) => void` with `onDelete: () => void`.
- Replace the first lines of `Inspector` (through `const found = …` and its `if`) with:

```tsx
export function Inspector({ doc, selection, zones, onPatch, onRotate, onDelete }: InspectorProps) {
  if (selection.length > 1) {
    return <p className="text-sm text-muted-foreground">{selection.length} shapes selected.</p>
  }
  const selected = selection[0] ?? null
  const found = findShape(doc, selected)
  if (!selected || !found) {
    return <p className="text-sm text-muted-foreground">Select a shape to edit it, or pick a tool on the left and drag on the plan.</p>
  }
```

- In the footer, change `onClick={() => onDelete(selected)}` to `onClick={onDelete}` and `onClick={() => onRotate(selected)}` to `onClick={onRotate}`.

- [ ] **Step 7: Adapt the workspace**

In `src/components/storage/blueprint/storage-workspace.tsx`:

- Change `useEditorKeyboard(mode === 'edit', state.selected, actions)` to `useEditorKeyboard(mode === 'edit', state.selection, actions)`.
- Below it add:

```ts
  useEffect(() => { if (state.notice) toast({ title: state.notice.text }) }, [state.notice])
```

- Replace `select` with:

```ts
  const select = (refs: ShapeRef[], exact = false) => {
    actions.select(refs, exact)
    const only = refs.length === 1 ? refs[0] : null
    if (!only || only.kind !== 'shelf' || only.key !== highlight?.shelfKey) setHighlight(null)
  }
```

- Replace `const selectedShelfKey = state.selected?.kind === 'shelf' ? state.selected.key : null` with:

```ts
  const single = state.selection.length === 1 ? state.selection[0] : null
  const selectedShelfKey = single?.kind === 'shelf' ? single.key : null
```

- On `<BlueprintCanvas>`, change `selected={state.selected}` to `selection={state.selection}`.
- On `<Inspector>`, change `selected={state.selected}` to `selection={state.selection}`, `onRotate={actions.rotate}` to `onRotate={() => actions.rotate(1)}`, `onDelete={actions.remove}` stays.
- In the `ViewPanel` `onFound`, change `actions.select({ kind: 'shelf', key: shelfKey })` to `actions.select([{ kind: 'shelf', key: shelfKey }], true)`.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run src/components/storage src/lib/storage`
Expected: PASS (the overlay test's "first Escape only deselects" still holds).
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/storage/blueprint
git commit -m "feat(storage): the editor selects a list of shapes; groups select whole; locks refuse moves"
```

---

### Task 5: Groups, align, distribute, duplicate, copy and paste

**Files:**
- Modify: `src/components/storage/blueprint/editor-state.ts`
- Create: `src/components/storage/blueprint/clipboard.ts`
- Modify: `src/components/storage/blueprint/use-blueprint-editor.ts`
- Test: `src/components/storage/blueprint/editor-state.test.ts`, `src/components/storage/blueprint/clipboard.test.ts`

**Interfaces:**
- Consumes: Task 4 state and helpers; Task 3 `alignOffsets`, `distributeOffsets`, `duplicateOffset`, `AlignEdge`, `Axis`, `Offset`.
- Produces (from `editor-state.ts`):
  - `type ClipShelf = Omit<ShelfInput, 'id' | 'locked'>`
  - `interface Clip { version: 1; rooms: FloorRoom[]; items: FloorItem[]; shelves: ClipShelf[]; groups: FloorGroup[] }`
  - `copySelection(doc, selection): Clip | null`
  - `clipBox(clip: Clip): Rect`
  - `insertClip(doc, clip, o: Offset, seed: string): { doc: EditorDoc; refs: ShapeRef[] }`
  - `selectionGroup(doc, selection): FloorGroup | null`
  - Actions `group { id }`, `ungroup`, `renameGroup { id; name }`, `align { edge }`, `distribute { axis }`, `duplicate { seed }`, `paste { clip; at; seed }`
- From `clipboard.ts`: `CLIPBOARD_KEY = 'waqc.storage.clipboard'`, `writeClipboard(clip: Clip): void`, `readClipboard(): Clip | null`, `asClip(v: unknown): Clip | null`
- Hook actions: `group()`, `ungroup()`, `renameGroup(id, name)`, `align(edge)`, `distribute(axis)`, `duplicate()`, `paste(clip, at)`

- [ ] **Step 1: Write the failing reducer tests**

Append to `src/components/storage/blueprint/editor-state.test.ts` (and add `copySelection, selectionGroup` to the `./editor-state` import):

```ts
describe('groups', () => {
  it('groups two shelves, names the group and ungroups them', () => {
    let s = editorReducer(start(), { type: 'select', refs: [SA, SB] })
    s = editorReducer(s, { type: 'group', id: 'g2' })
    expect(s.doc.shelves.map((x) => x.group_id)).toEqual(['g2', 'g2'])
    s = editorReducer(s, { type: 'renameGroup', id: 'g2', name: ' Wall rack ' })
    expect(selectionGroup(s.doc, s.selection)).toEqual({ id: 'g2', name: 'Wall rack' })
    s = editorReducer(s, { type: 'ungroup' })
    expect(s.doc.shelves.map((x) => x.group_id)).toEqual([null, null])
    expect(s.doc.plan.groups.map((g) => g.id)).toEqual(['g1'])
  })

  it('moves shapes out of their old group, which dissolves when one is left', () => {
    let s = editorReducer(start(), { type: 'select', refs: [I1, SA], exact: true })
    s = editorReducer(s, { type: 'group', id: 'g2' })
    expect(s.doc.plan.items.map((i) => i.group_id)).toEqual(['g2', null])
    expect(s.doc.plan.groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('never groups a room', () => {
    const before = editorReducer(start(), { type: 'select', refs: [R1, SA] })
    expect(editorReducer(before, { type: 'group', id: 'g2' })).toBe(before)
  })
})

describe('align and distribute', () => {
  it('lines shapes up with a locked one as the anchor', () => {
    const d: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 0, { locked: true }), shelfAt('s-b', 'B', 200, { y_cm: 100 })] }
    let s = editorReducer(start(d), { type: 'select', refs: [SA, SB] })
    s = editorReducer(s, { type: 'align', edge: 'left' })
    expect(s.doc.shelves.map((x) => [x.x_cm, x.y_cm])).toEqual([[0, 0], [0, 100]])
  })

  it('spaces three shelves evenly', () => {
    const d: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 0), shelfAt('s-b', 'B', 150), shelfAt('s-c', 'C', 500)] }
    let s = editorReducer(start(d), { type: 'select', refs: [SA, SB, { kind: 'shelf', key: 's-c' }] })
    s = editorReducer(s, { type: 'distribute', axis: 'h' })
    expect(s.doc.shelves.map((x) => x.x_cm)).toEqual([0, 250, 500])
  })
})

describe('duplicate, copy and paste', () => {
  it('duplicates beside the original with the next free letter, unlocked and without a zone', () => {
    const d: EditorDoc = { ...grouped, shelves: [shelfAt('s-a', 'A', 0), shelfAt('s-b', 'B', 200, { locked: true, company_id: 'co-1' })] }
    let s = editorReducer(start(d), { type: 'select', refs: [SB] })
    s = editorReducer(s, { type: 'duplicate', seed: 'd' })
    expect(s.doc.shelves[2]).toMatchObject({ key: 'd-0', shelf_letter: 'C', x_cm: 310, y_cm: 0, locked: false, company_id: null })
    expect(s.doc.shelves[2].id).toBeUndefined()
    expect(s.selection).toEqual([{ kind: 'shelf', key: 'd-0' }])
  })

  it('pastes with fresh letters, centred on the point', () => {
    const clip = copySelection(grouped, [SA, SB])
    if (!clip) throw new Error('nothing copied')
    const s = editorReducer(start(), { type: 'paste', clip, at: { x: 400, y: 400 }, seed: 'p' })
    expect(s.doc.shelves.slice(2).map((x) => [x.shelf_letter, x.x_cm, x.y_cm])).toEqual([['C', 250, 380], ['D', 450, 380]])
  })

  it('copies a group with its name and pastes it as a new group', () => {
    const clip = copySelection(grouped, [I1, I2])
    expect(clip?.groups).toEqual([{ id: 'g1', name: 'Bench pair' }])
    if (!clip) throw new Error('nothing copied')
    const s = editorReducer(start(), { type: 'paste', clip, at: { x: 600, y: 500 }, seed: 'p' })
    const pasted = s.doc.plan.items.slice(2)
    expect(pasted.map((i) => i.group_id)).toEqual(['p-0', 'p-0'])
    expect(s.doc.plan.groups).toEqual([{ id: 'g1', name: 'Bench pair' }, { id: 'p-0', name: 'Bench pair' }])
  })
})
```

- [ ] **Step 2: Write the failing clipboard tests**

Create `src/components/storage/blueprint/clipboard.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CLIPBOARD_KEY, readClipboard, writeClipboard } from './clipboard'
import type { Clip } from './editor-state'

const clip: Clip = {
  version: 1,
  rooms: [],
  items: [{ id: 'i1', kind: 'bench', label: null, x: 0, y: 0, w: 100, d: 50, rot: 0, locked: false, group_id: null }],
  shelves: [{
    shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42, x_cm: 200, y_cm: 0,
    width_cm: 100, depth_cm: 40, rot: 0, access_side: 'front', group_id: null,
  }],
  groups: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('clipboard', () => {
  it('round-trips through localStorage, so another lab can paste it', () => {
    writeClipboard(clip)
    expect(JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? 'null')).toEqual(clip)
    expect(readClipboard()).toEqual(clip)
  })

  it('ignores a stored value that is not a clip', () => {
    writeClipboard(clip)
    localStorage.setItem(CLIPBOARD_KEY, '{"version":2}')
    expect(readClipboard()).toBeNull()
  })

  it('keeps working in memory when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    writeClipboard(clip)
    expect(readClipboard()).toEqual(clip)
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/components/storage/blueprint/editor-state.test.ts src/components/storage/blueprint/clipboard.test.ts`
Expected: FAIL (unknown actions; `./clipboard` missing).

- [ ] **Step 4: Add groups and copies to `editor-state.ts`**

Change the imports at the top of `editor-state.ts` to:

```ts
import {
  cleanName, parseFloorPlan,
  type AccessSide, type FloorGroup, type FloorItem, type FloorItemKind, type FloorPlan, type FloorRoom, type Rect,
  type Rotation, type ShelfInput,
} from '@/lib/storage/floor-plan'
import { footprint, fromFootprint, snap } from '@/lib/storage/geometry'
import {
  alignOffsets, distributeOffsets, duplicateOffset, moveFootprintBy, onPlanOffset, turnFootprint, unionRect,
  type AlignEdge, type Axis, type Offset, type Turn,
} from '@/lib/storage/arrange'
import type { Cubby, StorageLayout } from '@/lib/storage/layout'
```

After `export interface RefPatch …` add:

```ts
/** A shelf as copied: no id, zone, cubbies or lock. */
export type ClipShelf = Omit<ShelfInput, 'id' | 'locked'>
/** Shapes copied for pasting, where they were; ids and groups are remapped on paste. */
export interface Clip { version: 1; rooms: FloorRoom[]; items: FloorItem[]; shelves: ClipShelf[]; groups: FloorGroup[] }
```

Add to the `EditorAction` union:

```ts
  | { type: 'group'; id: string }
  | { type: 'ungroup' }
  | { type: 'renameGroup'; id: string; name: string | null }
  | { type: 'align'; edge: AlignEdge }
  | { type: 'distribute'; axis: Axis }
  | { type: 'duplicate'; seed: string }
  | { type: 'paste'; clip: Clip; at: { x: number; y: number }; seed: string }
```

After `pruneGroups` add:

```ts
/** The group a selection is, exactly: every member and nothing else. */
export function selectionGroup(doc: EditorDoc, selection: ShapeRef[]): FloorGroup | null {
  if (selection.length < 2) return null
  const g = shapeGroupId(doc, selection[0])
  if (!g || !selection.every((r) => shapeGroupId(doc, r) === g)) return null
  if (groupMembers(doc, g).length !== selection.length) return null
  return doc.plan.groups.find((x) => x.id === g) ?? null
}

function setGroup(doc: EditorDoc, refs: ShapeRef[], group: string | null): EditorDoc {
  const on = (kind: ShapeKind, key: string) => isSelected(refs, { kind, key })
  return {
    plan: { ...doc.plan, items: doc.plan.items.map((i) => (on('item', i.id) ? { ...i, group_id: group } : i)) },
    shelves: doc.shelves.map((s) => (on('shelf', s.key) ? { ...s, group_id: group } : s)),
  }
}

export function copySelection(doc: EditorDoc, selection: ShapeRef[]): Clip | null {
  const has = (kind: ShapeKind, key: string) => isSelected(selection, { kind, key })
  const rooms = doc.plan.rooms.filter((r) => has('room', r.id))
  const items = doc.plan.items.filter((i) => has('item', i.id))
  const shelves = doc.shelves.filter((s) => has('shelf', s.key)).map((s): ClipShelf => ({
    shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
    x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
    group_id: s.group_id,
  }))
  if (rooms.length + items.length + shelves.length === 0) return null
  const used = new Set([...items.map((i) => i.group_id), ...shelves.map((s) => s.group_id)])
  return { version: 1, rooms, items, shelves, groups: doc.plan.groups.filter((g) => used.has(g.id)) }
}

/** The box around what a clip's shapes cover. */
export function clipBox(clip: Clip): Rect {
  return unionRect([
    ...clip.rooms.map(rectOf),
    ...clip.items.map((i) => footprint(i)),
    ...clip.shelves.map((s) => footprint({ ...shelfRect(s), rot: s.rot })),
  ])
}

/**
 * A clip's shapes added to `doc`, moved by `o`, with ids `<seed>-<n>`, the
 * next free shelf letters, unlocked, no zones, and their own new groups.
 */
export function insertClip(doc: EditorDoc, clip: Clip, o: Offset, seed: string): { doc: EditorDoc; refs: ShapeRef[] } {
  let n = 0
  const nextId = () => `${seed}-${n++}`
  const groupIds = new Map(clip.groups.map((g) => [g.id, nextId()]))
  const regroup = (g: string | null) => (g ? groupIds.get(g) ?? null : null)
  const rooms: FloorRoom[] = clip.rooms.map((r) => ({ ...r, ...moveFootprintBy(r, 0, o), id: nextId(), locked: false }))
  const items: FloorItem[] = clip.items.map((it) => ({
    ...it, ...moveFootprintBy(it, it.rot, o), id: nextId(), locked: false, group_id: regroup(it.group_id),
  }))
  const letters = doc.shelves.map((s) => s.shelf_letter)
  const shelves: EditorShelf[] = clip.shelves.map((s) => {
    const letter = nextShelfLetter(letters)
    letters.push(letter)
    const r = moveFootprintBy(shelfRect(s), s.rot, o)
    return {
      ...s, key: nextId(), shelf_letter: letter, x_cm: r.x, y_cm: r.y,
      locked: false, group_id: regroup(s.group_id), company_id: null, cubbies: [],
    }
  })
  const groups = clip.groups.map((g) => ({ id: groupIds.get(g.id) as string, name: g.name }))
  return {
    doc: {
      plan: {
        ...doc.plan,
        rooms: [...doc.plan.rooms, ...rooms],
        items: [...doc.plan.items, ...items],
        groups: [...doc.plan.groups, ...groups],
      },
      shelves: [...doc.shelves, ...shelves],
    },
    refs: [
      ...rooms.map((r): ShapeRef => ({ kind: 'room', key: r.id })),
      ...items.map((i): ShapeRef => ({ kind: 'item', key: i.id })),
      ...shelves.map((s): ShapeRef => ({ kind: 'shelf', key: s.key })),
    ],
  }
}
```

Add these cases to `editorReducer`, before `case 'undo':`:

```ts
    case 'group': {
      if (s.selection.length < 2 || s.selection.some((r) => r.kind === 'room')) return s
      const doc = setGroup(s.doc, s.selection, a.id)
      return recorded(s, pruneGroups({ ...doc, plan: { ...doc.plan, groups: [...doc.plan.groups, { id: a.id, name: null }] } }))
    }
    case 'ungroup': {
      const ids = new Set(s.selection.map((r) => shapeGroupId(s.doc, r)).filter((g): g is string => !!g))
      if (ids.size === 0) return s
      const doc = setGroup(s.doc, [...ids].flatMap((g) => groupMembers(s.doc, g)), null)
      return recorded(s, { ...doc, plan: { ...doc.plan, groups: doc.plan.groups.filter((g) => !ids.has(g.id)) } })
    }
    case 'renameGroup': {
      const groups = s.doc.plan.groups.map((g) => (g.id === a.id ? { ...g, name: cleanName(a.name) } : g))
      return recorded(s, { ...s.doc, plan: { ...s.doc.plan, groups } })
    }
    case 'align':
    case 'distribute': {
      const shapes = selectedShapes(s.doc, s.selection)
      if (shapes.length < 2) return s
      const fps = shapes.map((x) => x.fp)
      const movable = shapes.map((x) => !x.locked)
      const offsets = a.type === 'align' ? alignOffsets(fps, movable, a.edge) : distributeOffsets(fps, movable, a.axis)
      const patches = shapes.flatMap((x, i): RefPatch[] => {
        const o = offsets[i]
        if (o.dx === 0 && o.dy === 0) return []
        const r = moveFootprintBy(x.rect, x.rot, o)
        return [{ ref: x.ref, patch: { x: r.x, y: r.y } }]
      })
      return patches.length === 0 ? s : recorded(s, applyMany(s.doc, patches))
    }
    case 'duplicate': {
      const clip = copySelection(s.doc, s.selection)
      if (!clip) return s
      const { doc, refs } = insertClip(s.doc, clip, duplicateOffset(clipBox(clip)), a.seed)
      return recorded(s, pruneGroups(doc), { selection: refs })
    }
    case 'paste': {
      const box = clipBox(a.clip)
      const want = { dx: snap(a.at.x - (box.x + box.w / 2)), dy: snap(a.at.y - (box.y + box.d / 2)) }
      const fix = onPlanOffset({ ...box, x: box.x + want.dx, y: box.y + want.dy })
      const { doc, refs } = insertClip(s.doc, a.clip, { dx: want.dx + fix.dx, dy: want.dy + fix.dy }, a.seed)
      return recorded(s, pruneGroups(doc), { selection: refs })
    }
```

- [ ] **Step 5: Create `clipboard.ts`**

Create `src/components/storage/blueprint/clipboard.ts`:

```ts
/**
 * The storage editor's clipboard: kept in memory and mirrored to
 * localStorage, so shapes copied in one lab paste in another (or another tab).
 * Storage can be blocked or cleared; every access is wrapped and the memory
 * copy carries on.
 */
import { parseFloorPlan, parseShelfInputs } from '@/lib/storage/floor-plan'
import type { Clip, ClipShelf } from './editor-state'

export const CLIPBOARD_KEY = 'waqc.storage.clipboard'

let memory: Clip | null = null

export function writeClipboard(clip: Clip): void {
  memory = clip
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clip))
  } catch {
    // Private mode or blocked storage: the memory copy is enough for this tab.
  }
}

/** The stored clip when there is one (it may come from another tab), else this tab's. */
export function readClipboard(): Clip | null {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY)
    if (raw) return asClip(JSON.parse(raw))
  } catch {
    // Unreadable storage or JSON: fall back to memory.
  }
  return memory
}

/** A stored value checked the way a saved plan is, or null. */
export function asClip(v: unknown): Clip | null {
  if (typeof v !== 'object' || v === null) return null
  const c = v as Record<string, unknown>
  if (c.version !== 1) return null
  const plan = parseFloorPlan({ version: 1, rooms: c.rooms, items: c.items, groups: c.groups })
  if (!plan.ok) return null
  const shelves = parseShelfInputs(c.shelves, new Set(plan.value.groups.map((g) => g.id)))
  if (!shelves.ok) return null
  return {
    version: 1,
    rooms: plan.value.rooms,
    items: plan.value.items,
    groups: plan.value.groups,
    shelves: shelves.value.map((s): ClipShelf => ({
      shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
      group_id: s.group_id,
    })),
  }
}
```

- [ ] **Step 6: Add the hook actions**

In `src/components/storage/blueprint/use-blueprint-editor.ts`, extend the imports:

```ts
import type { AlignEdge, Axis, Turn } from '@/lib/storage/arrange'
import {
  editorReducer, initialEditorState,
  type Clip, type DrawTool, type EditorDoc, type RefPatch, type ShapePatch, type ShapeRef, type Tool,
} from './editor-state'
```

and add to the `actions` memo, before `undo`:

```ts
    group: () => dispatch({ type: 'group', id: newId() }),
    ungroup: () => dispatch({ type: 'ungroup' }),
    renameGroup: (id: string, name: string | null) => dispatch({ type: 'renameGroup', id, name }),
    align: (edge: AlignEdge) => dispatch({ type: 'align', edge }),
    distribute: (axis: Axis) => dispatch({ type: 'distribute', axis }),
    duplicate: () => dispatch({ type: 'duplicate', seed: newId() }),
    paste: (clip: Clip, at: { x: number; y: number }) => dispatch({ type: 'paste', clip, at, seed: newId() }),
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run src/components/storage src/lib/storage`
Expected: PASS.
Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/storage/blueprint
git commit -m "feat(storage): group, align, distribute, duplicate, copy and paste shapes"
```

Part A ends here; continue with Part B, Task 6.
