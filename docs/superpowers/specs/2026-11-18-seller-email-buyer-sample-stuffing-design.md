# Seller result email: send-sample-to-buyer, stuffing request, full sieve table, rich text

Date: 2026-11-18. Status: design, agreed with Daniel in conversation. Repos: WAQC (this one) and sys (`Wolthers-system/wolthers-app`), one shared Supabase DB.

## Why

When QC approves a PSS, two things often still have to happen, and today both are typed by hand into separate emails, or forgotten:

1. **The buyer still wants the sample.** We approve it, but the buyer asks to receive a sample anyway. We then ask the seller to send one to the buyer. That is a sample request, exactly what sys's *Shipments → Request sample* does, and our approval becomes a **pre-approval**: WAQC approved it, and the buyer has the final word.
2. **We need the shipment sample.** To approve the SS we draw a sample at stuffing, so the seller has to tell us the stuffing date, time and place.

Both belong **in the PSS result email to the seller, under the sample they concern**. Daniel also wants that email's text to be rich-text editable like sys's request composer. He also wants the quality table to show the **full screen-size distribution**. Today it squeezes the sieves to three lines and drops the pan, and the seller can't see the breakdown they have to fix.

## Goals

- **Who has the final word**, set per buyer (QC client) and overridable per quality, with a **Fixed** lock (§10):
  - Ahold: Wolthers, fixed.
  - Blaser's Dulce quality: pre-approval, so a sample goes to Blaser.

  The setting pre-checks the email's ticks. When fixed, they can't be changed.
- Two per-sample ticks on approved PSS lots: **Send sample to buyer** (with a destination) and **Inform stuffing date/time/place**.
- The ticks are set at finalize and can be changed in the send composer. They print as lines under that sample in the seller email.
- Sending the seller email with *Send sample to buyer* ticked records it on sys:
  - The PSS approval is marked as a pre-approval.
  - A sample request addressed to the buyer appears, exactly like a request made on sys.
- The quality table shows every sieve, pan included, one column per sieve, in both the seller's and the buyer's emails.
- The composer's text is a rich-text editor, a port of sys's (bold, italic, underline, highlight, four colours, clear).
- An EN/BR switch translates the whole seller email.

## Non-goals

- **Clients who have the final word** (they approve or reject our findings from an email button or a portal, and the seller is then emailed). This is the next project, brainstormed separately. This design only shapes the sys pre-approval mark so that project can reuse it (see "Follow-on").
- Recording anything on sys for the stuffing request. It is an email line only.
- More than one sample per contract to the buyer, or per-container rules (sys's *Per container / Every N*). It is always one sample per contract.
- Changing the email subject format (`PSS Quality Report / <Shipper> for <Client> / Contract no. …`).
- Editing the quality table or the request lines inside the editor.

## Anti-goals (would make it a failure even if it works)

- **A buyer-bound request claimed by the lab.** sys hands an open `requested` PSS row to the next WAQC sample registered on that contract, and sys's own Request sample reuses an open row on the same split. Either would silently file the wrong sample against the buyer's request. Both must ignore our buyer requests.
- **"Approved" changing meaning on sys.** These keep reading a pre-approved PSS as approved: `shipments.pss_status` / `derivePssStatus`, `deriveLegSampleStatus`, reports, the pressure board, and our own write-back. The /shipments grid cell is the deliberate exception, and sys already behaves that way (see "Approaches", sys grid).
- **Typed-over numbers.** The table and request lines are generated from the database at send. The editor holds the cover note only.
- **Any SAN number shown** anywhere: email, composer, sys tag, logs meant for people (CLAUDE.md rule).
- **Buyers seeing seller-only content.** The request lines, the seller note and the tolerance block are seller-only, exactly like today's note.

## Approaches considered (decided with Daniel)

**Where the ticks live.** Lots approved with comments email the seller automatically at finalize (`sendSellerNoticeNow`) and never open a composer. Three options were considered:
1. **Ticks at finalize**, beside "Comment to seller", saved on the sample and changeable in the composer. **Chosen**: the decision is made when the lot is approved, and the automatic email carries it.
2. Stop the automatic seller email so these lots wait for the composer. Rejected: it undoes the 2026-09-29 rule that the seller hears at once.
3. Ticks only in the composer. Rejected: auto-sent lots would need a second email.

**How sys shows the pre-approval.**
1. **Status stays `approved`, plus a marker column, plus a tag on sys.** **Chosen**: nothing that reads "approved" changes.
2. A new status `pre_approved`. Rejected: every sys screen, filter and count, the QC mirror and our write-back would need changes, and one would be missed.
3. Text in `approval_comments` only. Rejected: sys can't tell a pre-approval apart, so there is nothing to tag or filter on.

**What sys's /shipments grid shows while the buyer's sample is out.** Two options were considered:
- **b) Keep sys's two-stage rule.** **Chosen.** `deriveSampleCell` (`leg-sample-summary.ts:242`) shows the latest word; Daniel wrote it for this Blaser case on 41545/26. The cell runs:
  1. APP + the pre-approval tag (count "1/2" while the request is open)
  2. **SENT (2nd)** with the AWB once the seller ships
  3. Blaser's decision

  Our request behaves exactly like one made on sys, and the cell code is unchanged.
