# Handoff — Inline Attribute Editing + Addable Pickers (2026-06-26)

**Resume point:** Continue **subagent-driven-development** of the 7-task plan [`../plans/2026-06-26-inline-attribute-editing.md`](../plans/2026-06-26-inline-attribute-editing.md). **Tasks 1–5 are committed** (`9bc40f2..c241a31`). **Task 5's task-review was interrupted before it ran** — Task 5 is a 2-file thin-wrapper transcription, tsc-clean, whose logic was already tested in Task 1, so either run a quick task-review of `85b3d81..c241a31` or accept it and move on. Then **EXECUTE Task 6, then Task 7**, then the **final whole-branch review** (opus), then hand the manual smoke checklist to Daniel and offer to push. Nothing is pushed yet.

## The work (one paragraph)

On the unified cert-editor overlay (`src/components/certificates/cert-editor/`, used by `/certificates`, `/samples/qc`, `/samples/other`), make every header value editable **in place** instead of opening the center "Edit details" panel: hover shows a pencil, click opens a small popover anchored at the value with just that field's control. **Crop year** becomes an auto-generated picker that rolls to the new crop every **May** (latest is `26/27` as of June 2026), no "+ add new". **Processing** becomes a picker seeded by the canonical methods **with "+ add new"**; new processing values persist by usage (read back via a new `GET /api/samples/vocabularies` distinct endpoint — no table, no migration). Inline edits write into the overlay's single lifted draft (`ed.setSampleField`) and are persisted by the existing **topbar Save** — no per-field network calls, no second save path. The full "Edit details" panel stays, reachable from a small **"Edit all details"** button. No DB migration.

## Repo state right now

