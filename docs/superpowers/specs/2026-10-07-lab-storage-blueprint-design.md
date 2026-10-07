# Lab Storage Blueprint, Client Zones and Retention — Design

Date: 2026-10-07
Status: approved in conversation, awaiting written-spec review

## 1. Intent

Daniel wants the lab's sample storage drawn as a real blueprint: the room seen from above,
to scale, with its furniture and the shelves where they really stand and as big as they really
are. Each shelf carries its grid of cubbies. Space is reserved per client automatically, every new
sample is given its cubby at intake, and samples leave storage on a retention schedule.

Success means:

- A lab admin can draw the Santos HQ room, its benches, doors and shelves to scale in a few minutes
  and save it.
- Clicking a shelf shows its front grid with occupancy and client zones.
- The system proposes a zone per client sized by that client's volume; staff adjust it by painting
  cubbies.
- The New Sample wizard tells the tech "Store in B-C4" on its success screen, every time there is
  space, without the tech choosing anything.
- A "Due for discard" list tells the tech which tins to pull, in walking order.

### Decisions taken in conversation

| Topic | Decision |
|---|---|
| Auto-assign | Reserve zones per client (proposed by volume, adjustable), then auto-place samples into their client's zone; overflow to general space |
| Placement moment | At intake, automatically, shown on the success screen |
| Drawing fidelity | Rectangles to scale in real units, 10 cm snap; L-shaped rooms by joining rectangles; 90° rotation |
| Address granularity | Cubby (`B-C4`) with a capacity, as today; no per-tin slot |
| Removal | Retention period + "Due for discard" list |
| Retention rule | Lab default + per-client override |
| Rendering engine | Plain SVG with own pointer handlers (no new library) |

## 2. Current state (why this is a rebuild, not a tweak)

- `lab_shelves`: letter, rows × columns, `samples_per_position` (42), integer `x_position` /
  `y_position`, `client_id`, `allow_client_view`. `laboratories.entrance_x_position/_y_position`.
- `storage_positions`: one row per cubby (`D-A1`), `capacity_per_position`, hand-maintained
  `current_count` / `current_samples`, generated `is_available`, `client_id`, `allow_client_view`.
- `samples.storage_position`: free text, typed by hand in the cert editor.
- `lab_shelves.client_id` and `storage_positions.client_id` reference the `clients` table, which
  was dropped on 2026-05-28 (counterparty consolidation). `GET /api/laboratories/[id]/storage-layout`
  still embeds `clients(id, name)`, so it most likely fails, which would explain the empty
  "No shelves configured" modal. The `client_visible_shelves` view and
  `get_client_samples_in_storage()` also join `clients`, and the latter returns `tracking_number`
  (forbidden in output by CLAUDE.md).
- The floor plan is shelf cards on a coarse integer grid; there is no room, furniture or real size.

## 3. Data model

All lengths are integer **centimetres**. Origin is the top-left of the drawing, seen from above;
x grows right, y grows down. Rotation `rot` is one of `0 | 90 | 180 | 270` degrees, clockwise,
about the rectangle's centre. `x, y` is the top-left of the *unrotated* rectangle.

### 3.1 `laboratories`

- `floor_plan JSONB` (new, nullable). Shape, validated server-side:

```ts
type FloorPlan = {
  version: 1
  rooms: { id: string; x: number; y: number; w: number; d: number }[]        // union = room outline
  items: {
    id: string
    kind: 'bench' | 'table' | 'cabinet' | 'equipment' | 'door' | 'window' | 'other'
    label: string | null
    x: number; y: number; w: number; d: number
    rot: 0 | 90 | 180 | 270
  }[]
}
```

  The unused legacy `storage_layout` column is left alone (its comment describes shelf config;
  reusing it risks reading stale data).
- `retention_months_default INTEGER NOT NULL DEFAULT 6 CHECK (retention_months_default BETWEEN 1 AND 120)`.
- `entrance_x_position`, `entrance_y_position` are dropped; the entrance becomes a `door` item.

### 3.2 `lab_shelves`

- New: `x_cm`, `y_cm`, `width_cm`, `depth_cm` (INTEGER NOT NULL, width/depth ≥ 20), `rot`
  (SMALLINT NOT NULL DEFAULT 0, CHECK in (0,90,180,270)), `access_side TEXT NOT NULL DEFAULT 'front'`
  CHECK in (`'front'`, `'both'`) (drawing only).
- `client_id` → **`company_id UUID REFERENCES companies(id) ON DELETE SET NULL`**.
- Dropped: `x_position`, `y_position`.
- Kept: `shelf_letter` (unique per lab), `shelf_number`, `rows`, `columns`, `samples_per_position`,
  `allow_client_view`.
