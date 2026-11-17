# Handoff — Sensory notes + regional profiles (2026-11-13)

**Resume point:** EXECUTE all 12 tasks of [`../plans/2026-11-13-sensory-notes-regional-profiles.md`](../plans/2026-11-13-sensory-notes-regional-profiles.md) with **superpowers:subagent-driven-development**. A fresh implementer works each task, then a fresh reviewer checks it before the next task starts, and a whole-branch review runs at the end. Work in the worktree `/Users/danielwolthers/Documents/GitHub/WAQC-sensory` (branch `feat/sensory-profiles`). No app code is written yet.

## The work (one paragraph)

Commodity client qualities get two optional toggles. Both are off by default and both are set per client quality:
- **Sensory notes:** cuppers pick notes on the SCA flavor wheel.
- **Regional profile:** a shared, staff-managed list (Mogiana, Cerrado Mineiro, Sul de Minas, Matas de Minas…). Each profile is pre-loaded with typical notes.

Every cupper picks notes and answers "Matches profile: Yes / No" on their own digital cupping card. The validator sees the panel side by side:
- notes picked by at least half the cuppers who gave notes come pre-ticked;
- the profile answer starts at the majority;
- the validator adjusts both;
- the result is frozen, and the profile itself is snapshotted at that moment.

The certificate prints a ~90 pt flavor wheel in the cupping block's right column, a "Notes:" line, and "Regional profile: Cerrado Mineiro — Matches / Does not match". A "No" is information only and never touches approval. Clients can flip the same toggles on the portal's Qualities tab.

## Repo state right now

- **Worktree:** `/Users/danielwolthers/Documents/GitHub/WAQC-sensory`, branch `feat/sensory-profiles`, cut from `origin/main` a085bb6f (portal qualities + spec versions are already on main). Working tree is clean.
- **Upstream:** NO UPSTREAM. One local commit, `d6631548`, holds the spec, the plan and this handoff once committed. Nothing is pushed.
- **Main checkout** (`/Users/danielwolthers/Documents/GitHub/WAQC`): sits on the stale `feat/certificate-print-list` with lots of uncommitted, unrelated files. **Do not build there and do not touch its files.**
- **Stashes:** none created by this work.

## What's done

| SHA | What |
|---|---|
| `d6631548` | `docs(sensory): design and implementation plan` — spec [`../specs/2026-11-13-sensory-notes-regional-profiles-design.md`](../specs/2026-11-13-sensory-notes-regional-profiles-design.md) + plan |

- **Design:** approved by Daniel ("start building").
- **Builder check:** a fresh reviewer read the design. Its 4 questions are answered in the spec.
- **Code:** none written. No tests run yet. Plan Task 7 Step 1 takes the baseline.

## Locked decisions (do NOT relitigate)

1. **Every cupper picks on their own card, and the panel is merged at validation** (approach B). Daniel rejected "master cupper records once" and "pre-ticked region notes, Yes/No inferred".
2. **Paper cupping cards give no notes.** Notes are a digital step only ("they dont"). The scan/OCR flow is untouched.
3. **Certificate placement is option 1:** the full SCA wheel, ~90 pt, top-right of the commodity cupping block's right column, with the notes and profile lines under it. No new band and no simplified 9-family ring.
4. **The toggles live on each client's quality (its private copy) and are OFF by default.** Base edits never reach copies (c418cb91). A new copy made without edits starts with both off.
5. **A profile is always picked by hand.** Nothing suggests or assigns one from the quality's name or region: "even if a quality has the name cerrado on it, we may not use it."
6. **Clients may toggle sensory notes and pick a profile on the portal**, as staff can. Clients cannot create or edit profiles.
7. **A "No" never affects approval,** compliance, approved-with-comments or the sys write-back. "Does not match" prints in charcoal, not red.
8. **The frozen result goes in `quality_assessments.sensory_resolution`**, NOT inside `score_resolution`. Lots validated before 2026-09-10 have no score resolution, and a certificate-editor correction would otherwise have to fabricate one.
9. **Per-cupper picks go in `cupping_scores.sensory`**, never in `cupping_scores.scores`. Anything in `scores` becomes attribute rails; this already happened once with the CVA payload.
10. **Parameter shape:**
    - `sensory_notes_enabled: boolean`
    - `regional_profile: { id, name } | null`. The name rides along so the portal's change emails read the profile name, not an id.
11. **Caps:** a profile holds 6 notes, a cupper picks up to 5, and the frozen result holds up to 6.
12. **Merge rule:** the pre-tick threshold is `ceil(contributors / 2)`, where contributors are included cuppers with at least one pick.
    - The answer majority counts only answers given for the lot's current profile id.
    - A tie, or no answers at all, starts unanswered.
    - When the quality has a profile, the validator MUST answer before finalizing.
    - Excluding a cupper also excludes their notes and answer.
    - When the validator takes one cupper's card (`mode: 'cupper'`), notes and answer start from that card.