- **SINGLE repo:** `/Users/danielwolthers/Documents/GitHub/WAQC` — branch `main`. Both `docs/` and `src/` live in THIS one repo (ignore the generic handoff repo-facts that describe a *different* project's two-repo `~/.git` layout — they do not apply here).
- **Unpushed (verify):** the spec/plan + Tasks 1–5 are **local-only**. Last push to `origin/main` this session was the PREVIOUS feature at `c4c31b1`. Everything after that (`1ed0d8e`, `24cac6b`, `99ff3f1`, then `9bc40f2..c241a31`) should be local. **Confirm with** `git log --oneline @{u}..HEAD`. Do NOT push until the feature is complete + reviewed + Daniel says so.
- **Working tree (UNRELATED — Daniel's, leave alone):** `M src/app/api/certificates/[id]/override/route.ts`; untracked `database/migrations/20260624000000_allow_override_terminal_transitions.sql` and two `docs/superpowers/handoffs/2026-06-2{2,4}-partner-portal-*.md`. Do **not** stage these into any feature commit.
- **Stashes:** none expected (verify `git stash list`).
- **HEAD:** `c241a31` (Task 5) unless Daniel committed since.

## What's done

| SHA | What |
|---|---|
| `1ed0d8e` | `docs(spec)` — [`../specs/2026-06-26-inline-attribute-editing-design.md`](../specs/2026-06-26-inline-attribute-editing-design.md) |
| `24cac6b` | `docs(spec)` revision — crop year auto-generated (May rollover), no add-new |
| `99ff3f1` | `docs(plan)` — [`../plans/2026-06-26-inline-attribute-editing.md`](../plans/2026-06-26-inline-attribute-editing.md) (7 tasks) |
| `9bc40f2` | Task 1 — `vocab-options.ts` (`cropYearOptions`, `mergeProcessingOptions`) + tests (10/10) |
| `1008f4c` | Task 2 — `GET /api/samples/vocabularies` (distinct processing methods) |
| `329cb81` | Task 3 — `AddableSelect` component + test (4/4) |
| `85b3d81` | Task 4 — `InlineEdit` hover-pencil popover wrapper (no test, typecheck-gated) |
| `c241a31` | Task 5 — `CropYearField` + `ProcessingField` wrappers (review interrupted; tsc-clean) |

Tasks 1–4 reviewed **Approved** (zero blocking issues). Task 5 review NOT completed. tsc clean through Task 5; full suite was **407/407** before this feature; new tests add 10 (vocab-options) + 4 (addable-select). **Remaining: Task 6, Task 7, final review.**

## Locked decisions (do NOT relitigate)

1. **Inline edit = hover-pencil + popover at the value** (`InlineEdit` wrapper). No per-field network call.
2. **Save model unchanged:** inline editors call `onFieldChange → ed.setSampleField`, updating the single lifted draft; the existing **topbar Save** persists in one PATCH. (`saveCommercial` already recomputes `bags_quantity_mt`/`equivalent_60kg_bags` from `bag_count`/`bag_weight_kg`.)
3. **Crop year = auto-generated, NO add-new.** Latest rolls every May: `S = (new Date().getMonth() >= 4) ? year : year-1` → `26/27` now; shows latest + previous 3; always includes the sample's stored value. In **May 2027** it auto-advances to `27/28` (date read at render — no deploy needed).
4. **Processing = picker WITH "+ add new".** New values persist by usage (saved on the sample → distinct endpoint reads them back). No vocab table.
5. **Scope:** attributes line **and** info-strip tiles get inline edit; the full panel **stays** behind an **"Edit all details"** button. Quantity tile edits `bag_count` + `bag_weight_kg` in a 2-field popover.
6. **No migration; no PATCH allowlist change** — all edited fields already accepted by `/api/samples/[id]`.
7. **No quality-lock gating on these editors.** `LOCK_SENSITIVE_FIELDS` is EMPTY (shipped earlier this session, `c4c31b1`): only grading + cupping freeze 7 days post-cert, enforced separately by `computeContentLock` on the quality-assessment / cupping-score routes. Do NOT add `disabled`/lock props to inline editors. See `[[master-cupper-edit-permissions]]` memory.
8. No emojis (lucide only; `·` middot and `—` em-dash allowed). Inter, existing palette, light + dark.

## Files created / modified by the plan

Done (Tasks 1–5): **New** `vocab-options.ts`(+test), `src/app/api/samples/vocabularies/route.ts`, `addable-select.tsx`(+test), `inline-edit.tsx`, `crop-year-field.tsx`, `processing-field.tsx` — all under `src/components/certificates/cert-editor/`.

Remaining:
- **Task 6** — **New** `src/components/certificates/cert-editor/use-sample-vocabularies.ts`; **Modify** `info-strip.tsx` (rewrite `AttributesLine` to inline-edit crop/processing/certs + add "Edit all details" button; add 3 imports) and `certificate-edit-overlay.tsx` (add `useSampleVocabularies(open)`; change the `<AttributesLine>` render props). Plan has the **complete** replacement code.
- **Task 7** — **Modify** `info-strip.tsx` (add `InlineTextEditor`/`BagTypeEditor`/`QuantityEditor` helpers; rewrite `InfoStripBand` so each tile is inline-editable) and `certificate-edit-overlay.tsx` (change the `<InfoStripBand>` render to `onFieldChange={ed.setSampleField}`). Plan has the complete code.

## Codebase anchors (verify line numbers — files drift)

- [`use-cert-editor.ts:478`](../../../src/components/certificates/cert-editor/use-cert-editor.ts) — the hook return exposes `setSampleField(field, value)` (the lifted-draft setter inline editors must call). Defined ~`:340`.
- [`certificate-edit-overlay.tsx:57`](../../../src/components/certificates/cert-editor/certificate-edit-overlay.tsx) — `const ed = useCertEditor(...)`; add `const { processingMethods } = useSampleVocabularies(open)` after it.
- `certificate-edit-overlay.tsx:9` — import line `import { InfoStripBand, AttributesLine, DetailsEditPanel } from './info-strip'`.
- `certificate-edit-overlay.tsx:174–175` — the `<InfoStripBand … onEdit={…}/>` and `<AttributesLine … onEdit={…}/>` renders (Task 6 changes line 175; Task 7 changes line 174). The render uses `draft.sample` and `sample`, both already in scope.
- `info-strip.tsx:31` — `InfoStripBand` (Task 7 rewrites). `:43` tiles array; `:47` Bag type; `:49–54` PSS vs non-PSS tiles. Module-level `BAG_TYPES` `:12`, `bagTypeLabel` `:25`.
- `info-strip.tsx:72` — `AttributesLine` (Task 6 rewrites). Currently `{ sample, draftSample, onEdit }`.
- `info-strip.tsx:9–10` — existing imports `PROCESSING_METHODS` and `CertificationsField` (reused; do not duplicate). `Select`/`Input` already imported.
- `src/components/portal/portal-top-nav.test.tsx` — the component-test pattern to mirror (`render`/`screen`/`fireEvent` from `@testing-library/react`; jsdom + `vitest.setup.ts`).

## Gotchas

- **WAQC is a SINGLE git repo.** Docs (`docs/superpowers/...`) and app code are committed together here. The generic handoff skill text about an outer `~/.git` two-repo split is for a *different* project — ignore it.
- **Test command is `npx vitest run`** (single: `npx vitest run <path>`); jsdom; config `src/**/*.{test,spec}.{ts,tsx}`. NOT `npx tsx --test`. Typecheck `npx tsc --noEmit`.
- **Stage only your own paths** (`git add <path>`), never `git add -A` — the working tree carries Daniel's unrelated changes (override route, override migration, 2 partner-portal handoffs). Each task's plan lists exact paths.
- **Daniel interleaves his own commits to `main` mid-run.** Capture real `HEAD` before each implementer dispatch; per-task review base = the *actual* immediately-preceding commit; the final review must be scoped to your commits/paths, not a contiguous range. (No interleave observed yet this feature, but watch for it.)
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **`InlineEdit` (Task 4) has no unit test by design** — Radix Popover is unreliable in jsdom. Its behavior is verified in the Task 6/7 manual smoke. Don't add a flaky jsdom popover test.
- **T6/T7 each change a component + its overlay render together** so every task compiles; intermediate states typecheck. After T6 the attributes line is inline but tiles still open the panel (T7 finishes them).
- **SDD ledger:** `.superpowers/sdd/progress.md` (git-ignored scratch) has the full per-task record for this feature (section header "Inline Attribute Editing + Addable Pickers — Progress Ledger"). Task briefs/reports/diffs are in `.superpowers/sdd/` (`task-N-brief.md`, `task-N-report.md`, `review-*.diff`). Helper scripts: `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.0.3/skills/subagent-driven-development/scripts/{task-brief,review-package}`.

## How to continue (SDD mechanics)

1. (Optional) Task 5 review: `review-package 85b3d81 c241a31` → dispatch a task reviewer (sonnet); or accept (trivial transcription).
2. Task 6: `task-brief docs/superpowers/plans/2026-06-26-inline-attribute-editing.md 6`; capture real HEAD as base; dispatch implementer (sonnet); review `BASE..HEAD`; record in ledger.
3. Task 7: same pattern.
4. Final whole-branch review on **opus**, scoped to your feature commits/paths (`9bc40f2..HEAD`, excluding any Daniel-interleaved commits). Dispatch ONE fix subagent if findings.
5. Run full `npx vitest run` + `npx tsc --noEmit`. Then give Daniel the smoke checklist and offer to push.

## Next / suggested next-up

1. **Finish Tasks 6 + 7 + final review** — the plan has complete code; highest value, everything else waits on it.
2. After parity + review, **manual UI smoke** (below), then offer to push `main` (one push lands the whole feature).
3. Deferred Minors carried from per-task reviews (non-blocking, for final-review triage): `AddableSelect` empty-string-option dup key (won't occur with these vocabularies); `AddableSelect`/`InlineEdit` className trailing-space; `vocabularies` `.single()`-style patterns (N/A here). None block merge.

## Things the user (Daniel) said that should shape future work

- *"why not edit from where the user is? instead of opening a center display modal? show a pencil on mouse over and edit where it's at?"* → the whole inline-edit driver.
- Crop year: *"no need to add new, just show a past crop, and automatically add new ones every may, for the year we are at … we are now in 2026, and july start new crop 26/27"* → decision #3 (May rollover, no add-new). Confirmed: *"when we reach may 2027, it auto adds 27/28? — yes."*
- Processing: *"+ add new in case there are new, that are saved and always shown later as a choice"* → decision #4 (persist by usage).
- Standing prefs: trunk-based, push only when Daniel says; he does the manual UI smoke; he applies migrations himself (N/A — no migration here). He interrupts/【rejects bash calls when he wants you to just write — don't re-run state-gathering if he's signalling to stop.

## Manual smoke test (after Tasks 6–7 build)

Open a sample on `/samples/qc` (e.g. a Dunkin SS) or `/certificates`:
1. **Attributes line:** hover shows pencils. Click **Crop** → popover with year picker, latest `26/27`, NO add-new. Click **Processing** → picker with canonical methods + any used-before values + **"+ add new"** (type a new one → it selects). Click **Certifications** → chips editor (pull-from-contract + custom).
2. **Strip tiles:** hover shows pencil; click a text tile (Wolthers ref, Container, ICO #, Exporter sample #, Seller ref) → inline input, commits on Enter/blur. **Bag type** → option list. **Quantity** → 2-field popover (count + weight); tile shows `count × weight kg`.
3. Edits update **live**; the topbar **Save** persists (one PATCH); reopen confirms.
4. **"Edit all details"** (right end of attributes line) opens the full panel (supply-chain parties table etc.).
5. Add a brand-new processing method on one sample, Save; open a DIFFERENT sample → the new method appears as a choice (vocab persisted by usage).
