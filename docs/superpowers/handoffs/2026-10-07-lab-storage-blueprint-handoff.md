# Handoff — Lab storage blueprint, Part 1 (2026-10-07)

**Resume point (updated 2026-10-13):** Part 1 is LIVE on main (`cfec09ee`; SQL `20261007000001/2` + `20261013000000` applied, scenarios 1-11 pass). The editor follow-up (right-click menu, lock, groups, multi-select, align/distribute, duplicate/copy/paste, room names; spec [`../specs/2026-10-13-storage-editor-menu-groups-design.md`](../specs/2026-10-13-storage-editor-menu-groups-design.md), plans `../plans/2026-10-13-storage-editor-menu-groups-part-a.md` + `-part-b.md`) is BUILT and reviewed locally, head `b0569a64`, **not pushed**. Next: (1) Daniel applies `database/migrations/20261013000001_storage_lock_groups.sql` (last result: two rows, `group_id text YES`, `locked boolean NO false`) and runs `database/tests/storage_blueprint_scenarios.sql` (scenarios 1-13; success = no error); (2) `git push origin HEAD:main`; never before (1): `layout.ts` now selects `lab_shelves.locked, group_id` and the storage screen 500s without them; (3) smoke test, list in Part B Task 10 Step 5; (4) write the Part 2 plan (zones + `place_sample`).

Deferred minors from the 2026-10-13 review (not fixed, Daniel to decide): touch long-press on the floor opens the menu with a stale/empty target; right-click on a resize handle shows the floor menu; distribute ignores a locked middle shape's position; a nudge into the wall records an empty undo step; Edit details on a locked shape focuses nothing; scenario 12 tests a rename not a swap; clipboard keeps room/item ids; Cmd+C with shapes selected swallows a side-panel text copy; Cmd+G on an exact group drops its name; letter keys in an open Select reach the L/R shortcuts; no canvas Shift+drag box test and no real-Radix Escape test.

## The work (one paragraph)
Daniel wants lab sample storage drawn as a real blueprint: the room seen from above and drawn to scale, with furniture, doors, windows and shelves at their true size and position. Each shelf has a front-view grid of cubbies. Space is reserved per client, every new sample is given a cubby at intake, and samples leave storage on a retention schedule. That is three parts. **Part 1 (this handoff)** builds the drawable blueprint and its one-transaction save, and moves shelf and cubby zones off the `clients` table (dropped 2026-05-28) onto `companies`. Today's "Manage Storage" modal shows "No shelves configured", most likely because its API still embeds `clients(id, name)`; this was not verified, since there was no DB access. Part 2 covers zones and auto-placement at intake; Part 3 covers retention and the discard list. Their plans get written after Part 1 ships, so they build on the real code.

## Repo state right now
- **Repo (WAQC, the only repo involved):** branch `feat/report-layout-rejection-reasons`, whose HEAD was equal to `origin/main` (`5c503901`) before this session. The working tree was clean apart from untracked files that predate this session (`database/check_dunkin_week_2026_09_21.sql`, `docs/quality-control-services/`, the 2026-09-25 annual-report plans/handoff, etc.). Leave those alone and stage targeted paths only.
- **Unpushed (local only):** `72551f07` (spec) and `877bdb90` (Part 1 plan), plus this handoff once committed. Verify with `git log --oneline origin/main..HEAD`.
- **Stashes:** none known; check with `git stash list`.
- **Database:** nothing applied yet. Daniel applies every migration himself, from SQL pasted in chat.

## What's done
| SHA | What |
|---|---|
| `02cc495b`..`f962ece7` | Tasks 1-10 of the plan, executed natively (TDD per task) |
| `6147de29` | Review fix: inspector edits commit to the shape they were typed for; /samples/storage is read-only (`readOnly` prop) |
| `120ea436` | Review fix: limits apply to what a shape covers (a shelf turned 90 degrees can stand at x = 0, stored x may be negative; DB CHECK `lab_shelves_place_valid` on the footprint); scenario script checks the deferred letter constraint and occupied cubbies with triggers off |
| `72551f07` | `docs(storage)`: spec [`../specs/2026-10-07-lab-storage-blueprint-design.md`](../specs/2026-10-07-lab-storage-blueprint-design.md), **approved by Daniel** |
| `877bdb90` | `docs(storage)`: Part 1 plan (10 tasks, full code + tests), self-reviewed, **not yet reviewed by Daniel line by line**; he chose native execution via this handoff |