13. **Staff may correct notes and the answer later in the certificate editor**, including on lots validated before this ships. The edit is stamped `source: 'certificate_editor'`.
14. **Specialty (CVA) qualities get none of this.** They already have their own wheel.

## Files created / modified by the plan

The plan has the exact list per task. The blast radius:

- **New `src/lib/sensory/`** — the rules library: settings, picks, merge, resolution, and `load-config.ts`.
- **New `src/components/sensory/sensory-wheel-dialog.tsx`** — the shared picker, built on the CVA `FlavorWheel`.
- **New regional profiles screens:**
  - `src/components/quality/regional-profiles/` — the tab and the editor dialog.
  - `src/app/api/regional-profiles/` — staff API.
  - `src/app/api/portal/regional-profiles/route.ts` — portal read.
- **New per-sample route `src/app/api/samples/[id]/sensory-config/route.ts`.**
- **New cupping components:**
  - `src/components/cupping/commodity/` — the spider chart and defects panel split out of the page, plus `sensory-card-row.tsx`.
  - `src/components/cupping/validation/sensory-resolution-section.tsx`.
- **New `database/migrations/20261113000000_sensory_notes_regional_profiles.sql`.**
- **Modify** the spec editor body, `private-copy.ts`, `spec-diff.ts`, the portal qualities section list and its view, the cupping page, the bulk-data, cupping-score, aggregate and finalize routes, the validation modal, the cert-editor cupping quadrant and its hook, the quality-assessment route, `certificate-data.ts`, `certificate-cupping-chart.tsx`, `quality-certificate.tsx`, and the page-fit test plus a new fixture.

## Codebase anchors (in the worktree, verified 2026-11-13)

