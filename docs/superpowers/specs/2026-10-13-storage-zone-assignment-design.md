# Storage Zone Assignment — Design

Status: approved in conversation 2026-10-13. Amends §5.3 ("Painting") of
[2026-10-07-lab-storage-blueprint-design.md](2026-10-07-lab-storage-blueprint-design.md);
the rest of its Part 2 (§5.2 proposing zones, §5.5 `place_sample`) and Part 3 stay as written and
come after this.

## 1. Goal

Lab staff open a shelf, pick cubbies (or whole shelves), and give them to a client. The
assignment is a zone: `storage_positions.company_id`, `NULL` = general space. Every change is
kept in a history anyone in the lab can read.

## 2. Decisions taken in conversation

| Topic | Decision |
|---|---|
| Where | Edit mode, kept with the plan's other edits and undo, written by Save |
| Who | Anyone who works in that lab (and global staff, admins). Layout editing stays with lab quality managers and admins |
| Picking | Click one cubby; Cmd/Ctrl+click adds or removes one; Shift+click picks the rectangle from the last clicked cubby. Cmd/Ctrl+click (or Shift+click) on the plan picks several shelves |
| Whole shelves | Yes: every cubby of the picked shelves, or "Assign whole shelf" for the one open |
| History | Shown per shelf in the side panel, and lab-wide when nothing is selected in View mode |
| Tins | Rezoning never moves a sample (spec §5.4) |

## 3. Permissions

- **View** storage: `canViewLabStorage` (unchanged).
- **Assign zones**: `canAssignLabZones(p, lab)` = the same rule as view: an internal staff profile
  that is global admin, has a `global_*` role, or belongs to that lab. Clients, suppliers and
  buyers never.
- **Edit the layout**: `canEditLabStorage` (unchanged: global admin, `global_admin`,
  `global_quality_admin`, or `lab_quality_manager` of that lab).
- `GET /api/laboratories/[id]/storage` returns `can_edit` (layout) and `can_assign` (zones).
- The database function repeats the assign rule (same predicate as `storage_lab_occupancy` in
  `20261013000000`); it is what guards the write.

## 4. Editor

### 4.1 Edit mode without layout rights

The Edit button shows when `can_edit || can_assign`. With `can_assign` only:

- No tool palette; no handles; pressing a shape selects it and a drag pans the plan.
- Shortcuts that change the layout (R, L, Delete, arrows, ⌘D, ⌘V, ⌘G) do nothing; ⌘A, ⌘Z, ⇧⌘Z,
  Escape work.
- The right-click menu offers Select all and Fit plan to screen only.
- The side panel shows the shape's details read-only, plus zone assignment.
- The reducer enforces it: `EditorState.canLayout = false` refuses every action that would change
  a shape (add, patch, patchMany, rotate, nudge, lock, delete, group, ungroup, renameGroup, align,
  distribute, duplicate, paste). Zone assignment, selection and undo/redo still work.

### 4.2 Zones in the document

- `EditorShelf.cubby_zones: Record<string, string | null>`, keyed `"row:column"`, is the zone
  each position should have. `fromLayout` fills it from the cubbies; a position with no entry is
  general. It is part of the document, so undo/redo and the unsaved-changes guard cover it.
- A position outside the shelf's grid (rows/columns shrunk) is ignored when shown and when saved.
- The plan's zone tint and the front grid read `cubby_zones`, not `cubbies[].company_id`, so a
  pending assignment shows at once, on new shelves too.

### 4.3 Picking cubbies

- `EditorState.cubbyPick: { shelfKey: string; cells: string[]; anchor: string | null } | null`
  (not in the document, not undoable). It clears whenever the shape selection changes.
- The front grid of the one selected shelf (side panel, edit mode): click = pick that cubby;
  Cmd/Ctrl+click = add or remove it; Shift+click = the rectangle between `anchor` and it. Picked
  cubbies show a 2 px foreground outline. Escape clears the pick before it clears the selection.
- On a Mac, Ctrl+click is the context menu; Cmd is the modifier there.

### 4.4 Picking shelves

On the plan, Cmd/Ctrl+click toggles a shape exactly as Shift+click does today (groups as a
whole). Shift+drag box selection is unchanged.

### 4.5 Assigning

- One `assignZone { companyId: string | null }` action, recorded as one undo step:
  - with cubbies picked: those cubbies;
  - else every position of every selected shelf (rows × columns).
  Rooms and furniture in the selection are ignored. Locked shelves can be assigned (a lock is about
  place).
- Side panel, one shelf: an "Assign to" client box and a button that reads "Assign 4 cubbies" when
  cubbies are picked and "Assign whole shelf" when none are.
- Side panel, several shapes: "Assign 3 shelves" with the same box (shown when at least one shelf is
  selected).
- The client box searches `GET /api/clients?search=` (QC clients, as the New Sample wizard) and
  offers "General (no client)" first. Names via `companyDisplayName`. The search is server-side, so
  the list uses `shouldFilter={false}` (cmdk value trap).
- A client picked for the first time joins the workspace's company list, so the legend and colours
  include it before Save.

## 5. Saving

1. With `can_edit` and a dirty document: `PUT /storage` (layout) as now, which also creates the
   cubbies of new shelves. Its reply is the fresh layout.
