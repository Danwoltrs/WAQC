# Handoff — QC Cert Contacts: Pick an Existing Contact (2026-06-29)

**Resume point:** EXECUTE the 7-task plan [`../plans/2026-06-29-qc-cert-pick-existing-contact.md`](../plans/2026-06-29-qc-cert-pick-existing-contact.md) via **`superpowers:subagent-driven-development`**, on a **fresh branch off `origin/main`** (NOT local `main`). Plan + spec are committed and approved; **no app code written yet.** First action = the branch setup in "Repo state" below, then dispatch the Task 1 implementer.

## The work (one paragraph)

A Phase-2 follow-up to QC certificate contacts (Phase 2 itself is LIVE in prod). Today the recipient capture flow — the inline `RecipientCaptureForm` in both send composers, and the Phase-1 Contacts tab's "Add" form — only lets a sender **free-type an email**. This feature lets the sender **pick an existing contact** for the company instead (everyone sys has on file for that company with an email, minus those already QC-cert-tagged and minus internal `@wolthers.com` addresses), while keeping a free-type/"add new" path. Picking + "save for future" tags them via the existing Phase-1 upsert; picking ephemerally (capture form only) uses them for this send. Reuses the existing `SearchableSelect` creatable combobox and the existing `POST /api/companies/[id]/qc-contacts` write path — **one new read endpoint, no new write path, no migration.**

## Repo state right now