- Grid change (rows / columns / capacity) regenerates cubbies: kept cubbies keep their id and zone;
  removed cubbies are deleted only if they hold no live sample, otherwise the save is refused and the
  error names the cubbies.

### 3.3 `storage_positions` (cubbies)

- `client_id` → **`company_id UUID REFERENCES companies(id) ON DELETE SET NULL`**. `NULL` = general
  space. A client's zone = the set of cubbies with its `company_id`.
- Dropped: `current_count`, `current_samples`, `is_available` (generated from `current_count`).
  Occupancy is always computed (§3.5).
- Kept: `position_code` (`{shelf_letter}-{row_letter}{column}`), `row_number`, `column_number`,
  `capacity_per_position`, `shelf_id`, `laboratory_id`, `allow_client_view`.

### 3.4 `samples`

- New: `storage_position_id UUID REFERENCES storage_positions(id) ON DELETE SET NULL`.
- New: `storage_removed_at TIMESTAMPTZ`, `storage_removed_reason TEXT` CHECK in
  (`'discarded'`, `'returned'`, `'sent_out'`).
- `storage_position` (text) is kept and always written together with `storage_position_id` (the cubby
  code), so the QC list and every existing reader keep working.

### 3.5 Occupancy rule

A cubby's occupancy is the number of **physical samples** in it:

```
count(DISTINCT coalesce(s.lab_source_sample_id, s.id))
  where s.storage_position_id = cubby.id
    and s.deleted_at is null
    and s.storage_removed_at is null
```

Contract siblings (one `samples` row per contract, linked by `lab_source_sample_id`) are one tin,
counted once, and always share one cubby. A view `storage_position_occupancy(position_id, occupied)`
provides this for the UI.

### 3.6 `qc_client_settings`

- New: `retention_months INTEGER NULL CHECK (retention_months BETWEEN 1 AND 120)`. NULL = use the
  lab default.

### 3.7 Keep-until rule

Computed, never stored:

```
keep_until = coalesce(s.certificate_generated_at, s.created_at)::date
             + make_interval(months => coalesce(qcs.retention_months, lab.retention_months_default))
```

where `qcs` is the `qc_client_settings` row of `s.client_id`, and `lab` is `s.laboratory_id`. For a
sibling group the root's values decide. Changing a setting re-dates every sample immediately.

### 3.8 History

`storage_history` (exists) gets one row per event, `action` in `'placed' | 'moved' | 'removed'`,
`position_id`, `sample_id` (the group root), `performed_by` (always a user: for automatic placement
at intake it is the user who submitted the intake), `notes` (move reason / removal reason).

## 4. Blueprint editor (Part 1)

### 4.1 Where it lives

- Laboratories → "Manage Storage" opens a **full-screen overlay** (replaces the modal).
- `/samples/storage` opens the same overlay read-only, with a lab switcher limited to the user's labs.
- Two modes: **View** (default, every lab user) and **Edit** (the same permission that gates
  "Manage Storage" today).

### 4.2 Canvas

- SVG, viewBox in centimetres; scales to any screen and prints crisply.
- Pan: drag on empty space (or Space + drag). Zoom: wheel / pinch, centred on the pointer. "Fit"
  frames the room.
- 10 cm snap grid, faint lines every 10 cm and stronger every 1 m; Alt disables snapping while held.
- Scale bar and the room's overall width × depth always visible.
- Tools: **Select**, **Room** (drag a rectangle; several union into one outline, drawn as one wall
  outline), **Shelf**, **Furniture** (kind picker), **Door**, **Window**.
- Select: drag to move; 8 handles to resize (minimum 20 cm); `R` / rotate button turns 90°;
  `Delete` removes; `Cmd/Ctrl+Z` undo, `Shift+Cmd/Ctrl+Z` redo; live "W × D cm" label while dragging.
- Overlapping shelves / furniture get a red outline. Warning only, never blocked.

### 4.3 Inspector (right panel)

- Any shape: exact X, Y, W, D (cm), rotation, label / kind.
- Shelf additionally: letter, rows, columns, capacity per cubby, access side, and the **front grid**:
  every cubby a square with its code, `occupied/capacity`, and zone colour.

### 4.4 Save

- One **Save** sends the whole plan: `PUT /api/laboratories/[id]/floor-plan` with
  `{ floor_plan, shelves: [...] }` (shelves with `id` for existing, without for new, omitted = delete).
- Server validates the JSON shape, then calls one database function (`save_lab_floor_plan`) that
  applies the plan document and every shelf create / update / delete plus cubby regeneration in a
  single transaction: all or nothing.