2. `zoneChanges(doc, layout)` compares each shelf's `cubby_zones` (matched by shelf letter) with the
   fresh layout's cubbies and lists `{ code, company_id }` for every cubby whose zone differs.
3. If any: `PUT /api/laboratories/[id]/storage/zones` `{ changes }` → `save_storage_zones`, then the
   reloaded layout.
4. `saved` with the final layout. If step 3 fails after step 1 succeeded, the editor takes the
   saved layout with the pending zones carried over by shelf letter, stays dirty, and shows the
   error; Save retries the zones.

A user with `can_assign` only skips step 1.

## 6. Database (`20261013000002_storage_zone_assignment.sql`)

### 6.1 `storage_zone_history`

| Column | Type |
|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` |
| `laboratory_id` | `uuid NOT NULL` → `laboratories` ON DELETE CASCADE |
| `position_id` | `uuid` → `storage_positions` ON DELETE SET NULL |
| `position_code` | `text NOT NULL` (the code at the time) |
| `from_company_id`, `to_company_id` | `uuid` → `companies` ON DELETE SET NULL |
| `changed_by` | `uuid` → `profiles` ON DELETE SET NULL |
| `changed_at` | `timestamptz NOT NULL DEFAULT now()` |

Index `(laboratory_id, changed_at DESC)`. RLS on; one SELECT policy for staff of that lab (inline
profiles predicate, no helper function). No INSERT/UPDATE/DELETE policy: rows come only from the
function.

### 6.2 `save_storage_zones(p_lab uuid, p_changes jsonb) RETURNS integer`

SECURITY DEFINER, `search_path = public`, one transaction:

1. Caller allowed (§3) or `RAISE insufficient_privilege`.
2. `p_changes` is an array of at most 5000 `{ code, company_id }`; else `invalid_zone_changes`.
3. Each code must be a cubby of `p_lab` (`unknown_cubby`); each non-null `company_id` must exist
   (`unknown_company`).
4. For each cubby whose `company_id` differs: update it and insert one history row
   (`changed_by = auth.uid()`). Unchanged cubbies are skipped and not logged.
5. Return the number changed.

### 6.3 `storage_zone_history_events(p_lab uuid, p_shelf uuid, p_limit int) RETURNS TABLE`

SECURITY DEFINER, same caller check. Groups the rows of one save (same `changed_at`, `changed_by`,
from, to) into one event: `changed_at, changed_by_name` (full name, else email, else "Unknown"),
`from_name`, `to_name` (trade name, else legal name; `NULL` = General), `codes text[]` sorted.
`p_shelf` limits to rows whose cubby still belongs to that shelf; changes to cubbies since deleted
show in the lab-wide list only. `NULL` = whole lab. Newest first, `p_limit` events (max 100).

`NOTIFY pgrst, 'reload schema'` at the end, then a verify SELECT.

## 7. API

- `PUT /api/laboratories/[id]/storage/zones`: auth, `canAssignLabZones`, body validated
  (`changes` array, codes non-empty strings, `company_id` uuid or null), RPC, then the reloaded
  layout with `can_edit` and `can_assign`. Errors: `insufficient_privilege` 403, `unknown_cubby` /
  `unknown_company` / `invalid_zone_changes` 400 with a readable message.
- `GET /api/laboratories/[id]/storage/zone-history?shelf=<id>&limit=<n>`: auth,
  `canViewLabStorage`, RPC, `{ events }`.

## 8. History in the side panel

- Shelf selected (View or Edit): "Zone history" under its front grid, newest first, 10 events with
  "Show more". Line: `13 Oct 14:02 · Daniel Wolthers` then `B-A1, B-A2, B-A3, B-A4: General →
  Ahold`; more than 8 codes show the first 8 and "+N more".
- View mode, nothing selected: the same list for the whole lab, 20 events.
- Empty: "No zone changes yet". Reloaded after every successful Save.

## 9. Error handling

- A pending assignment on a cubby that a layout change removed is dropped at save (§4.2).
- A client deleted between pick and Save → `unknown_company`, the editor stays dirty with the
  message.
- History load failure shows "Zone history unavailable" in place of the list; it never blocks the
  editor.

## 10. Testing

- Unit: `zoneChanges`, carry-over by letter, rectangle pick, `assignZone` (cubbies, shelves,
  ignores rooms, one undo step), `canLayout = false` refusals, menu entries without layout rights,
  Cmd/Ctrl+click toggle on the plan, front-grid picking, the client box (General first, server
  search), history line formatting.
- Workspace: a manager's Save sends layout then zones; an assign-only user's Save sends zones only;
  a zones failure keeps the edits and stays dirty.
- Routes: 401/403/400 paths and the happy path for both new routes.
- SQL scenario script `database/tests/storage_zone_scenarios.sql` (rolled back): a change is
  written and logged once, an unchanged cubby is not logged, unknown cubby and unknown company are
  refused, a cubby from another lab is refused, a user of another lab is refused, history events
  group one save into one row.

## 11. Out of scope (next in Part 2)

- Proposing zones from client volume (§5.2), `place_sample` at intake (§5.5), the "outside zone"
  marker on tins left in a rezoned cubby (§5.4), the cubby picker in the cert editor (§5.7).