- [spec-editor-body.tsx:60](../../../src/components/quality/spec-editor/spec-editor-body.tsx#L60) `SectionId` · `:69` `NAV_GROUPS` (Sensory group) · `:326` render switch on `active`.
- [private-copy.ts:78](../../../src/lib/quality-spec/private-copy.ts#L78) — `edits.parameters ?? tpl.parameters`. Strip the sensory keys here when there are no edits.
- [spec-diff.ts:17](../../../src/lib/quality-spec/spec-diff.ts#L17) — `SECTION_OF_KEY`.
- [portal-qualities.ts:8](../../../src/lib/portal/portal-qualities.ts#L8) — `CLIENT_SECTIONS`. Its view is `src/components/portal/qualities/spec-sections-view.tsx`, a switch on the section id taking `(params, patch)`.
- [cupping/page.tsx](../../../src/app/cupping/page.tsx) (2,176 lines):
  - `:769` `handleSaveCurrent` posts to `/api/samples/[id]/cupping-score`;
  - `:1624` the spider chart block, extracted in Task 7;
  - `:1754` the defects block, extracted in Task 7;
  - `:1974` Cupping Comments; the sensory row goes just above it.
- [bulk-data/route.ts:54](../../../src/app/api/cupping/my-samples/bulk-data/route.ts#L54) — `cupping_scores` select; add `sensory`.
- [cupping-validation-modal.tsx:555](../../../src/components/cupping/cupping-validation-modal.tsx#L555) — the finalize body (also carries `final_flavor_descriptor` and `resolved_defects`). `IndividualScore` is at ~`:66`.
- [finalize/route.ts:242](../../../src/app/api/cupping/finalize/route.ts#L242) `buildScoreResolution` · `:292` the pre-gate write. `sensory_resolution` joins that same write.
- [quality-assessment/route.ts:77](../../../src/app/api/samples/[id]/quality-assessment/route.ts#L77) — the `resolved_defects` staff-gated edit. Mirror it for `sensory_resolution`.
- [certificate-data.ts:835](../../../src/lib/certificate-data.ts#L835) `processCuppingScores` call · `:1796` the commodity return (`cvaDescriptors: null`). `qualityAssessment` is selected with `*` at `:428` (by `labId`, the lab unit).
- [certificate-cupping-chart.tsx:579](../../../src/components/pdf/certificate/certificate-cupping-chart.tsx#L579) — the right column. `:698` is the commodity taints/faults row.
- `src/components/pdf/certificate/certificate-flavor-wheel.tsx` — `CertificateFlavorWheel({ paths, size = 150 })`. Pass `size={90}`.
- `src/components/cupping/cva/wheel/FlavorWheel.tsx:92` — the props: `picks`, `onToggle`, `active`, `refusals`, `chrome`. It needs a `.cva-root` ancestor for its CSS tokens.
- `src/lib/cva/flavor-wheel-data.ts` — `NODES` (110-node taxonomy), `pickKey`. Paths are `string[]` of length 1–3.
- `src/lib/quality-spec/resolve.ts` — `resolveSampleSpec(s)`. Every lot-spec read goes through it (`no-live-spec-reads.test.ts` guards this).
- `src/lib/portal/qc-portal-gate.ts` — `requireQcPortal(request, { view: 'qc_specs' })` gives `gate.ctx.admin` (service role).

## Gotchas

- **Tests:** `npm run test:run` runs the full Vitest suite; `npm test` is watch mode. Typecheck with `npx tsc --noEmit`, lint with `npm run lint`.
- **Pre-existing failures:** the suite has pre-existing unhandled rejections (~18). Take the baseline in Task 7 Step 1 and compare against it.
- **Local `next build` fails offline.** Google Fonts can't be fetched, which is environmental. Vercel builds fine.
- **Route files export only HTTP handlers.** `next build` rejects helper exports, so put helpers in `src/lib/`. Next 15 route params are `Promise<{ id: string }>`; await them.
- **SQL is pasted for Daniel and he applies it.** Ship order: paste the SQL → Daniel applies and verifies → push to `main`. Code must fail soft until then (42P01 / 42703 → no sensory UI, empty profile list).
- **The Supabase SQL editor appends `ENABLE RLS`.** That breaks `SELECT … INTO` / CREATE-in-DO. Use plain statements in `BEGIN; … COMMIT;`.
- **RLS helper:** use `(SELECT public.waqc_is_staff())`, as `20261111000001_client_quality_versions.sql` does.
- **Anonymised panel:** the aggregate route nulls other cuppers' `cupper_id` for non-admins. Key everything in the modal by `score_id`.
- **`labId`:** contract siblings share one lab unit. `quality_assessments` rows are read by `labId`, so every sibling certificate prints the same sensory result. That is intended.
- **SAN numbers:** never render `samples.tracking_number` (SAN-…) anywhere, including toasts and file names.
- **No emojis in UI, and no mock or seeded profiles.**
- **File-size ceiling ~2,000 lines** (2,200 hard). The cupping page is split first (Task 7). Keep the validation modal under ~1,800 by putting the sensory UI in its own file.
- **Subagent empty-commit trap:** when executing with subagents, check each task's commit actually contains the files (`git show --stat`) before marking it done.
- **Trunk-based:** Daniel ships straight to `main`, and Vercel auto-deploys Production. Do NOT push until the SQL is confirmed applied.

## Shelved / explicitly NOT doing

- Notes on paper cards / OCR.
- A separate commodity vocabulary. The SCA 110-note wheel is used as is.
- Showing sensory data on portal screens beyond the certificate PDF, the public QR certificate page, period/annual reports or analytics. These are later pieces.
- The iPad app.
- A profile chip on the templates list. Builder's call, low value.

## Next / suggested next-up

1. Run the 12 tasks with subagent-driven development. Task 1 (SQL) and Task 2 (rules library) unblock everything; Task 7 (page split) is a pure refactor and can run any time before Task 8.
2. Final message: paste the full SQL plus the verification SELECTs, and list the browser check below.
3. After Daniel applies the SQL and confirms: merge `feat/sensory-profiles` into `main` and push.

## Things the user said that should shape future work

- "an optional addition for all qualities" — sensory notes from "our cupper's sensorial notes based on the coffee flavor wheel", plus a small wheel on the certificate.
- Regional profiles: "pre-load some profile notes / checks on like Mogiana, Cerrado, sul de minas, matas de minas… so they would appear on the QC reports and then it would just be a Yes to profile, no to Profile from the QC team".
- "we will set them as options (toggles) on each quality template, of each client - normally set to off, but we can go and toggle them. even if a quality has the name cerrado on it, we may not use it."
- "they can add it on portal, staff too" — read as: clients toggle on the portal as well as staff.
- Daniel always applies SQL himself and wants it pasted in full.

## Manual smoke test (after SQL applied + deploy)

1. **Create a profile.** Quality Templates → Regional profiles → New profile "Cerrado Mineiro": region Cerrado Mineiro, notes Chocolate, Hazelnut, Brown Sugar, description "low acidity, full body".
2. **Switch it on for one client quality.** Open that client's quality → "Sensory notes & regional profile" → turn on Sensory notes and pick Cerrado Mineiro → Save.
3. **Cup it with two cuppers.**
   - Cupper A picks Chocolate + Hazelnut and answers Yes.
   - Cupper B picks Chocolate and answers No.
4. **Check the validation pre-fill.**
   - Chocolate and Hazelnut are both pre-ticked: with 2 contributors the threshold is 1.
   - The profile answer is unanswered (a tie).
   - Finalize is blocked until Yes or No is chosen. Choose Yes and finalize.
5. **Check the certificate.**
   - A ~90 pt wheel sits top-right of the cupping block.
   - "Notes: Chocolate, Hazelnut".
   - "Regional profile: Cerrado Mineiro — Matches".
   - Still one page; approval is unchanged.
6. **Check old certificates don't move.** Edit the profile's notes, reopen the certificate: it still shows the notes as they were at validation.
7. **Check the portal.** As a client, open Qualities → the quality → the Sensory section, turn notes off "from a date", and check the change email reads the section by name.
