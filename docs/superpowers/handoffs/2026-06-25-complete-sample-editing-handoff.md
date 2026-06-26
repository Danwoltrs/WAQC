# Handoff — Complete Sample Editing + Header Attributes (2026-06-25)

**Resume point:** EXECUTE the 7-task plan [`../plans/2026-06-25-complete-sample-editing.md`](../plans/2026-06-25-complete-sample-editing.md) via **superpowers:subagent-driven-development** (the user was choosing execution mode when the session paused; default to subagent-driven — it's how the prior feature shipped). **No app code written yet** — only the spec + plan are committed (and unpushed). Start at Task 1.

## The work (one paragraph)

On the unified `SampleDetailOverlay` (the fullscreen quadrant sample view used by `/certificates`, `/samples/qc`, `/samples/other`), make the whole sample editable and surface three attributes in the header. Specifically: (1) **shrink** the too-tall info-strip tiles; (2) add a **compact attributes line** under the strip showing Crop · Processing · Certifications (click → edit); (3) **complete the "Edit details" panel** so every PATCH-supported commodity/logistics field is editable even when left blank at intake — restoring Container + ICO # (lost when the old modal was retired) and adding crop year, certifications, shipment month, supplier, and a processing dropdown; (4) **certifications pull from sys** — a "Pull from contract" button reads the linked sys `contracts` row's certifications. **No DB migration** (every target column already exists and is already in the `/api/samples/[id]` PATCH allowlist).

## Repo state right now

- **Single repo:** `/Users/danielwolthers/Documents/GitHub/WAQC` — branch `main`, **ahead of `origin/main` by 2** (unpushed). `docs/` and `src/` are both in this one repo (the generic handoff repo-facts describe a *different* project's two-repo layout — ignore that here).
- **Unpushed (local-only):** `192b575 docs(plan): complete sample editing…` and `0c42a8f docs(spec): …`. These are the spec + plan for THIS work. Push only after the user's OK.
- **Pushed / live on prod:** everything else, incl. the prior **unified sample view** feature (`a1ce977..8d6b651`) and Daniel's `ae508c6` / `7e95240` / `c92510a`. Prod = Vercel on `main`.
- **Working tree (UNRELATED — leave alone, Daniel's):** `M src/app/api/certificates/[id]/override/route.ts`; untracked `database/migrations/20260624000000_allow_override_terminal_transitions.sql` and two `docs/superpowers/handoffs/2026-06-2{2,4}-partner-portal-*.md`. Do **not** sweep these into any feature commit.
- **Stashes:** none.

## What's done

This session = **planning only for this feature**; no implementation code yet.

| SHA | What |
|---|---|
| `0c42a8f` | `docs(spec)` — [`../specs/2026-06-25-sample-header-crop-processing-certifications-design.md`](../specs/2026-06-25-sample-header-crop-processing-certifications-design.md) (local-only) |
| `192b575` | `docs(plan)` — [`../plans/2026-06-25-complete-sample-editing.md`](../plans/2026-06-25-complete-sample-editing.md) (local-only) |

Earlier this session (already **shipped + on prod**): the unified `SampleDetailOverlay` feature, `a1ce977..8d6b651` (9 tasks + T5 fix + polish), tsc clean and **402/402 vitest green** at last run; final whole-branch review (opus) returned zero Critical. Its ledger record is in `.superpowers/sdd/progress.md`.

## Locked decisions (do NOT relitigate)

1. **Certifications = "Pull from contract" + manual override** (not auto-mirror). A button pulls the linked sys contract's certs; canonical chips + custom add/remove let you adjust before Save.
2. **Compact strip** = drop the per-tile reserved "Edit" hint line + `py-3→py-2`; add a separate **attributes line** below for crop/processing/certs.
3. **Complete the edit panel** for all PATCH-supported commodity/logistics fields. **OUT of scope** (user said so; each would need a PATCH-allowlist entry): AWB / courier / quick-look, notes, arrival_date, hide_exporter_on_label, PSS link.
4. **No migration, no API allowlist change** — `crop_year`, `certifications`, `shipment_month`, `supplier`, `container_nr`, `ico_number` are already in `allowedFields`.
5. **`wolthers_contract_nr` gets NO new control** — it's already editable inside `SupplyChainEditTable` (line ~396). Adding one would duplicate it.
6. `supplier` (farm/coop name) and `shipment_month` ARE included (text + `type="month"`). Processing upgrades from free-text to a `PROCESSING_METHODS` dropdown (preserving any non-standard current value).
7. Cert normalization is centralized: extract `normalizeCertifications(raw): string[]` from `contract-intake-mapping.ts` and reuse it in the new endpoint (DRY).

## Files created / modified by the plan

- **Modify** `src/lib/contract-intake-mapping.ts` — extract `normalizeCertifications`; call it from the existing mapping. (+ append tests to `src/lib/contract-intake-mapping.test.ts`.)
- **New** `src/app/api/samples/[id]/contract-certifications/route.ts` — GET resolving `wolthers_contract_nr` → `contracts` → union of normalized certs.
- **Modify** `src/components/certificates/cert-editor/use-cert-editor.ts` — add `crop_year, certifications, shipment_month, supplier` to `COMMERCIAL_FIELDS` + `CertSample`.
- **Modify** `src/components/certificates/cert-editor/info-strip.tsx` — compact `InfoStripBand` tiles; add `AttributesLine`; complete `DetailsEditPanel`.
- **New** `src/components/certificates/cert-editor/certifications-field.tsx` — pull/chips/custom editor.
- **Modify** `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` — render `<AttributesLine>` after `<InfoStripBand>`.

## Codebase anchors (saves re-exploring)

- [`info-strip.tsx:55-69`](../../../src/components/certificates/cert-editor/info-strip.tsx) — `InfoStripBand` tile `<button>` (the tall one to compact; drop the `opacity-0` "Edit" hint span + `group`, `py-3→py-2`, then drop the now-unused `Pencil` import).
- [`info-strip.tsx:83-252`](../../../src/components/certificates/cert-editor/info-strip.tsx) — `DetailsEditPanel`; replace the `<div className="space-y-6">…</div>` body (Task 7 gives the full replacement). `form` seeds from `draftSample`; `sample.id` feeds `CertificationsField`.
- [`certificate-edit-overlay.tsx:174`](../../../src/components/certificates/cert-editor/certificate-edit-overlay.tsx) — `<InfoStripBand … />` render; add `<AttributesLine … onEdit={() => setPanel('details')} />` right after; import on line 9.
- [`use-cert-editor.ts:15-25`](../../../src/components/certificates/cert-editor/use-cert-editor.ts) — `COMMERCIAL_FIELDS` (`container_nr`/`ico_number`/`wolthers_contract_nr` already present). `CertSample` interface ~line 27-59 (already widened by the prior feature).
- [`contract-intake-mapping.ts:~205-228`](../../../src/lib/contract-intake-mapping.ts) — inline `knownCerts`/`certMap`/`if (Array.isArray(c.certifications))` block to extract.
- `src/app/api/samples/[id]/route.ts:282-332` — PATCH `allowedFields` (confirms crop_year/certifications/shipment_month/supplier/container_nr/ico_number are all accepted).
- `src/components/samples/supply-chain-edit-table.tsx:396` — already edits `wolthers_contract_nr` (decision #5).
- `src/components/samples/intake/constants.ts:13` `CERTIFICATIONS` (5 canonical), `:28` `PROCESSING_METHODS` (8 values).
- `src/app/api/samples/[id]/contracts/route.ts` — the auth/supabase route pattern to model the new endpoint on (note: that route is for `sample_contracts` sub-contracts, NOT the sys `contracts` table — the new endpoint queries `contracts`).

## Gotchas

- **Test command is `npx vitest run`** (single file: `npx vitest run <path>`), config `src/**/*.{test,spec}.{ts,tsx}`, jsdom. NOT `npx tsx --test`. Typecheck: `npx tsc --noEmit`. Suite was **402/402** at last full run.
- **Trunk-based on `main`; commit directly.** Do NOT push until the user says so (spec+plan currently unpushed by design).
- **Stage only your own paths** (`git add <path>`), never `git add -A` — the working tree carries Daniel's unrelated changes (see Repo state). The plan's commits already list exact paths; honor them.
- **Daniel interleaves his own commits to `main`** mid-run. Per-task review base = the *actual* immediately-preceding commit (capture real `HEAD` before each implementer dispatch), and the final review must be scoped to your commits/paths, not a contiguous range.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Ledger:** `.superpowers/sdd/progress.md` (git-ignored scratch) holds the prior feature's record — append a new section when you start executing.
- File-size ceiling ~2000 lines: `info-strip.tsx` ends ~360 lines after this — fine.

## Next / suggested next-up

1. **Execute the plan** (subagent-driven) — Tasks 1→7 in order (1 & 2 are the endpoint/helper foundation; 7 depends on 2, 3, 6). Highest value; everything else waits on it.
2. After parity + final review, **manual UI smoke** (below), then offer to push `main`.
3. (Backlog, from the prior feature's ledger) a few cosmetic minors were already fixed in `8d6b651`; nothing blocking remains.

## Things the user said that should shape future work

- Quality guy: *"everything could be edited, from what I entered to the fields I left blank when I inserted the sample"* → the driver for "complete the edit panel."
- *"no need to edit awb, courier, etc. just sample info, process method, region, certs, crop, etc."* → scope boundary (decision #3). "region" = micro origin.
- Certifications should *"Pull from sys.wolthers.com"* → pull from the linked `contracts` row (shared Supabase).
- On the strip: *"quite a lot of space"* (with a screenshot of the tall tiles) → compact it (decision #2).
- Standing prefs: trunk-based push-when-ready; Daniel applies migrations himself and prefers pasted SQL (N/A here — no migration); he does the manual UI smoke.

## Manual smoke test (after build)

Open Edit details on an SS sample (e.g. a Dunkin sample on `/samples/qc`):
1. Info strip is visibly ~half its old height; the attributes line under it shows Crop / Processing values + certification badges (or "No certifications").
2. In the panel: Processing is a dropdown (a non-standard existing value is preserved); Crop year, Supplier, Container #, ICO #, Shipment month, Warehouse location are all editable — and fillable when the sample left them blank.
3. Certifications: toggle canonical chips; **Pull from contract** loads certs when the sample's Wolthers contract # matches a sys `contracts` row (toast on no-match / no-certs); custom add/remove works.
4. Save → reopen: values persisted; strip + attributes line reflect them; regenerated cert PDF shows the certifications.