- a) Leave our buyer request out of the cell, counts and send order. Rejected: the grid would say "approved" throughout and never show the shipment to Blaser or Blaser's answer.

Known quirk, left to the final-word project: when the buyer rejects, the cell reads APP again, because an approval outranks a rejection there.

**Where the ticks' defaults come from.** Daniel: per buyer and per quality, with a lock.
- Ahold: our approval is final, and the box can't be ticked.
- Blaser Dulce: pre-approval with a sample to Blaser.
- Other buyers decide on our findings (next project).

Modelled as one **final word** setting rather than raw checkbox presets, because the three cases are three answers to that one question (§10).

**Table layout.**
- **A: one row per sample, one column per sieve.** **Chosen**: a 20-container email stays scannable.
- B: a block per sample with a requirement row. Rejected for length.

**Editor.** There was one sensible way: **port sys's TipTap editor and its draft-markup format**.
- A home-made `contentEditable` was rejected: its HTML is messy in Outlook and pasting breaks.
- Editing the table inside the editor was rejected: the numbers could be typed over.

## The design

### 1. Finalize: the ticks

In `cupping-validation-modal.tsx`, next to "Comment to seller", shown when finalizing a **PSS** lot:

- **[ ] Send sample to buyer**, plus the destination picker (§4) when ticked.
- **[ ] Inform stuffing date/time/place**

A lot with several contracts (siblings) gets **one row per contract**: contract number, QC client, and its own ticks and destination. A lot with one contract shows one row with no heading. The ticks are sent with the finalize POST, keyed by the contract's sample id.

**Starting state.** The ticks start from the contract's resolved final-word setting (§10).
- Pre-approval: *Send sample to buyer* is ticked, with the setting's address.
- Wolthers: it is unticked.
- Stuffing: off, pre-checked, or fixed on.
- **Fixed:** the box is shown locked with its reason, e.g. "Ahold: Wolthers has the final word" or "Blaser · Dulce: pre-approval, sample to Blaser".

The server re-resolves the setting and refuses any change to a fixed tick, so a stale browser can't override a lock. Stored ticks from an earlier finalize win over the setting, unless the setting is fixed.

**Save before anything sends.** The finalize route saves them on each sample **before** `approveWithinTolerance` runs, so the automatic seller email already has them. They are saved whatever the outcome: a lot that finalizes as pending (grading missing) and is certified later at grading keeps them. They only **print** when the lot is approved.

Lots approved without the modal (certified after grading, Override Status) keep whatever ticks are stored, or start unticked, and are set in the composer.

### 2. The send composer

In `batch-approval-send-view.tsx` (Actions → Send, and Send unsent), on **seller** units only, add a **"Requests to seller"** card. It lists each **approved PSS** certificate in the unit with its two ticks and destination, pre-filled from the stored values.

- Fixed ticks show locked, exactly as at finalize. Lots with nothing stored start from the setting (§10).
- Changes made in the card are saved on the sample when that email is **sent** (not on Skip).
- The read-only preview on the right re-renders on every tick, destination or language change.
- **Send is blocked** while a ticked *Send sample to buyer* has no destination.
- *Send all remaining without review* sends each unit with its stored ticks.