- Refusals (shelf or cubbies being removed still hold samples, duplicate shelf letter) return 409
  with the offending shelf letters / cubby codes.
- Leaving with unsaved changes asks for confirmation.

### 4.5 View mode

- Shelves drawn from above with their letter and a fill bar; zone colours tint the shelf in
  proportion to its cubbies.
- Click a shelf → its front grid. Click a cubby → its samples, labelled by **certificate number**, or
  contract number + refs when uncertified. `tracking_number` is never rendered.
- Search box: certificate number, contract number or ref → highlights shelf and cubby on the plan.

### 4.6 Look

Inter, black and white, per the app shell. Containers (overlay, panels) soft corners; the plan
surface, front grids and cubbies square (data). Zone colours from the chart palette
(`#556b2f #a9a454 #b07946 #445763 #efe4d4 #151618`), cycling with a diagonal hatch on the second
lap; each zone labelled with the client's trade name (`companyDisplayName()`) in the legend. No
emojis.

### 4.7 Code layout

`src/components/storage/blueprint/`

| File | Purpose |
|---|---|
| `geometry.ts` | snap, rotate, rotated bounds, hit-test, overlap, room outline union. Pure, unit-tested |
| `floor-plan-schema.ts` | `FloorPlan` type + validator, shared by client and route |
| `use-blueprint-editor.ts` | editor state, tools, selection, undo/redo, dirty flag |
| `blueprint-canvas.tsx` | SVG surface, pan/zoom, grid, pointer handling |
| `shapes.tsx` | room, furniture, door/window, shelf renderers + handles |
| `inspector.tsx` | right panel |
| `shelf-front-grid.tsx` | front grid (used in inspector, view mode, zone painting, cubby picker) |
| `storage-overlay.tsx` | full-screen shell, mode switch, tabs (Plan / Due for discard) |

Retired: `storage-layout-view.tsx`, `lab-storage-management.tsx`, `shelf-card.tsx`,
`shelf-detail-dialog.tsx`, `shelf-assignment-dialog.tsx`, `position-assignment-dialog.tsx`,
`position-grid.tsx`, `position-cell.tsx`, `src/app/laboratories/page_ENHANCED.tsx`, and the old
shelf / position / generate-positions / storage-layout / `assign-storage` / `suggested-positions`
routes once nothing calls them (Part 2 replaces the last two). Every file
stays well under ~2000 lines.

### 4.8 Existing shelves on first open

The migration gives every existing shelf a default footprint (`width_cm = columns × 30`,
`depth_cm = 40`) and lays them in a row 50 cm apart, so they appear on the plan ready to be dragged
into place. `floor_plan` starts NULL; the editor opens with an empty room and a prompt to draw it.

## 5. Zones and placement (Part 2)

### 5.1 Zone client

A sample's zone client is its QC client, `samples.client_id` (a `companies` id). No client → general
space.

### 5.2 Proposing zones ("Auto-assign zones", Edit mode)

Pure TypeScript allocator (`src/lib/storage/zone-allocator.ts`), fed by a route that returns the
per-client demand inputs for the lab:

1. **Demand per client** = average physical samples per month over the last 6 full months
   × retention months (client override or lab default) × 1.2, then
   `cubbies_needed = ceil(demand / capacity_per_position)` (shelves with different capacities: use
   the capacity of the cubbies actually allocated, filling until the slot count is met).
2. Clients needing < 1 cubby get no zone (general space), unless painted by hand.
3. Allocate largest demand first. Walk cubbies in **walking order**: shelf letter, then row, then
   column. Each client starts on a fresh row and is kept on as few shelves as possible (if the next
   block would split across shelves while a whole free shelf could hold it, take the whole shelf).
4. At least 15% of all cubbies remain general.
5. Demand above capacity: every zone shrinks proportionally; a warning shows the shortfall in
   cubbies.

The result is a **preview**: the plan tints with the proposed zones beside a table
(client, demand in samples, cubbies needed, cubbies given). **Accept** writes `company_id` on the
cubbies; **Discard** drops it. Cubbies whose current zone is painted by hand are overwritten only on
Accept, and the table shows how many hand-painted cubbies change.

### 5.3 Painting

Pick a client (or "General") in the legend, then click or drag across cubbies in the front grid.
Saved with the plan's Save.

### 5.4 Rezoning never moves tins

Samples stay in their cubby. A sample sitting in a cubby now zoned for another client is shown as
"outside zone" until it leaves storage.

### 5.5 `place_sample(p_sample_id uuid, p_user uuid) RETURNS uuid`

Database function, one transaction:

1. Resolve the group root (`coalesce(lab_source_sample_id, id)`). If the root (or any live sibling)
   already has `storage_position_id`, set the same cubby on the given row and return it.
