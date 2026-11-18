# Handoff — Seller result email: buyer sample, stuffing, final word (2026-11-18)

**Resume point:** nothing to build. Daniel applies the two migrations in order, then the branches are integrated:
1. Paste sys `supabase/migrations/0989_qc_pre_approval.sql`.
2. Rebase sys `feat/qc-pre-approval` onto `origin/main` (22 commits behind), re-run its touched tests, then merge and push.
3. Paste WAQC `database/migrations/20261118000001_seller_requests_final_word.sql`.
4. Fast-forward WAQC `main` to `feat/seller-email-requests` and push.

Do not push either branch before Daniel says so.

## The work (one paragraph)

The PSS quality-result email to a seller now does the following:
- Under each approved PSS row it can carry two requests. **Send sample to buyer** prints "Pré-aprovado pela Wolthers – favor enviar 1 amostra para {Company}:" plus the address, and records on sys a sample request to the buyer and a QC pre-approval mark. **Inform stuffing date/time/place** asks for the shipment-sample draw.
- **Final word** settings pre-check those ticks, per buyer and per quality, with a Fixed lock: Ahold = Wolthers, fixed; Blaser · Dulce = pre-approval, fixed.
- The ticks are set at finalize (cupping validation modal) and can be changed in the send composer.
- The quality table shows every sieve, pan included, one column per sieve. The email is EN or BR. The cover note is a rich-text editor ported from sys.

Spec: [../specs/2026-11-18-seller-email-buyer-sample-stuffing-design.md](../specs/2026-11-18-seller-email-buyer-sample-stuffing-design.md). Plan: [../plans/2026-11-18-seller-email-buyer-sample-stuffing.md](../plans/2026-11-18-seller-email-buyer-sample-stuffing.md).

## Repo state right now (verified 2026-11-18)

**WAQC**
- Worktree `/Users/danielwolthers/Documents/GitHub/WAQC-seller-email`, branch `feat/seller-email-requests`, HEAD `af6bfd52`. Working tree clean; `.env.local` is a symlink to the main checkout's, gitignored.
- 30 commits ahead of `origin/main` (`85714bc7`) and 0 behind, so a fast-forward is possible. **Nothing pushed.**

**sys**
- Worktree `/Users/danielwolthers/Documents/GitHub/Wolthers-system/wolthers-app-qc-preapproval`, branch `feat/qc-pre-approval`, HEAD `5001176dd`. Clean; `node_modules` is a symlink to the main sys checkout's.
- 11 commits ahead and **22 behind** `origin/main`, so rebase before merging. **Nothing pushed.**
- Migration number 0989 is still free on main (main has 0990 and 0991).

**Migrations:** neither has been applied.

**Stashes:** none created by this work.

## What's done

### sys (11 commits, `a47a86302..5001176dd`)

| SHA | What |
|---|---|
| `755e03498` (+`fd6a8bbdd`, `ee178e96f`, `5001176dd`) | `0989_qc_pre_approval.sql`. Adds `shipment_samples.qc_pre_approved_at` and `pre_approval_of` (FK **ON DELETE NO ACTION**, **UNIQUE** partial index). `qc_mirror_sample()` is 0814 verbatim plus `AND pre_approval_of IS NULL` on its 5 claim/count statements. |
| `ae0fc23fe` | `placeholder.ts` / `placeholder-exec.ts`: Request sample never reuses a buyer request. |
| `dc17e3002`, `866cee82a`, `233315bbb` | Grid: `SampleCell.qcPreApprovedTo`. `sampleStatusLabel` gives `PRE-APP - 12/Nov/26 W&AQC → Blaser`. The live PssCell (`shipments-compact/cells.tsx`) shows "W&A Pre-approved" with "date · → buyer". The long form reads "Pre-approved". |
| `5243bf151` | Shipment Update PDF names the buyer through the shared `stampPreApprovedTo`. Contract-modal tag on approved rows only. |
| `719850f25` | Contract modal: `PreApprovalTag` "Pre-approved (QC) · sample to {buyer}". |
| `51e5af7c7` | Edit history labels `qc_pre_approved_at` and hides `pre_approval_of`. |

### WAQC (30 commits, `85714bc7..af6bfd52`)

Spec and plan are `016d156d` and `9db7803c`.

