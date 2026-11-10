# Handoff: UI corners, button placement and green primary (2026-11-10)

**Resume point:** Create a worktree on `origin/main`, copy in the spec, the five plan files and this handoff (all uncommitted in the stale main checkout, see "Repo state"), then **EXECUTE Part 1** of [the plan](../plans/2026-11-10-ui-corners-green.md) with **superpowers:subagent-driven-development** (Daniel's choice: a fresh implementer per task, a fresh reviewer after each). Go on through Parts 2, 3 and 4 in order, pushing to `main` at the end of each part. No app code is written yet.

## The work (one paragraph)

Daniel found the QC app's corners too round and its buttons scattered. The approved design keeps today's look (Inter, black/white tokens) but applies a strict corner scale by element type (containers 10px, controls 6px, badges 4px, data and page structure 0), eight button-placement rules, two control heights (36/28px), **green filled buttons** (`#15663f`), and **the page title as a green 18px last crumb in one shared header** after a "/", on every page including the client portal. Two behaviour changes ride along. (1) Quality Templates gets density limits in g/mL, merged with moisture and quakers into one "Moisture, density & quakers" page; density prints on the certificate with a note when outside the limits and **never rejects**. (2) On Certificates, "Send" opens a dropdown listing only the parties on the ticked certificates (company names, supply-chain order) instead of a full-screen party page.

## Repo state right now

- **Main checkout** `/Users/danielwolthers/Documents/GitHub/WAQC` is on the **stale branch `feat/certificate-print-list`, 54 commits behind `origin/main`** (`52dfa2fb` at the time of writing). It holds **other sessions' uncommitted work** (`src/lib/auth/new-profile.ts`, two `database/migrations/20261109*` files, the annual-report plans, the send-all-parties spec/plan, …). **Do not touch, commit, stash or check out over any of it.**
- **This job's files are uncommitted in that checkout:**
  - `docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md` (modified; amended and approved 2026-11-10). `origin/main`'s copy is the same base (`892e5933`), so copying it over is safe. Verify with `git diff --stat HEAD origin/main -- <spec>` showing nothing.
  - `docs/superpowers/plans/2026-11-10-ui-corners-green.md` (index) and `…-part-1-foundation.md`, `…-part-2-components.md`, `…-part-3-quality-templates.md`, `…-part-4-certificates.md` (new).
  - This handoff (new).
- **Upstream / pushed:** nothing from this job is pushed. Part 1 Task 1's commit includes the spec and plans; add this handoff to it.
- **Stashes:** not checked. Never `git stash` in the main checkout.

## What's done

Planning only:
- The spec is amended and approved ("go ahead", 2026-11-10).
- The plan is written: an index plus Parts 1–4 in full detail; Parts 5–12 are scoped in the index and get planned one at a time.
- **No app code written. Nothing verified yet.** Before Part 1, record the baseline in the worktree: `npx tsc --noEmit`, `npx vitest run` (pass and fail counts), `npx next build`. Report the before and after counts.

## How to run it

1. **Worktree:** superpowers:using-git-worktrees, for example `git worktree add ../WAQC-ui-green origin/main -b ui-green`. Commit there, then push with `git push origin HEAD:main` (trunk-based: Daniel commits straight to `main`, and Vercel deploys Production on every push). Rebase on `origin/main` before each push, because other sessions push too.
2. **Copy in the docs:** the spec, the five plan files and this handoff, from the main checkout paths above.
3. **Run** superpowers:subagent-driven-development over `docs/superpowers/plans/2026-11-10-ui-corners-green-part-1-foundation.md`. Give each implementer its task, the index's **Global Constraints** and **Review Focus**, and the spec section named in the task.
4. **End of each part:** `npx tsc --noEmit && npx vitest run && npx next build` clean → push → confirm the Vercel deploy → move to the next part. Parts 3 and 4 end with browser QA steps (written in each part's last task) and a note to Daniel about what to check live.
5. **After Part 4:** write the plan for Part 5 (QC samples, starting with splitting its 2,391-line page) against `main` with superpowers:writing-plans, in the same format. Do the same for Parts 6–12, one at a time.

## Locked decisions (do NOT relitigate)

1. **Corners:** 10/6/4/0 by element type, allowlist in spec §3.4. Rounds 1 (four other design systems) and 2 are settled.
2. **Green:** light `--primary: 151 66% 24%` (`#15663f`) with `--primary-foreground: 0 0% 98%`; dark `151 50% 55%` with `0 0% 9%`. Contrast was measured: every pair is at least 6.7:1. `--ring` stays neutral. Olive `#556b2f` is for charts only. Status greens are untouched.
3. **Title:** the last crumb in `PageHeader`, `text-primary` 18px/600, rendered as the `h1`. The page body never repeats it.
4. **Scope:** the whole spec, the portal included (Daniel's answer). The portal stays light-only through a `.portal-light` token pin, and `PageHeader` there is not sticky.
5. **Density:** g/mL with three decimals, keys `density_min` and `density_max` in `quality_templates.parameters` (JSON, **no migration**). **Print only, never rejects**: `compliance.ts` and the 5% tolerance rule never read density. All 289 stored readings are already g/mL (Daniel's count), so nothing is converted. Values of 2 or more in the limit fields show "Enter g/mL, e.g. 0.680".
6. **The switches on the physical page are display only:** no `*_enabled` keys. A row is on when any of its limits is `!= null` (0 counts as set). Switching a row off clears its keys.
7. **Send dropdown:**
   - It lists only the parties present, labelled "Seller · LDC Suisse" (first two companies, then "+N").
   - Display order is the supply chain: Seller › Importer › Roaster › Client. Emails still go out clients first.
   - Everything listed starts ticked, and the client cannot be unticked.
   - "Include already sent" stays.
   - After Send, the email walk-through opens on its first email.
   - "Exporter" in Daniel's words is the seller, not a fifth party. Dunkin' lots run Seller › Importer › Roaster › Dunkin' (the QC client, stored as party `buyer`).
8. **Data source for the dropdown:** a `view=parties` mode on the existing `GET /api/certificates/batch-send/queue`, backed by `summarizeParties` in `certificate-parties.ts`. No new route file.
9. **Planning amendments to the spec (already written into it):**
   - `MainLayout` keeps its `max-w-[1400px]` default until Part 12; migrated pages pass `fullWidth` and render `PageHeader` + `PageBody`.
   - Certificates (Part 4) goes before QC samples.
   - `spec-review.tsx` has nothing to move.
   - The PDF formatter's 1-decimal branch stays, because moisture uses it.
10. **Templates list:** a row click opens the view; Edit and Duplicate are labelled icon buttons; More holds View, Manage clients (moved there from the removed "Assigned to" column) and Deactivate.
11. **Already done on main:** the unreachable bulk email dialog on Certificates is gone. The single-certificate "Send Email" dialog in the preview stays.

## Files created / modified by the plan

The full lists are in each part's tasks. In outline:
- **Part 1:** `globals.css`, `tailwind.config.ts`, the `src/components/ui/*` primitives, `portal-shell.tsx`, about 30 files in the `primary` audit, `main-layout.tsx` (`PageBody`); new `src/app/design-tokens.test.ts`.
- **Part 2:** new `src/components/layout/page-header.tsx`, plus `src/components/ui/{commit-bar,selection-bar,row-actions,segmented,toggle-group,toggle}.tsx` with tests.
- **Part 3:** `spec-editor/*`, a new `sections/physical-section.tsx` (`moisture-section.tsx` and `quaker-section.tsx` deleted), `quality/templates/page.tsx`, a new `components/quality/template-list/template-row.tsx`, a new `src/lib/spec-range-note.ts`, `certificate-data.ts`, `quality-certificate.tsx`, `certificate-physical-properties.tsx`, and the grading density label.
- **Part 4:** `certificate-parties.ts`, `send-queue.ts`, `batch-send/queue/route.ts`, `party-choice.tsx`, a new `send-parties-popover.tsx`, `batch-approval-send-view.tsx`, `qc-client-step.tsx`, `certificates/page.tsx`, a new `certificate-row-actions.ts`, `cert-editor/{certificate-edit-overlay,ui-parts}.tsx`, and `samples/approval-send-view.tsx`.

## Codebase anchors (on `origin/main` at `52dfa2fb`; re-find before editing)

- `src/app/globals.css:16,29,40,77`: light `--primary`, `--radius: 20px`, dark `--primary`, the unused `.lab-card`.
- `tailwind.config.ts:55`: `borderRadius` mapping.
- `src/components/ui/button.tsx`: sizes `h-10` / `h-9` / `h-11` / `h-10`; the only `size="lg"` uses are `samples/intake/success-view.tsx:59,63`.
- `src/components/layout/main-layout.tsx`: the `max-w-[1400px]` wrapper near the `fullWidth` branch; the test is `main-layout.test.tsx`.
- `src/components/quality/spec-editor/spec-editor-body.tsx`: `SectionId` ~:62, `NAV_GROUPS` ~:69, `SECTION_HEADINGS` ~:91, the body `<h2>` and `<p>` ~:335–339, the `BasicInformation` card ~:381.
- `src/components/quality/spec-editor/quality-spec-editor.tsx:46–80`: the hand-built top bar and the hard-coded `#15663f` Active label.
- `src/app/quality/templates/page.tsx:357–575`: header, toolbar and the table with the "Assigned to" column.
- `src/lib/certificate-data.ts:138` (`QualitySpecLimits`) and `:723` (where `moisture_min` is read from `parameters`).
- `src/components/pdf/certificate/quality-certificate.tsx:205–215` and `certificate-physical-properties.tsx:95,157–162,187` (formatter, moisture note, density `unit="g/L"`).
- `src/app/grading/page.tsx:123,1567`: the density comment and the "Density (G/L)" label.
- `src/lib/compliance.characterization.test.ts`: `fakeSupabase`, `emptyTemplate` and `specRow` helpers for the density test.
- `src/lib/approval-notification/certificate-parties.ts`: `resolveCertificateParties`, `certificatePartyCompanies`, `PARTY_SEND_GO_LIVE`.
- `src/lib/approval-notification/send-queue.ts:122–200`: `loadSendQueue`; `partiesByKey` and `companyNameById` are ready around :200.
- `src/app/api/certificates/batch-send/queue/route.ts`: `GET`, staff-gated, with a `view=clients` precedent.
- `src/components/certificates/party-choice.tsx`: `PartyChoice` (also used by `qc-client-step.tsx`) and `PartyStep` (to delete).
- `src/components/certificates/batch-approval-send-view.tsx:16,95–145,294`: props, the open effect, `continueWithParties`, the `PartyStep` branch.
- `src/app/certificates/page.tsx:286–287` (`headerHeight` measuring), `:746` (`MainLayout fullWidth` + hand-built sticky header), `:891–928` (the "Actions (N)" dropdown with Send), `:1200–1245` (row icons incl. the unlabelled `RefreshCw` Override).

## Gotchas

- **Two different repos are called "WAQC".** This one (`Documents/GitHub/WAQC`) is QC. The generic `handoff` skill's repo facts describe Wolthers-system (`wolthers-app`) and do not apply here. Here, docs, code and `database/migrations/` all live in the WAQC repo.
- **Co-edited tree:** stage explicit paths only, never `git add -A` in the main checkout. The plan's commit lines use folder paths, which is fine inside the worktree.
- **Route files export only HTTP handlers.** `next build` rejects helper exports, and pushed is not the same as live. `summarizeParties` therefore lives in `src/lib/`.
- **`.in()` URI limit (~24KB):** the Send popover passes up to 300 sample ids (the print-list cap), about 11KB, so it fits. Don't raise the cap without chunking.
- **Never render `samples.tracking_number` (SAN-…)** anywhere a person sees it. Use the certificate number or contract refs.
- **Company names** go through `companyDisplayName()` (fantasy names first).
- **File size:** stay under ~2,000 lines. `certificates/page.tsx` is about 1,479 lines; extract helpers into `src/components/certificates/` rather than grow it. QC samples (2,391) gets split in Part 5 before anything else.
- **react-pdf tests** run slowly (`testTimeout` 60s). The PDF page-fit tests live in `src/components/pdf/certificate/`; run them after Part 3 Task 2.
- **zsh:** `echo ====` errors (`=` expansion). Quote such strings in shell commands.
- **No real emails during QA.** In the Send walk-through, use Skip.

## Next / suggested next-up

1. Parts 1 → 2 → 3 → 4, as above.
2. Plan and build Parts 5–12 (scopes in the plan index): QC samples (split first), grading, cupping, CVA, remaining pages and dialogs, portal, intake, then the sweep with the radius and height guard test plus the `CLAUDE.md` and vault doc updates.
3. **Separate, later session (not this programme):** "Buyer final approval". Wolthers analyses, and the buyer approves or rejects in the client portal, hybrid per contract based on the logistics allocation text. The advice already given: a structured "Final approval: Wolthers / Buyer" field on the allocation, a mode named "Buyer approval", and a status "Awaiting buyer decision". **Still unanswered by Daniel:** who hears a buyer's rejection first, the seller or Wolthers.
4. Spec §9 item 2 is still open and out of scope: the two certificate editors (the older `cupping/certificate-edit-dialog.tsx` against the `cert-editor` overlay).

## Things the user said that should shape future work

- "ensure we have this new template of green buttons, and green title on the top header followed by a / … everywhere on the qc.system."
- On the templates list: "too busy … We don't need a huge title followed by a search bar, this can be tighter and cleaner. Move the tables to the side, removing the containers."
- Density: "merge it together with humidity and quaker check … we don't really need a page for each." Unit g/mL; "Print only, never rejects."
- Send: "instead of sending to a new page … show a dropdown with the selectors. It should check the parties involved … if there's only the seller and buyer, show only seller and buyer." Exporter = seller; Dunkin' runs "Seller > Importer > Roaster > Dunkin".
- Standing rules: he applies all SQL himself (paste it; this programme needs none); files under ~2,000 lines; no emojis in the UI; no mock data; commit straight to `main`; mockups must use the app's real tokens; brainstorm in text, no visual companion.
- Reference mockup (approved): https://claude.ai/artifact/RVGz8G64bCwMne9gbhQXwG. Earlier corner mockup: https://claude.ai/artifact/MrWxhswhCsHSUZjk6tcY5B.

## Manual smoke test (after each part ships)

- **Part 1:** `/samples/qc`, `/certificates`, `/grading`, `/cupping`, `/quality/templates` in light and dark. Check 10px cards, 6px buttons, green filled buttons and switches, and a dialog footer that stays on a muted bar while the dialog scrolls. Open `/portal` with the OS in dark mode: the green is still dark on white.
- **Part 3:** create a template with density 0.650–0.720; reopen it (the row is on, the nav summary reads "… · 0.650–0.720 g/mL · …"); grade a lot at 0.640 (not rejected); preview the certificate ("0.640 g/mL (min 0.650)").
- **Part 4:** an Ahold-only selection gives two rows; a Dunkin' selection gives four, in chain order; unticking Roaster leaves no roaster email in the walk-through; changing the selection and reopening refetches; the selection bar stays docked when scrolled.