Verified: tsc 0, `npm run build` 0, full vitest 252 files / 2697 tests pass (19 unhandled-rejection "Errors" from CvaJourney + sample-intake-form tests reproduce on base `d7f75160`). SQL never run against a DB.

Rulings beyond the plan: certificates filtered by `voided_at IS NULL` (not `is_latest`, which no app code reads); newly unused lucide imports removed from the labs page. Deferred minors (see ledger): new lab shows 1,764 capacity until its first plan save (POST `|| 1764`); lab edit PATCH can resend a stale `storage_capacity`; entrance not converted to a door item; last save wins (no version token); 409 has no Reload button and save network errors are unhandled; undo to the saved state stays dirty; search's cert pre-query `limit(20)` spans all labs; lab creation lost its "invitation sent" confirmation.

## Locked decisions (do NOT relitigate)
1. **Auto-assign** = reserve zones per client (proposed by volume, adjustable by painting cubbies), then auto-place each new sample into its client's zone, with overflow to general space. *(Part 2)*
2. **Placement happens at intake, automatically**, and is shown on the New Sample success screen. *(Part 2)*
3. **Drawing fidelity:** rectangles to real scale, integer **cm**, 10 cm snap (Alt = free), L-shaped rooms by joining rectangles, rotation in 90° steps only. No freeform walls, no tracing over a photo.
4. **Address granularity = cubby** (`B-C4`) with a capacity (42 at Santos). No per-tin slots.
5. **Retention:** lab default (6 months) plus a per-client override; keep-until = certificate date (else intake) + months, computed and never stored; a "Due for discard" list. *(Part 3)*
6. **Engine:** plain SVG in cm user units with our own pointer handlers. No konva, tldraw or excalidraw.
7. **Storage split:** room and furniture are one JSON doc in `laboratories.floor_plan`. Shelves stay rows in `lab_shelves` with `x_cm/y_cm/width_cm/depth_cm/rot/access_side`. Cubbies are `storage_positions`, and a client zone is `storage_positions.company_id`.
8. **Occupancy is counted, never stored:** physical samples per cubby = distinct `COALESCE(lab_source_sample_id, id)`. Contract siblings share one tin and one cubby. `current_count`/`current_samples` are dropped.
9. **Writes go only through SECURITY DEFINER `save_lab_floor_plan`**, all-or-nothing, refusing with every conflict listed (a shelf or cubby still holding samples, a duplicate letter). Staff read the tables directly.
10. **Edit rights:** global admin, `global_quality_admin`, or the `lab_quality_manager` of that lab. **View:** any internal user of the lab, plus `global_*` roles.
11. **Deliberate departures from the spec**, already written into the plan:
    - occupancy is a function, not a view;
    - GET and PUT both use `/api/laboratories/[id]/storage`;
    - `/samples/storage` embeds the workspace instead of opening the overlay;
    - the unused client-portal storage routes and `ClientStorageView` are **deleted**, because they return the SAN number.
12. **Lab creation becomes one step** and opens the new lab's storage in Edit mode. The old shelf and obstacle wizard steps are deleted.

## Files created / modified by the plan
Full table in the plan's "File Structure". In short:
- **New:**
  - `database/migrations/20261007000000_storage_blueprint_preflight.sql`, `…0001_storage_blueprint_schema.sql`, `…0002_storage_blueprint_functions.sql`
  - `database/tests/storage_blueprint_scenarios.sql`
  - `src/lib/storage/*`: floor-plan, geometry, storage-access, layout, save-errors, cubby-samples, and the `__fixtures__/fake-supabase.ts` test helper
  - `src/app/api/laboratories/[id]/storage/` (route, `cubbies/[positionId]`, `search`)
  - `src/components/storage/blueprint/*`: 13 files
- **Modify:**
  - `src/app/laboratories/page.tsx`, which drops from 1990 lines to about 1400
  - `src/app/samples/storage/page.tsx`
  - `src/app/api/laboratories/[id]/route.ts` (drop `entrance_*` from PATCH)