| SHA | What |
|---|---|
| `af706db2`, `66b9ed1a` | Migration file, `src/lib/seller-requests/types.ts`, `rules.ts` (`resolveRules`, `tickLocks`, `startingRequests`, `enforceLocks`). zod 3.25.76 pinned as a direct dependency, `zod/v4` imports. |
| `7c677189` | `language.ts` (sys `sellerLanguage` port), `copy.ts` (EN/PT), `request-lines.ts`. The tolerance block gains EN. |
| `af4754e4`, `6a7b9bef`, `0b3fa928` | `destinations.ts` plus `api/companies/[id]/sample-destinations` (GET/POST on sys's `company_addresses`). The default is the client's own address, never a sister's. |
| `ff31a434`, `51b77d34`, `6346994e` | `store.ts`: per-contract state and locked save. Guarded reads (only 42703/PGRST204 fall back). Memoised default lookup. GET `api/samples/[id]/seller-requests`. |
| `44132b19`, `f4ef2103` | `quality-summary-render.ts` (pure, client-safe): every sieve in its own column, request lines gated on `sellerComment`. |
| `a1a74720`, `236423e8`, `fd93f6f8` | TipTap 3.31.4 editor port (`components/email/`, `lib/email/draft-markup*`, `markup-doc`), `renderMarkupBodyHtml` in Helvetica 10pt, editor loaded with `next/dynamic`. |
| `a0d8abb9` | Send pipeline: language and ticks through queue, route, `sendCertificateUnit`; markup cover; ticks saved on send. |
| `62ebaafc`, `ee8df187` | `sys-buyer-request.ts`: sys request row, `request_batches`, `pss_requests`, pre-approval mark. `sendMail({returnIds})` uses the draft path and falls back to `/sendMail` on 403. A 23505 re-reads the request. Write-back ignores buyer requests. |
| `c80bf93d`, `c0cb09b9`, `af6bfd52` | Finalize modal ticks, saved before `approveWithinTolerance`. `TickLock.on`. `tick-state.ts`. A missing address blocks only the approve paths. |
| `8fb7b852` | Composer: Requests card, `DestinationPicker`, EN/BR switch, rich-text cover, live preview. |
| `a2f3ed57`, `a341925f` | Final-word settings: client QC panel group and quality-row cell. The Clients read falls back to the legacy select before the migration. |
| `04cb037e`, `0da5f38b` | Reversal: clears the mark and flags the open request. Override dialog warning. Staff-only GET scoped to this lot. |
| `92ec1e69`, `4ce48b34` | Cert editor's "Send approval email" opens the shared composer for the whole contract group. |
| `335ac5e3` | `lock_timeout` in the WAQC migration. |

### Verification, 2026-11-18

**WAQC at `af6bfd52`**
- `npx vitest run`: 428 files, **4510 tests pass**.
- The run also prints 18 unhandled errors from 4 files this branch did not touch: `CvaJourney.test.tsx`, `sample-intake-form.{contract-link,keyboard,ss-pss-link}.test.tsx`. The identical 18 appear at base `85714bc7`, so they predate this work.
- `npx tsc --noEmit` clean. `npx next build` exits 0 (checked at `92ec1e69`).

**sys at `5001176dd`**
- `npx vitest run`: 2040 files pass. 7 files / 16 tests fail (bi report, eudr cron/legality/report, pptx, plan-space deny); they fail identically at base `a47a86302`, so they predate this work (environment or main drift).
- Typecheck shows only the 4 known errors (pptxgenjs, qrcode missing via the symlinked node_modules).
- Run tsc with `NODE_OPTIONS=--max-old-space-size=8192`, or it runs out of memory.

**Not done:**
- No browser check of any screen.
- No sandbox send.

## Locked decisions (do NOT relitigate)

1. **Where ticks live:** at finalize, next to "Comment to seller", saved per contract sample (`samples.seller_requests`, never synced to siblings). They can be changed in the composer, and the automatic approve-with-comments seller email carries them.
2. **How sys records it:** status stays `approved`, plus the marker `qc_pre_approved_at`. The buyer request is a normal sys request (`source 'sys'`, `pre_approval_of` → our anchor row, `request_batches` with `origin 'staff'`, `pss_requests`). `contract_splits` is never written.
3. **sys grid:** keep sys's two-stage rule (written for Blaser 41545/26): PRE-APP, then SENT (2nd), then the buyer's decision.
4. **Final word per buyer and per quality, with Fixed:**
   - Ahold = Wolthers, fixed.
   - Blaser · Dulce = pre-approval, fixed.
   - `fixed` belongs to the level that supplies the final word.
   - Only `wolthers` and `pre_approval` exist now. `'buyer'` comes with the next project.
5. **Sample addresses are sys's own `company_addresses` rows**, never copies. WAQC does not write `is_default`. The default order is:
   1. the setting's address
   2. the client's own `is_default` address
   3. the client's newest address
   4. the client's company address (Blaser: Guterstrasse 4, CH-3001 Bern).
6. **Table layout:** layout A (one row per sample, one column per sieve, one decimal like the certificate), for both audiences.
7. **Finalize** is blocked only on the approve paths while a ticked buyer sample has no address.
8. **FK `pre_approval_of` is ON DELETE NO ACTION**, a ruling that overrides the spec's SET NULL: nulling it would let the mirror or write-back claim the request.
9. **Seller replies:** a reply with text is **held** in sys /inbox (relay `HOLD_FLAG.replyText`); an attachment-only reply relays to the buyer. Accepted as is.

## Rulings made during execution (Daniel may want to check)

- **zod:** added as a direct dependency.
- **sys migration** renumbered 0960 → 0989.
- **`companyId` of a saved destination** is the owning company.
- **Draft-path 403:** falls back to `/sendMail`, so the email still goes but sys gets no message ids.
- **Write-back read errors** are logged as `writeback_error` instead of inserting a phantom row.
- **Ticks are saved before the Graph send**, so they stay saved if the send fails.
- **Resend of a lot emailed before this shipped** starts from the current setting, so it may ask for a buyer sample (parked).
- **Old code left in place, now unused:** `components/samples/approval-send-view.tsx`, `api/samples/[id]/notify-approval`, `api/samples/[id]/approval-recipients`.

## Gotchas

- **Deploy order is load-bearing**, because both repos deploy on push to main:
  - sys code before 0989 breaks `/shipments` cells, the contract modal (`all-samples` 500) and Request sample, all of which select the new columns.
  - WAQC reads are guarded (the Clients read retries without the columns), **but WAQC QC-config saves fail until 20261118000001 is applied**.
- **sys branch is 22 behind main** and touches `vitest.config.ts` (a named-file allowlist). Rebase, then re-run `npx vitest run src/lib/shipments/ src/lib/shipment-update/ src/lib/samples/ src/components/shipments-compact/ src/components/samples/ src/lib/requests/`.
- **The WAQC-sensory worktree also edits `cupping-validation-modal.tsx`.** Expect a conflict when either merges second.
- **Pre-existing, outside scope:** `PATCH /api/certificates/[id]/override` checks only for a session user, with no staff gate.

## Next / suggested next-up

1. **Daniel:** apply 0989, rebase/merge/push sys, apply 20261118000001, fast-forward and push WAQC.
2. **Sandbox send** (`MICROSOFT_GRAPH_TEST_RECIPIENT`) with a buyer-sample tick. Check:
   - the Graph draft path works (otherwise the log shows `[graph] draft path refused (403)`);
   - the 9-sieve table width in Outlook (about 950px);
   - BR copy and the rich-text cover.
3. **Browser smoke:**
   - composer (editor, EN/BR, Requests card, picker, preview);
   - finalize modal ticks;
   - client QC panel "Final word";
   - quality-row cell;
   - Override dialog warning.
4. **Set up Ahold** (Wolthers, fixed) and **Blaser · Dulce** (pre-approval, fixed, address).
5. **One live pre-approval on a test contract.** Watch the sys request row, the PRE-APP grid cell, the contract-modal tag, the Shipment Update PDF and the /inbox held reply.
6. **Next project (brainstormed separately):** buyers with the final word. We send findings; they Approve / Approve with comments / Reject with comments, maybe picking which part is out, from the email or the qc/sys portal; then the seller email goes. This becomes `final_word = 'buyer'`, and sys reading APP after a buyer rejection gets fixed there.
