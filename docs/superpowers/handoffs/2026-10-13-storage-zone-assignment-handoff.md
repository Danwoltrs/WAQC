# Handoff — Storage zone assignment (2026-10-13)

**Resume point (updated 2026-10-13, PUSHED):** Zone assignment is LIVE on main at `f4fecb5a` (the 13 commits replayed onto `e5089d75`). SQL `20261013000003_storage_zone_assignment.sql` APPLIED (verify: 8 columns, 2 functions, 1 policy) and `storage_zone_scenarios.sql` ran clean (the `set_config` row). Next: Daniel's smoke test at the end of this file in a signed-in browser (the Chrome extension window was not signed in to qc.wolthers.com, so the double-click fix is still unchecked in a real browser), then his calls on the deferred minors.

## The work (one paragraph)

The lab storage blueprint (Laboratories → a lab → Storage, a full-screen overlay) draws rooms, furniture and shelves to scale; each shelf has cubbies (`storage_positions`). Daniel wants to give cubbies to clients ("zones", `storage_positions.company_id`, `NULL` = general space). Clicking a shelf opens its cubbies big in a centered window; lab staff pick cubbies (click, Cmd/Ctrl+click, Shift+click block) or whole shelves on the plan, choose a QC client, and Save writes it. Anyone who works in that lab may assign zones; only lab quality managers and admins may still change the layout. Every zone change is logged and shown as a history per shelf and per lab. Spec: [`../specs/2026-10-13-storage-zone-assignment-design.md`](../specs/2026-10-13-storage-zone-assignment-design.md) (amends §5.3 of [`../specs/2026-10-07-lab-storage-blueprint-design.md`](../specs/2026-10-07-lab-storage-blueprint-design.md)). Earlier storage history: [`2026-10-07-lab-storage-blueprint-handoff.md`](2026-10-07-lab-storage-blueprint-handoff.md).

## Repo state right now

