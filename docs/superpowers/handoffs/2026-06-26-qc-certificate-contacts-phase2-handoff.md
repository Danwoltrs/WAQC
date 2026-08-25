# Handoff — QC Certificate Contacts, Phase 2 (send-flow capture) (2026-06-26)

**Resume point:** WRITE the Phase 2 implementation plan with `superpowers:writing-plans` from **§3 of [`../specs/2026-06-26-qc-certificate-contacts-design.md`](../specs/2026-06-26-qc-certificate-contacts-design.md)**, then execute it via `superpowers:subagent-driven-development`. Phase 2 is **specced but has NO plan and NO app code yet.** Phase 1 (the Contacts tab) is shipped to prod — reuse it, don't rebuild it.

## The work (one paragraph)

Phase 2 is the **reactive** half of QC certificate contacts: capturing missing recipients at *send* time. Today, when certificates go out (Anderson's end-of-day "Send unsent certificates" batch, or selecting samples and hitting send), any company with **no `qc_certificates` recipient is silently dropped** — the batch builder skips it and the single-send path omits that side, so those certs never go out and nobody is prompted. Phase 2 changes that: the send flow walks **all buyers and sellers**, and a company with no recipient still opens the composer with an inline capture step — add an email / group inbox → ask **group or person** → ask **"save as a QC-cert recipient for this company for the future?"** (checked → persist via Phase 1's `upsertQcRecipient`; unchecked → one-off send only). It's the exact behaviour Daniel asked for mid-session (quoted verbatim below).

## Repo state right now

- **Single repo** `/Users/danielwolthers/Documents/GitHub/WAQC` (branch `main`). NOTE: WAQC is **one git repo** — `docs/` and app code commit together and push to `origin/main` (GitHub `Danwoltrs/WAQC`) → Vercel prod. This is **not** the Wolthers-system two-repo layout the handoff skill's `references/` assume; ignore the `wolthers-app/` + outer `~/.git` + `tsx --test` facts here.
- **Phase 1 is PUSHED** — `origin/main` is at `978fb41` and contains all six qc-contacts commits + the spec/plan. Local `HEAD` is `0f22e41`, **1 commit ahead**: `feat(embed): service-role quadrant aggregate helper` — **Daniel's unrelated WIP, not qc-contacts, and intentionally unpushed.** Don't fold it into Phase 2.
- **Working tree (all pre-existing, NOT this feature):** `M src/app/api/certificates/[id]/override/route.ts`; untracked `database/migrations/20260624000000_allow_override_terminal_transitions.sql` and three older `docs/superpowers/handoffs/*.md`. Leave them; stage only your own paths.
- **Stashes:** none.
- **Verification at the pushed feature HEAD:** `npx tsc --noEmit` clean; the 13 Phase-1 feature tests pass (`npx vitest run src/lib/qc-contacts/ src/components/clients/qc-contacts-tab.test.tsx`); full suite was 439/439 bar one unrelated transient network test.

## What's done

**Phase 1 (Contacts tab) — LIVE in prod**, all on `origin/main`:

| SHA | What |
|---|---|
| `bff7263` | `feat(qc-contacts): pure tag + list helpers` — `src/lib/qc-contacts/tags.ts` |
| `dc71681` | `feat(qc-contacts): upsert planner + contacts DB operations` — `src/lib/qc-contacts/upsert.ts` |
| `3cb40c3` | `feat(qc-contacts): list/add/edit/remove API routes (service-role)` — `src/app/api/companies/[id]/qc-contacts/...` |
| `f9a2fd9` | `feat(qc-contacts): Contacts tab on company detail page` — `src/components/clients/qc-contacts-tab.tsx` + wire-in |
| `9ded2da` | `fix(qc-contacts): dark-mode color variants on tab feedback` |
| `0281a0e` | `fix(qc-contacts): gate routes to staff (close IDOR) + surface load error` |