- **Single repo** `/Users/danielwolthers/Documents/GitHub/WAQC`. WAQC is ONE git repo — `docs/` and app code commit together; `origin` = GitHub `Danwoltrs/WAQC` → Vercel prod on `main`. (Ignore the handoff skill's two-repo / `~/.git` / `tsx --test` assumptions — those are for the *other* Wolthers-system repo.)
- **`origin/main` tip = `a11dccc`** — the live, clean state: Phase 1 + Phase 2 (send-flow capture), none of Daniel's embed WIP. **This is the branch base.**
- **Local `main` = `b7d5700`, DIVERGED from origin** (origin 6 ahead, local 14 ahead). Local main carries Daniel's own unpushed embed/cert-editor/writeback WIP (`aa46520`, `ff2c841`, `429b6ff`, `62a086c`, …) INTERLEAVED with the original (pre-cherry-pick) Phase 2 commits. **Do not build on local main** — its embed divergence is Daniel's to reconcile separately; building here would force another cherry-pick to ship.
- **Spec + plan are committed on local `main`:** spec `5beda8c`, plan `b7d5700`. They are NOT on `origin/main`. Because you'll branch off `origin/main`, you must pull both doc files onto the new branch (commands below).
- **Working tree (all pre-existing, NOT this feature — leave alone):** `M src/app/api/certificates/[id]/override/route.ts` (Daniel's WIP); untracked `database/migrations/20260624000000_*.sql` and several `docs/superpowers/handoffs/*.md` + `plans/2026-06-26-*.md`. These carry across `git checkout -b` harmlessly. Stage only your own paths; never `git add -A`.
- **Stashes:** none.

### Branch setup (do this FIRST, before any task)

```bash
git fetch origin
git checkout -b feat/qc-pick-existing origin/main        # base = a11dccc (clean Phase 1+2)
# bring the approved spec + plan onto this branch (they're committed on local main only):
git checkout main -- \
  docs/superpowers/specs/2026-06-29-qc-cert-pick-existing-contact-design.md \
  docs/superpowers/plans/2026-06-29-qc-cert-pick-existing-contact.md
git commit -m "docs: spec + plan for pick-existing-contact" \
  docs/superpowers/specs/2026-06-29-qc-cert-pick-existing-contact-design.md \
  docs/superpowers/plans/2026-06-29-qc-cert-pick-existing-contact.md
```

Record the post-setup HEAD as your per-task review BASE. Then verify baseline: `npx tsc --noEmit` (expect the SAME single pre-existing error as origin — see Gotchas) and note it before starting.

## What's done

| SHA | What | Where |
|---|---|---|
| `5beda8c` | spec: pick-an-existing-contact design | local `main` only |
| `b7d5700` | plan: 7-task implementation plan | local `main` only |

**No app code written yet.** Brainstorming + spec + plan are complete and **user-approved** (Daniel approved the spec and the plan shape; he explicitly added "remember the nickname field too").

## Locked decisions (do NOT relitigate)

1. **Pool = all the company's other contacts** with an email, EXCLUDING already-`qc_certificates`-tagged (already recipients) AND internal `@wolthers.com` (house-CC). No grouping/sectioning.
2. **Approach A — creatable combobox**, reusing `SearchableSelect` (`src/components/ui/searchable-select.tsx`) UNCHANGED, with `allowCreate` + `substringMatch`. Do not fork it.
3. **Both surfaces:** the send-flow capture form (batch + single composers) AND the Phase-1 Contacts tab.
4. **Reuse the existing write path** — tagging always goes through `POST /api/companies/[id]/qc-contacts` → `upsertQcRecipient` (set-unions the tag, blank-fill-only). NO new write route, NO migration.
5. **Capture form: pick respects the save-for-future checkbox** (pick + unchecked = ephemeral this-send-only; pick + checked = tag). **Tab: pick ALWAYS tags** (no ephemeral concept there).
6. **Nickname carried through** (Daniel's explicit ask): the new list endpoint returns `nickname`; the capture form's "add new" person path gains an optional nickname field; a picked contact's nickname flows to the POST. The upsert's blank-fill-only never clobbers an existing nickname.
7. **Staff-gated** (`isStaffSampleManager` → 403) on the new read route, like every WAQC contacts route.

## The plan's 7 tasks (detail in the plan file)

1. Pure `src/lib/qc-contacts/pickable.ts` — `toPickableContacts(rows)` filter/map (+ test).
2. `GET /api/companies/[id]/contacts/route.ts` — staff-gated, thin over Task 1 (tsc-verified; no route unit test, matches codebase).
3. `src/lib/qc-contacts/use-pickable-contacts.ts` — pure `toContactOptions` + `usePickableContacts` hook (+ test of the mapper).
4. `vitest.setup.ts` — jsdom pointer/resize polyfills so the cmdk/Radix combobox is drivable in tests (+ full-suite still green).
5. Rewrite `src/components/samples/approval/recipient-capture.tsx` — pick/new modes, nickname; update its test file (existing free-type assertions reach inputs via "Add a new email instead"; new pick test).
6. `src/components/clients/qc-contacts-tab.tsx` — "Add" opens the combobox; pick tags+reloads, "+ add new" opens the existing Draft editor; update its test file.
7. Full-suite verification + final whole-branch review.

## Codebase anchors (verify line numbers — files drift)

- [`src/components/ui/searchable-select.tsx`](../../../src/components/ui/searchable-select.tsx) — the reused combobox. Props: `options/value/onValueChange/substringMatch/allowCreate/onCreateNew/createLabel/placeholder/searchPlaceholder/emptyMessage`. Note it uses `CommandItem value={option.label}` (label is the cmdk match key) — so the plan makes `label = "{name} — {email}"` to keep matches unique; `keywords=[email,nickname]`.
- [`src/components/samples/approval/recipient-capture.tsx`](../../../src/components/samples/approval/recipient-capture.tsx) — current capture form (Task 5 rewrites it; full replacement code is in the plan).
- [`src/components/clients/qc-contacts-tab.tsx`](../../../src/components/clients/qc-contacts-tab.tsx) — current tab; `startAdd` opens an empty Draft editor (Task 6 routes "Add" through the combobox first; the editor stays for "+ add new").
- [`src/app/api/companies/[id]/qc-contacts/route.ts`](../../../src/app/api/companies/[id]/qc-contacts/route.ts) — sibling route; copy its `adminClient()` + `isStaffSampleManager` gate pattern for the new `/contacts` route. POST already accepts `{ email, name, nickname, isGroup, ... }` — no write change needed.
- [`src/lib/qc-contacts/upsert.ts`](../../../src/lib/qc-contacts/upsert.ts) — `upsertQcRecipient` (the reused write). [`src/lib/qc-contacts/tags.ts`](../../../src/lib/qc-contacts/tags.ts) — `hasQcCertTag`, `isInternalEmail`, `QC_CERTIFICATES_PURPOSE` (Task 1 imports these).
- `vitest.setup.ts` — currently just the jest-dom import; Task 4 adds the polyfills.

## Gotchas

- **WAQC = single repo.** Tests: `npx vitest run <path>`. Types: `npx tsc --noEmit`. NOT `tsx --test`.
- **Pre-existing tsc error on `origin/main`:** `src/lib/embed/quadrant-aggregate.test.ts:71` — `Object is possibly 'null'` (TS2531), from Daniel's embed work in the `a11dccc` base. It's a `.test.ts`, EXCLUDED from `next build`, so prod is fine. Your branch inherits it. **Baseline `tsc` is "1 pre-existing embed-test error, 0 in feature files"** — don't chase it, just confirm you add none.
- **Combobox-in-jsdom risk (the plan's one real risk):** nothing in the suite currently drives cmdk/Radix Popover. Task 4's polyfills (`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView`/`ResizeObserver`) should make it work, but if a pick-path test (Task 5/6) still can't open/select in the popover, the plan says **report BLOCKED — do NOT delete the assertion.** Fall back to covering the pick path via the pure `toContactOptions`/`byId` seam (the branching that matters — what gets POSTed — is already covered by the free-type tests + pure helper tests).
- **Set-union tag invariant is sacred:** tagging only via `POST qc-contacts` → `upsertQcRecipient`; never write `routing_purposes` directly; never clobber name/nickname/other tags.
- **Co-edited working tree:** `override/route.ts` (Daniel's) + untracked migration/handoff/plan docs. `git status` first; stage only your task's paths; never `git add -A`.
- **Migrations:** none for this feature. (If that ever changed, Daniel applies SQL himself — paste, don't run. WAQC migrations live in `database/migrations/`.)
- Keep files under ~2000 lines.

## Shipping when done (after Task 7 + final review)

Branch `feat/qc-pick-existing` is off `origin/main`, so its feature commits cherry-pick cleanly / fast-forward onto `origin/main` (no embed overlap). Push to `main` is **Daniel's call** — he does his own in-app visual QA first (and his diverged local embed work is still unreconciled). Do NOT force-push or auto-push. Surface: tests + tsc green, the visual-QA checklist (Task 7 Step 3), and ask before pushing.

## Things Daniel said that shape this

- "looks good, **remember the nickname field too**" — baked into Locked decision 6.
- Chose pool = **all** other contacts (not just tagged-for-some-purpose), placement = **both** surfaces, UX = **A (creatable combobox)**.
- Trunk-based, sole dev: `main` = prod; he does his own visual QA; push only finished+verified work and only with his go-ahead.
- Phase 2 was shipped via cherry-pick (ship-only-qc-contacts) BECAUSE local main's embed work diverged from origin — same situation persists; that's why this feature builds off `origin/main`.

## Owed from earlier (carry forward, on Daniel — not blockers for this feature)

- Reconcile his diverged local embed work (`local main b7d5700` ≠ `origin a11dccc`); fix the `quadrant-aggregate.test.ts:71` tsc error.
- In-app visual QA of shipped Phase 2 (both composers, no-recipient company, group/person, save-for-future persists, ephemeral doesn't) and the Phase-1 Contacts tab.