The **cover note** becomes the rich-text editor (§6), replacing the plain textarea in `RecipientPanel` for this composer. An **EN/BR switch** sits above it (§7).

**My call, a consolidation.** The certificate editor's older single-sample "Send approval email" (`approval-send-view.tsx` → `notify-approval`) sends plain text with no table. It now opens this same composer with that one certificate selected, so there is one seller email in the app. If the builder finds that view must stay, it at least appends the same request lines to its seller panel.

### 3. What the email says

Under each approved PSS row, as full-width rows beneath it, seller emails only, in this order:
1. today's seller note
2. today's approved-with-comments block
3. the request lines

**Send sample to buyer:**

- **PT:** **Pré-aprovado pela Wolthers – favor enviar 1 amostra para {Company}:**
- **EN:** **Pre-approved by Wolthers – please send 1 sample to {Company}:**

Then the address one line per row. Then `ATTN … · Tel: …` when the address has them. Then the courier instructions in red, which is sys's `destinationEntry` style (`templates.ts:509`).

**Inform stuffing:**

- **PT:** Favor nos informar data, hora e local da estufagem para retirarmos a amostra de embarque (SS).
- **EN:** Please let us know the stuffing date, time and place so we can draw the shipment sample (SS).

The lines are generated at send from the stored ticks (`sendCertificateUnit`), the same way the table is. The plain-text part carries them too.

### 4. Destinations

The picker offers, in sections, like sys's `destination-sections.ts`:
1. the QC client's saved sample addresses, and those of its group companies (`company_addresses` with `kind='sample'`, `is_active`, company or same `companies.group_id`)
2. the QC client's own company address
3. the contract's importer and roaster (saved sample addresses, else company address)
4. **+ New address for {client}…**

**My call: the Wolthers lab is left out.** Sending to our own lab is the normal PSS request, not a buyer request.

A new address is saved to `company_addresses` (`kind='sample'`, `company_id` = the client) with sys's validation:
- label and lines required
- the 50-per-company cap
- an identical active address returns the existing one

It then shows up on sys too. Port sys's zod schema and save logic (`saved-destinations.ts`, `api/companies/[id]/sample-destinations/route.ts`) into WAQC routes. They are staff-only and use the service role after the staff check.

**These are sys's own records, not a copy.** WAQC reads and writes the same `company_addresses` rows that sys's company page Samples tab edits (`company-samples-tab.tsx`, `SampleDestinationForm`). An address added or edited in either app is the same row in both.

**The default is sys's `company_addresses.is_default`.** Setting a default from WAQC sets it on that row and clears it on the company's other `kind='sample'` rows, matching sys's behaviour; check sys for how it enforces one default.

**Default when ticking**, first that exists:
1. the address on the quality's setting
2. the address on the buyer's setting
3. the client's `is_default` sample address
4. its most recently updated active sample address
5. its company address (`companies.street … country`). For Blaser that is Guterstrasse 4, CH-3001 Bern, Switzerland.
6. Otherwise the picker opens on *+ New address*.

**What is stored** is a snapshot taken when it was picked: company id and name, saved-address id, lines, country, recipient, ATTN, phone, instructions. An address edited later doesn't rewrite what was asked.

### 5. sys: what is written when the seller email goes out

This runs in `sendCertificateUnit` for **`side === 'seller'`**, per approved PSS certificate with *Send sample to buyer* ticked and a contract. It does not run at finalize, and it does not run in sandbox (`MICROSOFT_GRAPH_TEST_RECIPIENT`).