2. Candidates in the sample's lab: cubbies in the client's zone with free space, preferring the
   cubby that client most recently received a placement in, then walking order. If none, general
   cubbies (`company_id IS NULL`) in walking order.
3. Lock the candidate (`SELECT … FOR UPDATE`), recount its occupancy (§3.5); if full, move to the
   next candidate.
4. Set `storage_position_id` and `storage_position` on every live row of the group; insert a
   `storage_history` `'placed'` row; return the cubby id.
5. Nothing free → return NULL, change nothing.

Called by the routes that create samples (New Sample wizard `POST /api/samples`, CVA "Add sample")
after the rows are inserted, and when a contract row is added to an existing group (inherits the
root's cubby). A placement failure is logged and **never fails the intake**.

### 5.6 What the tech sees

- New Sample success screen: large "Store in **B-C4**" with the shelf letter. If NULL: "No free
  storage — choose a position" with the cubby picker.
- Tin label: when the label is printed after intake, the cubby code is printed on it.

### 5.7 Moving by hand

- The cert editor's free-text storage input becomes a **cubby picker** (shelf → front grid → cubby);
  the sample view gets the same picker as a Storage tile.
- `POST /api/samples/[id]/storage` `{ position_id }` moves the whole group, logs `'moved'`. Moving
  into another client's zone is allowed with a warning; a full cubby is refused.
- A lab without shelves shows "No shelves configured" instead of the picker.

## 6. Retention and discard (Part 3)

### 6.1 Settings

- Lab default: lab edit dialog ("Keep samples for N months after certification").
- Client override: Clients → QC settings; empty = lab default.

### 6.2 "Due for discard" tab (storage overlay)

- Lists placed, not-removed, not-deleted physical samples with `keep_until ≤ today`; a toggle adds
  those due in the next 14 days.
- Grouped by shelf → cubby, sorted in walking order so the tech clears the room in one pass.
- Row: certificate number (or contract number + refs), client trade name, keep-until.
- Tick per cubby or per sample → **Remove**, with a reason: Discarded / Returned to client / Sent out.
  Sets `storage_removed_at` + reason on the whole group, logs `'removed'`. The space is free for the
  next intake at once.
- Printable pick list through the shared `PrintPreviewDialog`.
- The sample view's Storage tile offers the same "Remove from storage".

## 7. Migration and rollout

SQL is pasted for Daniel to apply (per his standing preference), one file per part under
`database/migrations/`:

- **Part 1** `20261007000000_storage_blueprint.sql`: `floor_plan`; shelf footprint columns + default
  layout backfill; `client_id → company_id` on `lab_shelves` and `storage_positions`, keeping a value
  only when it exists in `companies`; drop `is_available`, `current_count`, `current_samples`,
  `x_position`, `y_position`, `entrance_*`; `samples.storage_position_id` backfilled by matching
  `storage_position` text to `position_code` in the same lab; `storage_position_occupancy` view;
  `save_lab_floor_plan()`; recreate `client_visible_shelves` and `get_client_samples_in_storage()` on
  `companies` without `tracking_number`; RLS policies with the profiles predicate inlined
  (`is_waqc_staff` is not on the live DB). Before writing it, check `pg_proc` / `information_schema`
  for every helper and column assumed.
- **Part 2** `…_storage_zones_placement.sql`: `place_sample()`, demand query function.
- **Part 3** `…_storage_retention.sql`: `retention_months_default`, `qc_client_settings.retention_months`,
  `storage_removed_at` / `_reason`, due-for-discard query function.

Client-portal storage routes (`/api/clients/me/storage-*`) are only repointed to the new columns;
no new portal features.

Each part ships on its own and is pushed to `main` when done (trunk-based, Vercel deploys).

## 8. Testing

- Unit (vitest): `geometry.ts` (snap, rotation bounds, overlap, outline union), floor-plan validator,
  zone allocator (largest-first, fresh row, whole-shelf preference, 15% general floor, proportional
  shrink), keep-until rule, walking-order sort.
- Route tests: floor-plan save (validation, 409 refusals), place on intake (placement failure does
  not fail intake), move, remove. Existing fake Supabase clients accept any column name, so the
  tests assert the exact columns written.
- SQL scenario script for `place_sample`: sibling inherits the root's cubby; full zone falls back
  to general; nothing free returns NULL; occupancy counts a sibling group once.
- `next build` before push (route files export only handlers).
- Browser QA by Daniel; no `tracking_number` on any new surface.

## 9. Out of scope

Freeform/angled walls, background image tracing, per-tin slot addresses, the iPad app, new client
portal features, physical-move suggestions after rezoning.
