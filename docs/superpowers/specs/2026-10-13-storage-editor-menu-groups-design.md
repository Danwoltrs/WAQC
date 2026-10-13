# Storage editor: right-click menu, lock, groups, room names

Date: 2026-10-13 · Status: design approved in chat by Daniel, spec awaiting review
Builds on: [2026-10-07-lab-storage-blueprint-design.md](2026-10-07-lab-storage-blueprint-design.md) (Part 1 is live on main, `cfec09ee`)

## Goal

Make the storage blueprint editor feel like a drawing tool: right-click any
shape (or the empty floor) for the actions that apply to it, lock shapes in
place, group shapes so they move together and can carry a name, and name the
rooms. Daniel's request: "add some right click menus, to edit, rotate, lock in
place, group, etc" and "room name". Grouping is for both moving things together
and naming a set of shelves (his answer C).

## Decisions (approved, do not relitigate)

1. **Lock and group live on each shape.** Every room, item and shelf has
   `locked`. Items and shelves have `group_id`. Group names live in
   `floor_plan.groups: [{ id, name }]`. Shelves are DB rows, so they get
   `lab_shelves.locked` and `lab_shelves.group_id`. Rejected: member lists in
   the plan JSON (an unsaved shelf has no id to reference, a deleted shelf
   leaves a stale member).
2. **Rooms can be locked and named, never grouped.** They are the building.
3. **Plans saved before this keep loading.** Every new field is optional on
   read and defaults to off / empty.
4. **Multi-select:** Shift+click toggles a shape; Shift+drag on empty floor
   draws a selection box; a plain drag on empty floor still pans.
5. **Groups:** clicking a member selects the whole group (dashed box, name
   above); double-click selects one member on its own. No nested groups; a
   shape is in at most one group.
6. **Lock:** a locked shape cannot be moved, resized, rotated or deleted, and
   neither can a group or selection that contains one. Its details (letter,
   rows, capacity, labels, names) stay editable. A small lock glyph marks it.
7. **Menu entries show their shortcuts.** Arrow keys nudge 10 cm, Shift+arrow
   1 cm.

## Data

### Floor plan JSON (`laboratories.floor_plan`, still `version: 1`)

```ts
interface FloorRoom  extends Rect { id: string; name: string | null; locked: boolean }
interface FloorItem  extends Rect { id: string; kind; label; rot; locked: boolean; group_id: string | null }
interface FloorGroup { id: string; name: string | null }
interface FloorPlan  { version: 1; rooms: FloorRoom[]; items: FloorItem[]; groups: FloorGroup[] }
```

- `parseFloorPlan` rebuilds every object, so it must copy the new fields or
  they are lost on save. Missing `name`/`locked`/`group_id`/`groups` read as
  `null` / `false` / `null` / `[]`.
- Limits: room name and group name trimmed, at most 40 characters, blank is
  `null`; group id is an id string (1..64 chars); at most 100 groups.
- An item whose `group_id` is not in `groups` is read as ungrouped. A group
  with fewer than two members is dropped when the editor saves.

### Shelves

- `ShelfInput` gains `locked: boolean` and `group_id: string | null`;
  `parseShelfInputs` defaults them and checks a non-null `group_id` names a
  group in the submitted plan (else 400).
- `layout.ts` selects `locked, group_id` with the shelf columns.

### SQL (one migration, Daniel applies it)

```sql
ALTER TABLE public.lab_shelves
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_id TEXT
    CONSTRAINT lab_shelves_group_id_valid CHECK (group_id IS NULL OR length(group_id) BETWEEN 1 AND 64);
```

`save_lab_floor_plan` (same signature) writes `locked` and `group_id` on insert
and update. A `group_id` that is not an `id` in `p_plan->'groups'` is stored as
NULL, so a direct RPC call cannot leave a dangling group. The scenario script
gains: lock and group persist, survive a letter swap, and an unknown group id
is cleared.

## Editor behaviour

### Selection

- State `selected: ShapeRef | null` becomes `selection: ShapeRef[]`.
- Click a shape: select it (or its whole group). Shift+click: add/remove it
  (or its group). Double-click a group member: select that member alone.
- Shift+drag on empty floor or inside a room (select tool): selection box.
  Items and shelves the box touches are selected (groups expand to all
  members); a room only when the box contains it whole, so a box drawn inside
  a room does not pick the room. A Shift+press on a room that moves less than
  4 px is a Shift+click on that room.
- Click empty floor: clear. Escape: clear. ⌘A: select all.
- Resize handles show only when exactly one unlocked shape is selected.
- Several selected: a dashed box around their combined footprint.

### Moving, rotating, nudging

- Dragging any selected shape moves the whole selection; one undo step.
  Snapping applies to the shape under the pointer, the rest keep their offsets.
- Rotate right (R) / left (⇧R): one shape turns about its centre as today;
  rooms never rotate, so Rotate is disabled when the selection holds a room;
  a selection or group turns 90° about the centre of its combined footprint,
  every member's `rot` steps with it (shelf fronts follow). Positions round to
  whole cm. If the result would leave the plan (0..10 000 cm), the whole set
  shifts back onto it.
- Arrows nudge 10 cm, Shift+arrow 1 cm; each press is one undo step.
- Anything that would move a locked shape is refused for the whole set (no-op,
  short toast "Unlock it first").

### Lock