1. **Find our PSS row(s)** with the same claim rule the approval write-back uses (`shipment-sample-writeback.ts`: `waqc_ref` = tracking number, or a sibling's certificate number without `R-`).
2. **Mark them pre-approved:** `shipment_samples.qc_pre_approved_at = now()` on every claimed row. Status stays `approved`.
3. **Add the buyer request, recorded exactly like one made with sys's *Request sample*** ("this counts as a request for sample"). Insert one `shipment_samples` row per contract with:
   - `sample_type 'pss'`, `status 'requested'`
   - **`source 'sys'`** (my call): on sys, `qc` means "the lab's row, the mirror owns it". sys's automatic readers skip `qc` rows: `sample-results/plan.ts`, which applies a buyer's results email; `sample-dispatch/apply/plan.ts`; and `sample-results/sentences/validate.ts`. With `qc`, the buyer's verdict on this very sample would land as a loose new row.
   - `contract_id`, and `shipment_id` / `split_id` copied from the claimed row
   - `created_by` = the sender
   - `recipient_company_id` (picked company) or `recipient_company_name` (when there is no company)
   - `pre_approval_of` = the claimed row's id (the lowest container slot when it is a container-split group)
   - the **sample label** sys's rules give it (`pssLabels`, e.g. "41871/26 - B"), printed in the email line the way sys's request prints it, so the dispatch and results readers can match the sample when it comes back

   Also insert:
   - a **`request_batches`** row (my call), so sys's /inbox chases the request and retires it like its own. Use `kind 'samples'`, `items` carrying the contract, and `status 'sent'` with the send's Graph ids. Use the allowed `origin` value nearest to QC; if none fits, add one in the sys migration.
   - a **`pss_requests`** row: `requested_by`, `request_method 'email'`, `email_to`, `email_cc`, `subject`, `batch_id`, `sample_id` = the new row, `contract_id`

   The email goes from the QC mailbox, while sys's requests go from wolthers@ (CC'd here). **The builder verifies whether the relay of the seller's reply works from the QC mailbox and reports back.** If it can't, the request is still recorded and chased, just not relayed.

   **Never** write `contract_splits.sample_destination`: that is the leg's lab destination, and overwriting it would move the board's destination.
4. **Resend is idempotent.** If a row with that `pre_approval_of` exists, update its recipient and add a new `pss_requests` row; never insert a second request. **My call:** unticking and resending leaves an existing request alone. Requests are withdrawn on sys.
5. **Failures never block the email.** Writes are guarded like `approved_by_initials` (a missing column never breaks a send). Problems go to `qc_sys_sync_issues` (stage `email`).
6. **WAQC's own write-back ignores buyer requests.** `selectShipmentSampleTargets` (`shipment-sample-writeback.ts`) never claims, nor is blocked by, a row with `pre_approval_of` set. The same exclusion applies to the mirror and to `placeholder.ts` below.

**If QC reverses the approval later** (Override Status to rejected, or a new decision after the seller email went out). **My call:**
- The instant write-back clears `qc_pre_approved_at` on our rows.
- If a linked buyer request is still `requested` (not shipped), the write-back logs a `qc_sys_sync_issues` row naming it ("buyer sample request open after reversal").
- The Override dialog warns: "A sample request to {Company} is open on sys. Tell the seller not to ship."
- No automatic cancellation email.

**sys migration (WAQC builder writes it in the sys repo; Daniel applies it):**
- `shipment_samples.qc_pre_approved_at timestamptz NULL`: WAQC approved, the buyer has the final word.
- `shipment_samples.pre_approval_of uuid NULL REFERENCES shipment_samples(id) ON DELETE SET NULL`: this request is the buyer's sample for that pre-approval. Indexed.
- **`qc_mirror_sample()`** (latest in `0814_qc_mirror_rows_follow_sample.sql`): every place it counts, claims or resets `requested`/`pending` placeholders ignores rows with `pre_approval_of IS NOT NULL`.
- **sys Request sample placeholder reuse** (`src/lib/requests/placeholder.ts`, used by `send-core.ts`): never reuses a row with `pre_approval_of` set.

**sys UI:** show **"Pre-approved (QC) · sample to {recipient}"** next to the approval when `qc_pre_approved_at` is set. The recipient comes from the linked request row. Where it shows:
- **Contract modal Samples tab:** beside `DecidedByMark` / `QcOriginTag` in `contract-modal-sample-group-row.tsx`. `api/contracts/[id]/all-samples` selects the new columns.
- **/shipments grid:** through `sampleStatusLabel` (`sample-cell-content.ts`), the single source of truth for the grid and both PDFs (Export, Shipment Update). `api/shipments/route.ts` and `lib/shipments/leg-sample-summary.ts` carry the mark through. **My call:** it shows on the PDFs too. The Shipment Update goes to that contract's buyer, who is the one receiving the sample, and one label source avoids drift.

**Deploy order:**
1. sys migration
2. sys deploy, because its reads select the new columns
3. WAQC, whose writes are guarded either way

### 6. Rich-text cover note