(SHA aliasing caveat: this session was a resume/replay; the working SHAs above match what's on `origin/main` by **commit message + content** — verify by message, not by trusting a remembered SHA.)

**Phase 2:** spec committed (§3 of the design doc, commit `da69cd5`). **No plan. No app code.**

## Locked decisions (do NOT relitigate)

1. **Approach A** — server route + service-role + the shared `upsertQcContact`/`upsertQcRecipient` already built in Phase 1. Phase 2 **reuses** `POST /api/companies/[id]/qc-contacts` for the "save for future" persist; it does **not** add a new write path.
2. **Capture is inline in BOTH composers** (single + batch), not a separate screen.
3. After adding an address: ask **group-or-person**, then **"also save as a QC-cert recipient for {company}"** — checked → upsert (tagged for next time); unchecked → used for this send only (today's ephemeral-chip behaviour).
4. **Stop silently dropping** companies with no recipients — surface every buyer **and** seller; an empty one becomes a blocked-until-added capture unit, not a skip.
5. **Persist BEFORE send** (a failed save surfaces before the email goes out); the existing `to.length > 0` server guards stay as the backstop.
6. Send/dispatch routes are **unchanged in how they send** — they still receive a final `to`/`cc` list.
7. **Same shared `contacts` table; NO migration.**
8. **Any service-role route stays staff-gated** with `isStaffSampleManager` (the Phase 1 IDOR lesson). The reused POST already has it.

## Files to create / modify (the plan's blast radius — from spec §3)

- **Modify** `src/lib/approval-notification/batch-send.ts` (~line 153) — `buildBatchUnits` must stop `continue`-ing on empty `to`; emit the unit with `needsRecipients: true` + the resolved `companyId`/side/company name.
- **Modify** `src/app/api/certificates/batch-send/queue/route.ts` (~lines 132–154 contact fetch / resolvePanel; ~236–239 `buildBatchUnits` call) — stop bucketing empties into `skipped.noRecipients`; surface them.
- **Modify** `src/components/certificates/batch-approval-send-view.tsx` (~220–225 empty-recipients amber text; ~295 send-disabled) — render `needsRecipients` units in the carousel, blocked from Send until ≥1 recipient added; mount the capture form.
- **Modify** `src/components/samples/approval-send-view.tsx` — surface the empty side with the same capture form; unlock that side's Send once a recipient exists.
- **Modify** `src/app/api/samples/[id]/approval-recipients/route.ts` — it already resolves `buyerId`/`sellerId`; surface them to the view so the capture form knows which company to write.
- **New** shared capture-form component (the existing `recipient-chips.tsx` free-text input + group/person toggle + "save for future" checkbox), used by both composers; POSTs to `/api/companies/[id]/qc-contacts`.
- **Modify** `src/lib/approval-notification/types.ts` — add `needsRecipients` + `companyId`/side to the batch unit / panel types.

## Codebase anchors (saves re-exploring — verify line numbers, files drift)

- [`src/lib/approval-notification/resolve-panels.ts`](../../../src/lib/approval-notification/resolve-panels.ts) — `resolvePanel`; a company with no tagged contacts → **empty `to`** (this is the "missing recipient" signal). Exports `QC_CERTIFICATES_PURPOSE`, `HOUSE_CC`.
- `src/lib/approval-notification/batch-send.ts:~153` — `if (!panel || panel.to.length === 0) continue` ← the silent skip to replace.
- `src/app/api/certificates/batch-send/queue/route.ts` — contact fetch + `resolvePanel`; returns `{ units, skipped: { noContract, noRecipients } }`.
- `src/components/certificates/batch-approval-send-view.tsx` — carousel of `BatchUnit`s; amber "No QC-certificate recipients…" at the empty case; Send disabled when `current.to.length === 0`.
- `src/components/samples/approval-send-view.tsx` — two `RecipientPanel`s (seller, buyer); Send disabled when both `to` empty; filters empty panels before POST.
- `src/components/samples/approval/recipient-chips.tsx` — existing free-text email-chip input (chips are **ephemeral**, not persisted) → base for the capture form.
- Send/dispatch: `src/app/api/samples/[id]/notify-approval/route.ts` and `src/app/api/certificates/batch-send/route.ts` (both keep the `to.length > 0` guard).
- **Phase 1 to reuse:** `src/lib/qc-contacts/upsert.ts` → `upsertQcRecipient(db, companyId, input, actorId)`; `POST /api/companies/[id]/qc-contacts` (staff-gated, service-role).

## Gotchas

- **WAQC = single repo.** `npx vitest run <path>` for tests (NOT `tsx --test`); `npx tsc --noEmit` for types. Push finished+verified work to `main` → Vercel prod; don't push half-done without Daniel's go-ahead.
- **Service-role routes bypass RLS** → must be gated with `isStaffSampleManager(supabase, user.id)` from `@/lib/auth/sample-access` (403 for non-staff/portal clients). The reused POST already is; if Phase 2 adds any new service-role route, gate it the same way. This was a real IDOR caught in Phase 1's final review.
- **The set-union invariant is sacred:** adding/removing `qc_certificates` must never touch a contact's other `routing_purposes` (the table is shared with sys). Reuse `addQcCertTag`/`removeQcCertTag` — don't hand-roll array writes.
- **Co-edited working tree:** `override/route.ts` is modified by Daniel, plus untracked migration + handoffs. `git status` first; stage only your Phase 2 paths; never `git add -A`.
- **Migrations:** none needed for Phase 2. (If that ever changes, Daniel applies SQL himself — paste it, don't run it. WAQC migrations live in `database/migrations/`.)
- Files under ~2000 lines; if a composer edit pushes one past that, flag a split.

## Next / suggested next-up

1. **Write the Phase 2 plan** (`writing-plans`) from spec §3 — small; the spec is detailed and the write path already exists. Then execute via `subagent-driven-development`.
2. **Visual QA both phases together** after Phase 2 lands (light/dark, real send composer with a no-recipient company).
3. Optional follow-up noted in spec: a "save for future" that also lets you pick an existing contact rather than only free-typing.

## Things the user (Daniel) said that should shape Phase 2

- Verbatim requirement (this IS Phase 2): *"when we send the certificates either in the end of the day, or by selecting and hitting send, it should go through all sellers and buyers, if there are any contacts missing, still open up the message and ask user to add recipients or group inboxes, after adding, ask if user wants to save the contact to receive QC Certs in the future for that company, and ask if the e-mail is a group or a person."*
- Build order was explicitly **tab first, then send-flow** (tab is now done).
- Trunk-based, sole dev: push straight to `main` = prod; he does his own visual QA.

## Manual smoke test owed from Phase 1 (carry forward)

Open a company under `/clients`, select the **Contacts** tab: confirm it lists that company's QC-cert recipients (cross-check the same company's Contacts in sys.wolthers.com), add/edit/remove works, light + dark both render, no emojis. Phase 2's QA extends this into the send composer.