- **Repo** `/Users/danielwolthers/Documents/GitHub/WAQC`, local branch `feat/report-layout-rejection-reasons`, trunk-based: push with `git push origin HEAD:main` (the branch's own upstream is stale and irrelevant).
- **Pushed:** `e5089d75..f4fecb5a` on `origin/main`; local branch HEAD = `origin/main`. Rebased without stashing: the commits were cherry-picked onto `origin/main` in a temporary worktree, then this branch was moved with `git reset --mixed` (the other session's three `e5089d75` files were byte-identical, so they are now tracked and clean). The pre-rebase SHAs in the table below were renamed by that replay; find them by subject with `git log --oneline -15`.
- **Working tree NOT clean, and not ours:** metrics pages, `performance-leaderboard.tsx`, `supply-chain-sankey.tsx`, `sankey-layout.ts`, `bag-quantity.ts` (+ test), annual-report and QC-services docs. Leave them alone: stage explicit paths only, never `git add -A`.
- **Stashes:** none.

## What's done

| SHA | What |
|---|---|
| `fa47757d` | SQL: `storage_zone_history`, `save_storage_zones`, `storage_zone_history_events`, scenario script (NOT applied) |
| `765592c3` | `canAssignLabZones`, `can_assign` on GET/PUT storage, `PUT …/storage/zones`, `GET …/storage/zone-history`, `parseZoneChanges`, `zoneErrorResponse` |
| `8eafd9e5` | `zones.ts`: cells, picks (only / toggle / range), `shelfZones`, `zoneCounts`, `zoneChanges`, `carryZoneEdits` |
| `389fa808` | editor state: `zone_edits`, `cubbyPick`, `canLayout` (reducer refuses layout actions), `assignZone` one undo step |
| `aaddd5a9` | canvas: Cmd/Ctrl+click toggles, `onOpenShelf`, pan-not-move and no handles without layout rights, shelf tint includes pending zones; menu without layout rights; keyboard skips `[data-cubby-display]` |
| `31189d57` | large front grid with picking + client names, `ZoneAssignBox` (General first, server search, trade names), `ZoneHistory` |
| `39775906` | `CubbyDisplay` (Radix Dialog, 90% x 85%, side column: assign or samples, then history) |
| `114f2a79` | `ShelfSummary` + Open cubbies, Assign N shelves, zones-only panel, lab-wide history in View |
| `8617ee59` | workspace: two-step save (layout, then zones), carry-over on zone failure, cubby window mounted |
| `7d0a9733` | review fix I-1: double-click handled on the svg (Chrome sends it there under pointer capture) |
| `2336b125` | review fix I-2: `loadStorageLayout` pages `storage_positions` past PostgREST's 1000-row cap |
| `1d67bc76` | review fix I-3: Save sends the layout only when the layout payload changed |

Verification at `1d67bc76`: `npx tsc --noEmit -p .` exit 0; `npx vitest run` 267 files / 2834 tests pass; 19 unhandled errors, all pre-existing (`CvaJourney` 3, `sample-intake-form.*` 16). Not checked in a browser.

Final review (opus, fresh context): 0 Critical, 3 Important (all fixed above, each RED then GREEN), 7 Minor deferred:
- M-1 a network failure during Save shows no message (no `catch`).
- M-2 assign-only users resolve cubby codes against the layout loaded at open; a concurrent letter swap elsewhere sends edits to the other shelf (fix: send position ids).
- M-3 zone colours are by list index, so a newly assigned client can change colour after Save.
- M-4 no undo inside the cubby window; after a failed zones step the undo history is reset; `unknown_cubby` does not name the cubby.
- M-5 the zones-only side panel omits the read-only size/position/access details of spec §4.1.
- M-6 "Assign whole shelf" assigns every selected shelf (correct today, fragile).
- M-7 scenario 7 runs every save in one transaction; plus: `storage_lab_occupancy` is also unpaged (display only, labs with >1000 occupied cubbies).

Rulings made during execution (Daniel to confirm): migration renamed 000003; I-3 narrows spec §5.1 (a manager's zones-only Save no longer sends the layout); overlay test counts layout GETs only; a `zones.test.ts` fixture got an explicit shelf id.

SQL status: `20261013000001_storage_lock_groups.sql` APPLIED; its scenarios 12-13 result was never reported back (ask). `20261013000003_storage_zone_assignment.sql` written, NOT applied.

## Locked decisions (do NOT relitigate)

1. Assigning happens in **Edit mode, saved by Save**, with undo; not instant saves in View mode (Daniel's answer).
2. **Anyone who works in the lab** assigns zones (`canAssignLabZones` = the view rule); layout editing stays manager-only. Enforced in the reducer: `EditorState.canLayout = false` refuses every layout action.
3. Pending zones are **`EditorShelf.zone_edits`**: only this session's assignments, sent by cubby code. Never send the whole zone map: it would overwrite a colleague's concurrent change.
4. Cubbies open **big in a centered Radix Dialog**, not in the side panel: View mode on a click, Edit mode on a double-click (a single click must keep selecting for drag), plus "Open cubbies" in the side panel, "View cubbies" in the menu, and Find a sample.
5. Cmd/Ctrl+click toggles (Cmd on a Mac, where Ctrl+click is the context menu); Shift+click picks a block in the grid; whole shelves are assignable too.
6. History: `storage_zone_history` (one row per cubby change), read through `storage_zone_history_events` (one row per save and client change); per shelf in the window, lab-wide in the View side panel.
7. Save order: layout PUT (managers only, also creates new shelves' cubbies), then zones PUT. If zones fail after the layout saved: take the saved layout, carry the edits by shelf letter, stay dirty.
8. Rezoning never moves tins.
9. Out of scope now (later Part 2): auto-proposing zones by volume (old spec §5.2), `place_sample` at intake (§5.5), the "outside zone" marker, the cert-editor cubby picker (§5.7). Then Part 3: retention and discard.
10. Moving past the plan corner (`5e1c6b5d`) stays: Save normalizes, the DB still only ever sees coordinates ≥ 0.

## Files created / modified by the plan

- **New** `database/migrations/20261013000003_storage_zone_assignment.sql`, `database/tests/storage_zone_scenarios.sql`
- **New** `src/lib/storage/zone-changes.ts` (+ test): `ZoneChange`, `ZoneEvent`, `parseZoneChanges`
- **New** routes `src/app/api/laboratories/[id]/storage/zones/route.ts` (PUT) and `.../zone-history/route.ts` (GET), with tests
- **Modify** `src/lib/storage/storage-access.ts` (`canAssignLabZones`), `layout.ts` (`can_assign`), `save-errors.ts` (`zoneErrorResponse`), `src/app/api/laboratories/[id]/storage/route.ts` (returns `can_assign`)
- **New** `src/components/storage/blueprint/zones.ts` (+ test): cells, picks, `shelfZones`, `zoneCounts`, `zoneChanges`, `carryZoneEdits`
- **Modify** `editor-state.ts`, `use-blueprint-editor.ts`, `blueprint-canvas.tsx`, `shapes.tsx`, `canvas-context-menu.tsx`, `use-editor-keyboard.ts`
- **New** `zone-assign-box.tsx`, `zone-history.tsx`, `cubby-display.tsx`, `shelf-summary.tsx`, `view-panel.test.tsx` (+ tests)
- **Modify** `shelf-front-grid.tsx` (whole file), `selection-panel.tsx`, `inspector.tsx`, `view-panel.tsx`, `storage-workspace.tsx`, `storage-overlay.test.tsx`

## Codebase anchors (saves re-exploring)

- [editor-state.ts:22](../../../src/components/storage/blueprint/editor-state.ts#L22) `EditorShelf`; [:27](../../../src/components/storage/blueprint/editor-state.ts#L27) `EditorState`; [:98](../../../src/components/storage/blueprint/editor-state.ts#L98) `initialEditorState`; [:245](../../../src/components/storage/blueprint/editor-state.ts#L245) `fromLayout`; [:417](../../../src/components/storage/blueprint/editor-state.ts#L417) `insertClip`; [:513](../../../src/components/storage/blueprint/editor-state.ts#L513) `editorReducer` (Task 4 renames it `reduce` and wraps it)
- [blueprint-canvas.tsx:33](../../../src/components/storage/blueprint/blueprint-canvas.tsx#L33) props; [:197](../../../src/components/storage/blueprint/blueprint-canvas.tsx#L197) `onShapeDown`; [:221](../../../src/components/storage/blueprint/blueprint-canvas.tsx#L221) `onShapeDouble`; [:370](../../../src/components/storage/blueprint/blueprint-canvas.tsx#L370) `<ShelfShape>`; [:399](../../../src/components/storage/blueprint/blueprint-canvas.tsx#L399) handles
- [storage-workspace.tsx:79](../../../src/components/storage/blueprint/storage-workspace.tsx#L79) `save`; [:115](../../../src/components/storage/blueprint/storage-workspace.tsx#L115) `companiesInUse`; [:139](../../../src/components/storage/blueprint/storage-workspace.tsx#L139) `viewCubbies`; [:201](../../../src/components/storage/blueprint/storage-workspace.tsx#L201) tool palette; [:231](../../../src/components/storage/blueprint/storage-workspace.tsx#L231) `<Inspector>`; [:236](../../../src/components/storage/blueprint/storage-workspace.tsx#L236) `<ViewPanel>`
- [canvas-context-menu.tsx:84](../../../src/components/storage/blueprint/canvas-context-menu.tsx#L84) `menuState`; [use-editor-keyboard.ts:27](../../../src/components/storage/blueprint/use-editor-keyboard.ts#L27) the menu-skip line Task 5 extends
- Small grids Task 8 removes: [inspector.tsx:125](../../../src/components/storage/blueprint/inspector.tsx#L125), [view-panel.tsx:93](../../../src/components/storage/blueprint/view-panel.tsx#L93)
- [storage route.ts:23](../../../src/app/api/laboratories/[id]/storage/route.ts#L23) GET `can_edit`; [:62](../../../src/app/api/laboratories/[id]/storage/route.ts#L62) PUT
- Route-test fake: `src/lib/storage/__fixtures__/fake-supabase.ts` (tables answer by name, `rpc` answers per function, records `rpcCalls`)
- QC client list: `GET /api/clients?search=&limit=` returns `{ clients: [{ id, name (legal), company (trade name) }] }`
- Cubby samples: `GET /api/laboratories/[id]/storage/cubbies/[positionId]` → `{ cubby: { id, code }, samples: CubbySampleRow[] }` (labels are certificate numbers or contract refs, never SAN)

## Gotchas

- **Never show the SAN** (`samples.tracking_number`) anywhere: UI, history, SQL results for people, replies.
- **Supabase SQL editor:** it appends `ENABLE RLS` after any `SELECT … INTO` (use `v := (SELECT …)`; the plan's SQL already does); it shows only the last result set; its role cannot set `session_replication_role`. Daniel applies all SQL and wants it pasted in full.
- **Inline the profiles predicate** in policies and functions; the `is_waqc_staff` helper never reached the live DB. Never drop the sys RESTRICTIVE `*_external_deny` / `_cobroker_deny` / `_party_deny` policies (not in this repo).
- **The storage overlay root has `role="dialog"`** (since `174b24a0`), so the editor keyboard must skip `[data-cubby-display]`, not `[role="dialog"]`, or every shortcut dies.
- **Radix Dialog aria-hides the page behind it:** in tests, close the cubby window (Escape) before querying the Save button. Radix's Escape handler calls `preventDefault`, which is what keeps the overlay's own Escape listener (it checks `defaultPrevented`) from closing the storage screen.
- **jsdom:** no PointerEvent (tests install a `TestPointerEvent`), no DOMPoint, `getScreenCTM` is null so every pointer maps to plan point (0, 0); use client coordinates for drags.
- **Between Part A Tasks 3 and 4** `tsc` fails (`zones.ts` reads `zone_edits`, added in Task 4); vitest still runs. Expected.
- **route.ts files export only HTTP handlers** (`next build` rejects other exports; `src/app/api/route-exports.test.ts` guards it).
- **executing-plans scripts:** `task-done` was once blocked by the safety check (it runs `bash -c` with `rm`); if so, commit separately and write the ledger line by hand. Each plan part has its own ledger under `.superpowers/sdd/<plan-basename>/progress.md`.
- **Files under ~2000 lines** (Daniel's rule; tell him before going past ~2200). The largest touched file, `editor-state.ts`, is ~630 lines.

## Next / suggested next-up

1. Daniel applies `20261013000003` and runs `storage_zone_scenarios.sql`; then rebase onto `origin/main` and push (see Repo state).
2. Smoke test below, in a real browser (jsdom cannot model pointer capture; I-1 was found only in headless Chrome). Include iPad Safari for the double-click.
3. Daniel decides on the deferred minors (M-1..M-7 above); M-1 and M-3 are the cheapest and most visible.
4. Still owed from earlier: the scenario 12-13 result for `20261013000001`, and Daniel's 10-step editor smoke test (menu, lock, groups); deferred editor minors in [`2026-10-07-lab-storage-blueprint-handoff.md`](2026-10-07-lab-storage-blueprint-handoff.md).
5. Then the rest of Part 2 (auto-propose zones, `place_sample` at intake), then Part 3 (retention and discard). Each needs its own plan.

## Things the user said that should shape future work

- "edit mode with save, anyone in the lab can change, doesnt need to be a lab manager. Show history."
- Whole shelves too: "Cubbies and whole shelves".
- "cubbies should open big on a centered display, instead of small on the side". The message was cut off after "a" and Daniel did not add more; check in once whether something was missing.
- "add wall as well" (done in `5e347d18`).
- Standing rules: paste SQL every time; Daniel applies migrations; files under ~2000 lines; trunk-based, push to main; company names via `companyDisplayName` (trade name); no emojis; Inter, black and white, corners 10/6/4/0 (data square); no visual companion when brainstorming.

## Manual smoke test (after build and SQL)

1. As a lab technician: Edit shows no drawing tools; double-click shelf A opens the big window.
2. Click A-A1, Cmd+click A-A3, Shift+click a far cubby: the outline follows; the button reads "Assign N cubbies".
3. Search a client, pick it, Assign: the cubbies tint and show its name; the shelf on the plan tints too.
4. Escape closes only the window; Save; reopen: the zones stay; the shelf's Zone history shows the change with your name.
5. Shift+click two shelves on the plan, "Assign 2 shelves" to General: both clear.
6. As a manager: move a shelf and assign cubbies in one session; Save; both kept.
7. View mode: click a shelf, click a cubby: its samples list by certificate number; with nothing selected, the side panel shows the lab's zone history.