- **Delete:**
  - 9 old `src/components/storage/*` components
  - `src/app/laboratories/page_ENHANCED.tsx`
  - the routes `laboratories/[id]/{storage-layout,shelves,positions}`, `samples/[id]/{assign-storage,suggested-positions}` and `clients/me/storage-*`

## Codebase anchors (saves re-exploring)
- [`src/app/laboratories/page.tsx`](../../../src/app/laboratories/page.tsx):
  - `:28`: `LabStorageManagement` import
  - `:111`: `labCreationStep`
  - `:220–454`: shelf/obstacle helpers and `handleFinishCreation`, all to delete
  - `:311`: `handleNextStep`
  - `:651–663`: dialog header and progress bar
  - `:962`: step-1 footer button "Next: Configure Shelves"
  - `:966–1385`: steps 2 and 3, to delete
  - `:1488`: Manage Storage button
  - `:1522–1537`: storage Dialog, to be replaced by `StorageOverlay`
  - `:160–161`: `canManageAllLabs` / `canManageOwnLab`
- [`src/app/samples/storage/page.tsx`](../../../src/app/samples/storage/page.tsx) `:156–160`: `<StorageLayoutView>` block to replace.
- [`src/app/api/laboratories/[id]/route.ts`](../../../src/app/api/laboratories/[id]/route.ts) `:140–141`: `entrance_x_position` / `entrance_y_position` in `allowedFields`.
- [`src/app/api/laboratories/[id]/storage-layout/route.ts`](../../../src/app/api/laboratories/[id]/storage-layout/route.ts) `:45–64`: the `clients (id, name)` embed. This is the likely cause of the empty modal; the file is deleted by the plan.
- [`src/lib/auth/sample-access.ts`](../../../src/lib/auth/sample-access.ts) `:33`: `isInternalStaffProfile`, mirrored by the plan's access rule.
- [`src/lib/sample-reference.ts`](../../../src/lib/sample-reference.ts) `:121`: `sampleLabelText`, which names a sample by certificate, else by its own reference.
- [`src/lib/contract-intake-mapping.ts`](../../../src/lib/contract-intake-mapping.ts) `:101`: `companyDisplayName`. Its `ContractCompany` type **requires `id`**.
- [`src/app/api/exporters/route.test.ts`](../../../src/app/api/exporters/route.test.ts): the house pattern for route tests (`vi.hoisted` state plus a mocked `@/lib/supabase-server`).
- [`src/components/certificates/cert-editor/certificate-edit-overlay.tsx`](../../../src/components/certificates/cert-editor/certificate-edit-overlay.tsx) `:211`: the full-screen overlay pattern (`fixed inset-0 z-50 flex flex-col bg-background`).
- Untouched in Part 1, relevant for Part 2:
  - `src/lib/sample-group.ts:138` sets `row.storage_position = null` on new siblings; Part 2 makes them inherit.
  - `POST /api/samples` creates siblings at `src/app/api/samples/route.ts:681` and returns at `:745`.
  - `src/components/samples/intake/success-view.tsx`
  - the cert editor's free-text "Warehouse location" at `src/components/certificates/cert-editor/info-strip.tsx:693–696`.

## Gotchas
- **Supabase SQL editor traps:**
  - It appends `ALTER TABLE <x> ENABLE RLS` for any `SELECT … INTO x` or `CREATE TABLE`/`TEMP` it sees, function bodies included. So there is no `SELECT … INTO` and no `RETURNING … INTO` anywhere; use `v := (SELECT …)` and pre-generated ids. Task 1 Step 5 has the lint `grep`.
  - Use `BEGIN; … COMMIT;`.
  - The editor shows only the last result set, which is why the preflight is one `UNION ALL` query.
- **`is_waqc_staff()` does not exist on the live DB.** Use the inline profiles predicate that is in the plan's Global Constraints.
- **jsdom 25 here has no `PointerEvent` and no `DOMPoint`.** `fireEvent.pointerDown` sends a bare `Event` with `button` undefined, so the canvas tests need the `TestPointerEvent` stand-in at the top of `storage-overlay.test.tsx`; the plan includes it. Verified this session with a probe test.
- **Keyboard order:**
  - The editor's shortcuts listen on `document` and the overlay's Escape on `window`, so an Escape that only deselects is `preventDefault`ed first.
  - Tests must dispatch keys on `document`.