Port from sys (TipTap **3.31.4**, the same versions):
- `components/requests/request-body-editor.tsx`
- `request-body-extensions.ts`
- `lib/email/draft-markup.ts`
- `lib/email/markup-doc.ts`
- the markup→HTML renderer in `lib/email/compose-html.ts` (`renderRequestHtml`)

Add `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-highlight` and `@tiptap/extension-text-style`.

The body travels as **draft-markup text** (`**bold**`, `__u__`, `==hl==`, `{i}`, `{red}`…). The server renders it to HTML for the cover and strips it for the text part. The table, the request lines and the signature are appended as today.

Keep sys's behaviour:
- plain-text paste
- Enter = line break, Enter twice = paragraph
- a programmatic value replaces content without an undo step

The cover's default text (the queue's `buildQualityCoverNote`) is rebuilt when the language switches **until the first manual edit** (sys's `bodyDirtyRef` rule), and never after.

Font: **my call:** the cover renders in WAQC's existing Helvetica 10pt so it matches the table, not sys's Calibri 11pt.

### 7. Language

EN/BR switch per unit, seeded the sys way (`sellerLanguage`, `shipment-board/derive.ts:161`): `companies.preferred_language`, else PT when the company is Brazilian. It translates:
- the default cover note
- the table headings and result words
- the approved-with-comments block (today Portuguese-only; it gains an English version)
- the request lines

Buyer units get the same switch, seeded the same way. The subject is unchanged.

### 8. The table (layout A)

`quality-summary.ts`, for both audiences:

- **Columns:**
  - Seller: Sample (stage · seller's sample ref; container and ICO beneath, muted) | Contract (Wolthers nr; seller ref beneath) | Quality | **one column per sieve** | Def. | Type | Cup | Result
  - Buyer: Sample | Buyer ref | Quality | sieves | Def. | Type | Cup | Result

  The ref columns are stacked so the table fits an Outlook reading pane (aim ≤ ~900 px at 9–10 pt).
- **Sieves:**
  - the union of the sieves present in that group's samples, coarse → fine, **pan last** (heading "Fundo" in PT, "Pan" in EN)
  - "—" where a sample has no value for a sieve
  - percentages of the full total including the pan, rounded the way the certificate prints them
  - the buyer side keeps showing **issued** values (`shownScreen`) when a tolerance decision substituted them
- `collapseScreenRows` / `MAX_SCREEN_LINES` and the "pan omitted" rule are removed, with their tests rewritten.
- Rejection reasons, the seller note and the tolerance block keep their places. The request lines go last under their row (§3).
- The plain-text fallback lists every sieve too.

### 9. Data on WAQC

`samples.seller_requests jsonb NULL`, one per contract row, **never synced between siblings**. Shape:
```json
{ "buyer_sample": { "company_id": "…", "company_name": "…", "saved_address_id": "…",
                    "lines": ["…"], "country": "…", "recipient_name": "…", "attention": "…",
                    "phone": "…", "instructions": "…" } | null,
  "stuffing": true,
  "set_by": "<user id>", "set_at": "<iso>" }
```
Reads are guarded (a missing column never breaks a send), the same pattern as `seller_comment`.

**Settings (§10):**
- On `qc_client_settings` (the buyer), all with `NOT NULL` defaults that reproduce today's behaviour:
  - `final_word text DEFAULT 'wolthers' CHECK IN ('wolthers','pre_approval')`
  - `final_word_fixed boolean DEFAULT false`
  - `buyer_sample_address_id uuid NULL REFERENCES company_addresses(id) ON DELETE SET NULL`
  - `stuffing_request text DEFAULT 'off' CHECK IN ('off','prechecked','fixed_on')`
- On `client_qualities` (the quality): the same four, all **nullable**, where null means "as the buyer".

The CHECK on `final_word` gains `'buyer'` in the next project; it is not added now.

### 10. Final word settings

**Where they're edited:**
- the buyer's defaults on the client page's QC side panel (Clients → client → QC)
- each quality's override on that client's Qualities tab

Lab staff only, with the same gate as the existing QC client settings.

```
Clients → Blaser → QC settings
  Buyer default
    Final word        (•) Wolthers   ( ) Pre-approval            [ ] Fixed
    Sample address    <sys default sample address, else company address>  [change]
    Stuffing request  ( ) Off   (•) Pre-checked   ( ) Fixed on

  Qualities
    Dulce     Final word  ( ) Wolthers  (•) Pre-approval        [x] Fixed
              Sample address  <as Blaser / picked>  [change]
              Stuffing  as Blaser
    Classic   as Blaser                                [set for this quality]
```

**Resolution per contract.**
- Take the contract sample's QC client (`samples.client_id`) and its quality (`samples.quality_spec_id` → `client_qualities`).
- Each field is the quality's value when set, else the buyer's, else the default (`wolthers`, not fixed, no address, `off`).
- Fields resolve independently: a quality can override only the final word and keep the buyer's stuffing rule.

**What each value does to the ticks:**

| Setting | Send sample to buyer | Stuffing |
|---|---|---|
| `wolthers`, not fixed | starts unticked, changeable | per `stuffing_request` |
| `wolthers`, fixed (Ahold) | unticked and **locked** | per `stuffing_request` |
| `pre_approval`, not fixed | starts **ticked** with the address, changeable | per `stuffing_request` |
| `pre_approval`, fixed (Blaser Dulce) | ticked and **locked**; the address can still be changed | per `stuffing_request` |
| `stuffing_request` `off` / `prechecked` / `fixed_on` | | unticked / ticked, changeable / ticked and locked |

- **The pick under the address list** is a pointer to a sys `company_addresses` row (null = fall through the default order in §4). It is never a copy, so the setting follows edits made on sys.
- **Only for PSS lots.** The settings never touch SS, Type, Stocklot or rejected lots.
- **A setting changed later** affects lots not yet emailed. It never rewrites what an already-sent email asked.

Each send logs the snapshot that went out in `email_messages.metadata.seller_requests` and a `sample_events` row (`seller_requests_sent`).

## Constraints

- **Never show `tracking_number`** (SAN-xxxxx/yy). The sys tag uses the recipient name, the email uses certificate numbers and refs, and the logs written for people use the same.
- Head office CC on every send (locked), and recipients only from `qc_certificates` contacts (unchanged).
- SQL is pasted to Daniel and he applies it. The WAQC migration is in `database/migrations/`, the sys migration in the sys repo. Check the numbering against other sessions' pending migrations.
- Keep files under ~2,000 lines:
  - `cupping-validation-modal.tsx` is 1,578 now, so the ticks and picker go in their own components.
  - `quality-summary.ts` is 983 now, so it can split its HTML/text renderers out if it grows past ~1,500.
- Work happens in worktree `WAQC-seller-email` on `feat/seller-email-requests`, off `origin/main`, and is fast-forwarded to `main` when Daniel says push (trunk-based).
- Tests: vitest. Pure builders get unit tests: table columns and sieve union, request lines in PT/EN, the sys write plan (claim, mark, insert-or-update, idempotent resend), and the markup round-trip.

## Left to the builder

- The visual design of the ticks row and the picker inside the modal and the composer card. Use existing tokens (10/6/4/0 corners, green primary).
- Whether the composer preview renders client-side from the pure builders or through a preview endpoint.
- Exact column widths and stacking in the email table, within the width aim.
- How much of sys's `destination-input.tsx` to port, versus a smaller combobox with the same sections and save flow.
- Exact wording of the EN default cover note and the EN tolerance block (mirror the PT meaning).

## Follow-on: clients with the final word (next project, not this one)

Daniel, 2026-11-18. Some buyers always have the final word, and for them we don't even pre-approve:
- We send our findings.
- The buyer (or client) presses **Approve / Approve with comments / Reject with comments**, in the certificate email or in the portal on qc.wolthers.com or sys.wolthers.com.
- They write comments on a page, and perhaps pick which part is out (screen, defects, cup).
- The seller is then emailed "the same way" (this seller email).

Nothing of this exists today. `sample_recipients` holds hand-set statuses for Other samples, and sys's email reader parses replies. This design prepares it in four ways:
- It becomes a third `final_word` value, `'buyer'`, on the same settings, per buyer and per quality.
- `qc_pre_approved_at` already means "WAQC approved, the buyer has the final word".
- The seller email (table, language, editor, request lines) is the email that project sends after the buyer decides.
- That project also fixes sys's grid reading APP after a buyer rejection.