- Lock / Unlock (L) toggles every selected shape; a mixed selection locks all.
- Locked shapes show a lock glyph at the top-right of their footprint and no
  handles; dragging one pans instead.

### Groups

- Group (⌘G): two or more selected items/shelves and no room. Shapes that
  were in another group move into the new one; a group left with fewer than
  two members dissolves. Creates a group with no name and selects it.
- Ungroup (⇧⌘G): clears `group_id` on its members and removes the group.
- Rename on a group reads "Name group" and focuses the group name field in
  the side panel. The name shows
  above the group's dashed box when it is selected, and as a small muted label
  above its footprint otherwise.
- Deleting a group deletes its members; refused in the editor if any is
  locked. A shelf that still holds samples is refused at save, as today.

### Duplicate, copy, paste

- Duplicate (⌘D): copies sit beside the originals, offset right by the
  selection's footprint width + 10 cm (below instead if that leaves the plan).
  Copied shelves get the next free letters, same grid, size, rotation and
  access, no zone, unlocked. A duplicated group becomes a new group with the
  same name.
- Copy (⌘C) keeps the selection's shapes (not cubbies, zones or ids) in a
  clipboard held in memory and mirrored to `localStorage`
  (`waqc.storage.clipboard`, wrapped in try/catch), so a copy made in one lab
  pastes in another.
- Paste (⌘V) places the shapes centred on the view; "Paste here" from the
  menu centres them on the click. Pasted shapes are selected.

### Align and distribute (two or more selected)

- Align left / centre / right / top / middle / bottom to the selection's
  combined footprint. Distribute horizontally / vertically (three or more):
  equal gaps between footprints. Locked shapes stay put and act as anchors;
  only unlocked shapes move.

### Room names

- Rooms get a Name field in the side panel and "Rename" in the menu.
- The name shows centred in its rectangle, muted, 12 px on screen.
- The two rectangles of an L are named separately; a blank one shows nothing.

### Right-click menu

Built on `src/components/ui/context-menu.tsx`. Right-clicking a shape selects
it first unless it is already part of the selection.

| Target | Entries |
|---|---|
| Any shape / selection (Edit mode) | Edit details · Rename (Name group on a group) · Rotate right (R) · Rotate left (⇧R) · Duplicate (⌘D) · Copy (⌘C) · Paste (⌘V) · Lock / Unlock (L) · Group (⌘G) / Ungroup (⇧⌘G) · Align ▸ · Distribute ▸ · Delete (Del) |
| Room only | also Add here ▸ · Paste here (most of the floor is inside a room) |
| Shelf only | Access from both sides (checkbox) · View cubbies |
| Item only | Change type ▸ (Bench, Table, Cabinet, Equipment, Door, Window, Other) |
| Empty floor (Edit mode) | Add here ▸ (Shelf, Door, Window, Bench, Table, Cabinet, Equipment, Other) · Paste here · Select all (⌘A) · Fit plan to screen |
| View mode | View cubbies (shelf) · Fit plan to screen |

Edit details and Rename show for one shape or one group only. Entries that do
not apply are hidden; entries that apply but are blocked
(Delete on a locked shape, Group with a room selected) are shown disabled.
"Edit details" focuses the first field of the side panel; "Rename" focuses the
name field (room name, item label, shelf letter or group name). "View cubbies"
selects the shelf, which shows its cubbies in either mode.

### Side panel

- One shape: as today, plus a Lock toggle; rooms gain Name.
- A group: Name, member count, Lock, Ungroup, Delete.
- Several shapes, not one group: count, Group, Align / Distribute buttons,
  Lock, Delete.

## Out of scope

Nested groups; distance labels while dragging; assigning a client zone to a
group (Part 2); bring to front / send to back.

## Testing

- `editor-state` reducer: selection add/toggle/box/all; group click expands;
  move and rotate a selection (positions, rots, shift back onto the plan);
  lock refusals; duplicate letters and offsets; paste; group/ungroup; align
  and distribute with a locked anchor; nudge.
- `floor-plan` parse: old plans without the new fields load; names trimmed and
  capped; unknown group ids read as ungrouped; shelf `group_id` must name a
  group.
- Canvas / workspace: right-click a shelf, an item, a room and the floor shows
  the entries in the table (jsdom `fireEvent.contextMenu`); Shift+click;
  Shift+drag box; locked shape shows the glyph and no handles; keyboard
  shortcuts dispatch on `document`.
- SQL scenarios as above.

## Files (expected)

- `src/lib/storage/floor-plan.ts`: types, parsers.
- `src/lib/storage/arrange.ts` (new): combined footprint, rotate a set about
  its centre, shift back onto the plan, align, distribute, duplicate offsets.
- `src/lib/storage/layout.ts`: shelf columns.
- `src/components/storage/blueprint/editor-state.ts`: selection array and the
  new actions.
- `src/components/storage/blueprint/use-blueprint-editor.ts`,
  `use-editor-keyboard.ts` (split out): actions and shortcuts.
- `src/components/storage/blueprint/clipboard.ts` (new).
- `src/components/storage/blueprint/canvas-context-menu.tsx` (new).
- `blueprint-canvas.tsx`, `shapes.tsx`, `inspector.tsx`,
  `storage-workspace.tsx`: gestures, glyphs, labels, panels, wiring.
- `database/migrations/20261013000001_storage_lock_groups.sql`,
  `database/tests/storage_blueprint_scenarios.sql`.

Every file stays well under 2 000 lines.