- **`useBlueprintEditor()` returns `{ state, actions }` with `actions` memoized.** Don't spread actions into a fresh object, or the workspace's `load` effect refetches in a loop. The overlay test asserts exactly one GET.
- **`route.ts` files may export only handlers.** `next build` rejects helper exports even though tsc and vitest pass; this broke every prod deploy from 09-10 to 09-15. Run `npm run build` before pushing.
- **The fake Supabase clients accept any column name.** Assert the exact select strings where it matters, e.g. the cubby route test checks there is no `tracking_number`.
- **`src/lib/database.types.ts` is stale** for the storage tables. Surrounding code casts `(supabase as any)`; do the same and don't hand-edit generated types.
- **The schema migration updates `samples` rows** (backfilling `storage_position_id`), and the save function rewrites `samples.storage_position` when a cubby is renamed. Check the preflight's "samples trigger" rows for any trigger that fires on every column, such as the sys mirror, before Daniel applies the migration.
- Trunk-based deploys: `git push origin HEAD:main` goes straight to Vercel Production. **Push only after Daniel confirms** the preflight, schema, functions and scenario SQL all ran clean.
- Keep every file under about 2000 lines. `client-form.tsx` (1868 lines) is untouched in Part 1, but Part 3 adds to it.

## Next / suggested next-up
1. **Part 1, Tasks 1–10, native.** In Task 1, adjust the migration to whatever the preflight shows. For example, a CHECK on `lab_shelves.position_layout` would reject `'grid'`, and existing shelf letters or grids may sit outside the new CHECKs.
2. One fresh reviewer (most capable model) on the whole branch diff, then fix what it finds.
3. Push, then ask Daniel for the browser check below.
4. Write the **Part 2** plan (zones + `place_sample` + intake success screen + cubby picker + tin label). Then Part 3 (retention settings, `storage_removed_at`, the Due for discard tab, a printable pick list).
5. Update memory `lab-storage-blueprint.md` and the MEMORY.md index line after each push.

## Things the user said that should shape future work
- "make it like a drawable blueprint, adding more or less the room space, furniture, view from top, and where the shelves are, and how big they are. Then the grid per shelves. And allow to auto assign the spaces per clients."
- Chose, in order:
  - reserve zones, then auto-place;
  - at intake, automatically;
  - rectangles to scale;
  - cubby-level addresses;
  - retention period plus a discard list;
  - lab default with a per-client override;
  - approach A (SVG);
  - native execution.
- Standing rules:
  - always paste SQL in chat, and Daniel applies it;
  - never show the SAN number anywhere;
  - user-facing company names are trade names (`companyDisplayName`);
  - UI corners: 10px on containers, 6px on controls, square on data;
  - keep Inter and the black/white palette;
  - no emojis;
  - no visual companion in brainstorming.

## Manual smoke test (after push)
1. Laboratories → Manage Storage on Santos opens full screen. Any existing shelves sit in a row near the top-left, and View mode is read-only.
2. Edit:
   1. Room tool: drag out about 8 × 6 m, then add a second rectangle to make an L. The outline must have no wall between the two rectangles.
   2. Add a Door and a Bench.
   3. Add a Shelf. Move it, resize it from a handle, and press R; the shelf turns 90° and its thick front edge follows.
   4. Overlap the shelf with the bench: both get a red outline, and saving is still allowed.
   5. In the inspector, set rows, columns and per-cubby capacity; the front grid updates.
   6. Undo and redo.
3. Save, close and reopen: everything is kept, and the capacity line matches rows × columns × capacity.
4. Close with unsaved changes: you are asked "Discard unsaved changes?".
5. On `/samples/storage`, the same plan appears, and the search box finds a stored sample by certificate number. This only works for samples whose typed position matched a cubby code in the backfill. The cubby list shows certificate numbers, never SAN.
6. As `lab_personnel`: there is no Edit button, and calling PUT directly returns 403.
