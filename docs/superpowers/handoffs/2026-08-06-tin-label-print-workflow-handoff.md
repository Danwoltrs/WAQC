# Handoff — Tin label print workflow (2026-08-06)

**Resume point:** EXECUTE Tasks 1–6 in [`../plans/2026-08-06-tin-label-print-workflow.md`](../plans/2026-08-06-tin-label-print-workflow.md) using `superpowers:subagent-driven-development`. **No app code written yet** — the plan is committed but unexecuted. The migration it depends on has been applied to the DB by Daniel; verify before trusting Tasks 4–6.

## The work

The tin sleeve label was rebuilt end to end and shipped to production earlier today (see *What's done*). Daniel reviewed the first real output and asked for four follow-ups: dashed cut guides that span the full sheet so the guillotine has an edge-to-edge register; a print-preview modal instead of downloading a PDF; a one-click "print today's unprinted" batch so labels can be printed in waves through the day; and company names shown as *nome fantasia* rather than legal names. This handoff covers that follow-up plan, which is fully specced and planned but not built.

A fifth item Daniel raised — "the QR works but the page still shows the old design" — is **not a bug**. That page is Part 2 of the earlier spec and remains unbuilt. See *Shelved*.

## Repo state right now

- **Repo (`WAQC/` — one repo; code, docs and `database/migrations/` all live here):** branch `main`.
- **Upstream:** `origin/main` exists.
- **Pushed vs local:** everything through `de912b5` is on `origin/main`. **Three local-only commits**, all docs, nothing at risk of breaking a build:
  - `29a1e8a` the implementation plan
  - `d2c62d8` spec Part E (trade names)
  - `013ed5b` the spec itself
  Verify with `git log --oneline @{u}..HEAD`.
- **Working tree is dirty with other sessions' work** — 4 modified files (`certificates/[id]/override/route.ts`, `cupping/page.tsx`, `scan-cupping-cards-dialog.tsx`, `dashboard-scan-dialog.tsx`) plus untracked handoffs and `database/migrations/20260624000000_allow_override_terminal_transitions.sql`. **None of it is this work.** Leave it alone.
- **Stashes:** none.
- **Concurrent sessions were active today** and pushed to `main` mid-execution (`a71bff9`, `3ad57bc`, `de912b5`). Expect the same; re-check `origin/main` before assuming your HEAD is current.

## What's done

**Part 1 — the label rebuild. Live in production**, deployed via Vercel on `main`.

| SHA | What |
|---|---|
| `193a527` | `feat(labels)` pure field resolvers — `src/lib/sleeve-label-data.ts` + 26 tests |
| `d978c53` | `fix(labels)` laboratory-local dates (São Paulo), not UTC |
| `47a24cd` | `refactor(qr)` `getCertificatePageUrl` takes a certificate number |
| `2c426b7` | `feat(labels)` flowing-lines label — `src/components/pdf/tin-sleeve-label.tsx` |
| `329a30a` | `fix(labels)` split line styles to keep party/cert `maxLines` apart |
| `8759c5c` | `feat(labels)` bulk route prints from certificate data + certification gate |
| `4bfc079` | `fix(labels)` fail loudly when the certificates fetch errors |
| `72d6756` | `feat(labels)` single-sample route matches the bulk route |
| `5128252` | `feat(labels)` gate the Tin Label action on certification |
| `4ab9fe5` | `fix(certificate)` resolve the public slug by certificate number |
| `6ea813e` | `fix(certificate)` public page stops showing the internal lab number |
| `530ecec` | `fix(labels)` restore the sub-contract MT roll-up on both routes |
| `cc3bfdd` | `fix(labels)` ellipsise clamped lines; fix the printed-count toast |
| `7ad93a4` | `fix(labels)` sample-photo QR + public JSON off the resolved sample |
| `c6ab3a6` | `docs` correct the sequencing claim, record residuals |

**Verification actually run at the end of Part 1:** `npx tsc --noEmit` clean; `npx vitest run` → **73 files / 654 tests, all passing** (I ran this myself, not relayed from a subagent — one subagent misreported 2 failures that do not reproduce).

**Part 2 of the follow-ups — planning only.** Spec `013ed5b`/`d2c62d8`, plan `29a1e8a`. **Zero app code written.**

## Locked decisions (do NOT relitigate)

1. **"Today" = certified today, in `America/Sao_Paulo`.** Not intake date, not UTC. A certificate issued 21:00 local is already tomorrow in UTC and would vanish from the batch the operator is waiting on.
2. **Reuse `LABEL_TIME_ZONE`, never a second constant.** It is private at [`src/lib/sleeve-label-data.ts:54`](../../../src/lib/sleeve-label-data.ts#L54); Task 3 exports it. Two constants is how a label and the filter that selected it start disagreeing about the date.
3. **Stamp `tin_label_printed_at` when Print is pressed**, not at PDF generation — previewing a batch must not consume it.
4. **Print only in the modal. No download button.** Daniel chose this explicitly to stop PDFs accumulating in Downloads. The known cost: no escape hatch if the print dialog misbehaves.
5. **The new button starts at the size step**, not a silent 4cm default — otherwise someone eventually prints a tray of wrong-sized labels.
6. **`mark-printed` re-applies the certified/rejected gate server-side.** Never trust the request body's ids.
7. **Trade names apply to Seller, Client AND Roaster.** Daniel said "sellers and buyers"; roaster is included because one legal name beside two trade names reads as a bug. Precedent: [`src/app/embed/quadrant/[id]/page.tsx:215-223`](../../../src/app/embed/quadrant/[id]/page.tsx#L215-L223).
8. **Printing stays gated on `certified`/`rejected`.** Tins can no longer be labelled on arrival. Already live and deliberate.
9. **Label dates render Santos-local for every lab.** Buenaventura / Guatemala / Lima show Santos dates near midnight. Known, documented in code, accepted.

## Files created / modified by the plan

- **New** `database/migrations/20260806000000_add_tin_label_printed_at.sql` — the column + partial index. Number verified free against disk (latest is `20260707000000`).
- **New** `src/lib/tin-label-batch.ts` (+ `.test.ts`) — `santosDayRangeUtc(now: Date)`.
- **New** `src/app/api/samples/tin-labels/pending-today/route.ts` — `GET` → `{ sample_ids, count }`.
- **New** `src/app/api/samples/tin-labels/mark-printed/route.ts` — `POST { sample_ids }` → `{ marked }`.
- **Modify** `src/components/pdf/tin-sleeve-label.tsx` — split `labelRow` (full width, dashed) from `labelContainer` (165mm); drop `alignItems: 'center'` from `page`.
- **Modify** `src/lib/sleeve-label-data.ts` (+ test) — add `resolveCompanyName`, export `LABEL_TIME_ZONE`.
- **Modify** both tin routes — `fantasy_name` in the company joins, `resolveCompanyName` at the call sites.
- **Modify** `src/components/samples/tin-label-size-dialog.tsx` — substantial rewrite to size → preview → print.
- **Modify** `src/app/samples/qc/page.tsx` — the button, its fetch, and wiring the dialog to an explicit batch.

## Codebase anchors (saves re-exploring)

- [`src/lib/sleeve-label-data.ts:54`](../../../src/lib/sleeve-label-data.ts#L54) — `LABEL_TIME_ZONE`, currently unexported.
- [`src/components/pdf/tin-sleeve-label.tsx:29`](../../../src/components/pdf/tin-sleeve-label.tsx#L29) — `labelContainer`, where the dashed `borderBottom` lives today.
- [`src/app/samples/qc/page.tsx:1098`](../../../src/app/samples/qc/page.tsx#L1098) — `hasCertifiedSelected`, the existing gate predicate.
- [`src/app/samples/qc/page.tsx:1218`](../../../src/app/samples/qc/page.tsx#L1218) — the search `<Input>`; the new button goes beside it.
- [`src/app/samples/qc/page.tsx:2074`](../../../src/app/samples/qc/page.tsx#L2074) — the `<TinLabelSizeDialog />` usage.
- [`src/app/api/samples/bulk/print-tin-sleeves/route.tsx`](../../../src/app/api/samples/bulk/print-tin-sleeves/route.tsx) — company joins ~line 61, `buildSleeveLabelFields` call ~line 155.
- [`src/lib/certificate-slug.ts`](../../../src/lib/certificate-slug.ts) — `resolveSampleIdForSlug` / `resolvePublicReference`, shipped in Part 1.

Line numbers were accurate at 2026-08-06 on `29a1e8a`. Other sessions edit `qc/page.tsx` — re-grep before trusting them.

## Gotchas

- **Migrations: Daniel applies them, always.** Never run one via CLI or MCP. Paste the SQL. He has applied `20260806000000` already — confirm the column exists before relying on Tasks 4–6.
- **If `tin_label_printed_at` is missing from `src/lib/database.types.ts`,** the generated Supabase types will reject the update in `mark-printed`. Follow the repo's existing `as any` cast pattern on `.update(` and note it; types are regenerated separately.
- **`npm test` starts vitest in WATCH MODE and hangs a session.** Use `npx vitest run <path>` or `npm run test:run`. This bit two subagents today.
- **Never `git add -A`.** The tree carries four modified files and several untracked files from other sessions. Stage explicit paths and check `git status --porcelain` first.
- **Never `git stash` here.**
- **WAQC migrations belong in `database/migrations/`**, not `supabase/migrations/` — even though the `cards_printed_at` precedent this mirrors lives in the latter.
- **Pushing `main` deploys to production immediately** (Vercel). Today a concurrent session's push carried this work to prod before anyone decided the timing. If that matters, coordinate.
- **react-pdf 4.3.1: `maxLines` and `textOverflow` are Style properties, not JSX props.** A subagent already got this wrong once and collapsed two different caps into one.
- Keep files under ~2000 lines. `src/app/samples/qc/page.tsx` is already large — make targeted edits, don't restructure.

## Shelved / explicitly NOT doing

- **Part 2 of [`../specs/2026-08-05-sleeve-label-and-mobile-certificate-design.md`](../specs/2026-08-05-sleeve-label-and-mobile-certificate-design.md)** — the mobile certificate page rebuild (verdict block, spec checklist, 0–5 cupping rails replacing the radar, footer modal), per `docs/prompts/sleeve_qr/waqc-cert-mobile.html`. Not started. **It is now smaller than originally specced**: routing and the displayed-reference rule were pulled forward into Part 1, so Part 2 is purely visual. Daniel noticed the old page and it is expected, not a regression.
- **Reprint history / audit trail.** `tin_label_printed_at` holds the most recent print only. Deliberate.
- **Bag sleeve label, `print-labels`, the certificate PDF layout** — untouched, and three routes still legitimately use the old text-blob QR helpers.

## Next / suggested next-up

1. **Execute the plan** — six tasks, all specced with full code. Tasks 1–3 need no DB; 4–6 need the migration.
2. **Physical print QA.** Never done for Part 1 either. One 4cm sheet and one 2.5cm sheet on the real Santos printer. The 2.5cm variant is the likely failure; the agreed fallback is dropping the size option entirely.
3. **Part 2, the mobile page** — needs its own plan, but the spec is written and now narrower.
4. Residuals recorded in the Part 1 spec's *Open items*: unescaped `%` in the slug `ilike` (pre-existing, compounds enumerability), the portal PDF's split authorization/resolution, a weak roll-up test assertion, and the duplicated call-site mapping across the two tin routes.

## Things the user said that should shape future work

- Daniel is **in Denmark; the Mac mini is in Santos**, reached over SSH. He cannot print or scan physically right now. Verification options discussed: SSH tunnel (`ssh -L 3000:localhost:3000`) with the dev server, or a throwaway branch for a Vercel preview.
- **"Just push to main"** when asked how to verify — he opted to ship without the physical print check.
- **"The compact ones are good too"** — the 2.5cm variant is approved as-is on screen; don't redesign it.
- He wants labels **printable in batches through the day** — "in the morning print today's, and then after lunch after more work, hit again print today's unprinted or all of today's."
- He prefers **pasting SQL** and applies all migrations himself.
- Trunk-based on `main`, no feature branches, sole developer.
- He declines browser mockups during brainstorming; use text and the committed prototype HTML.

## Manual smoke test (after the plan is built)

1. `/samples/qc` → select certified samples → **Tin Label** → size step → Continue → PDF renders inline → **Print** opens the browser print dialog → the dialog closes. **No Download button anywhere.**
2. Generate a 4cm sheet: dashed rules span the **full sheet width**, one above the first label and one below each, five labels per page, none clipped at the foot.
3. Seller / Client / Roaster show trade names. A legal name still showing means that company has no `fantasy_name` — a data gap, not a bug.
4. The **Print today's unprinted · N** button appears only when N > 0. Print it, then reopen — those samples must be gone from the count.
5. Open the dialog, generate a preview, then **Cancel**. Those samples must still be in the next batch (the stamp is on Print, not generation).
6. 2.5cm sheet still renders correctly after the row split.
