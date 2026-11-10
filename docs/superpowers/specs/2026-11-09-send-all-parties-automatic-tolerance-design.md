# Send to all parties + automatic 5% approval

Date: 2026-11-09. Status: approved by Daniel 2026-11-09.

## Why

Anderson sends approvals and rejections to sellers by hand. The certificates page will not do it for him: bulk "Send to seller" needs every ticked certificate to share one seller, importers and roasters cannot be emailed at all, and a seller with several buyers gets them merged into one email.

The approval-with-comments rule, built in September, looks unbuilt to Daniel. It exists only as an amber button on the grading page. Both places that actually decide a lot reject a near-miss without checking the tolerance, and once rejected the button is gone.

Success: QC finalizes a lot and one action sends the right version to every party, with no hand-written emails, and a near-miss for a client who has opted in is approved without anyone clicking anything.

## Goals

1. A lot inside the tolerance is approved with comments automatically at finalize, for clients who have the rule switched on.
2. Certificates can be sent to all parties, or to the parties ticked: importer, roaster, seller.
3. A seller with lots for several buyers gets one email per buyer.
4. Only the paying client receives the certificate PDF, except for clients set to share it with everyone (Dunkin').

## Non-goals

- Changing the tolerance size, or making it vary by quality template.
- CVA (specialty) lots: they stay out of the automatic rule. Their grading-page visibility is not part of this work (Daniel confirmed it was already fixed).
- Re-deciding lots already rejected. No backfill.
- The single-sample "Send approval email" route (`notify-approval`).
- Any new contact store, or any new recipient purpose.

## Must never happen

- An importer, roaster or client sees the real numbers, the gap, or any mention of tolerance on an approved-with-comments lot.
- A non-paying party's send files a document on a contract or writes a decision to sys.
- An email goes to anyone not tagged `qc_certificates` on the shared contacts table, unless a person typed that address in the composer.
- The same certificate goes to the same party twice without someone asking for it.
- The internal sample number (`samples.tracking_number`) appears in anything a person sees.

## Part 1: automatic 5% approval

### Rule

When a lot is decided and it fails compliance, evaluate the tolerance. It is approved with comments, with no human step, when all of these hold:

- The lot's client has the 5% rule on (see "Client settings"). A lot with no client, or no settings row, is off.
- When the lot covers several contracts for different clients, every one of those clients has it on. The contracts share one decision, so the strictest client wins. *(Claude's call, agreed in conversation.)*
- `evaluateTolerance` offers it: every failing criterion is tolerable and within its limit.
- `computeIssuedValuesForSample` succeeds. If the adjusted values cannot be made to pass every limit, the lot is rejected as normal.

The tolerance stays as `src/lib/tolerance/limits.ts` has it: 5 percentage points on screens and pan, 5 full defects over the maximum. Daniel confirmed the defect figure. Primary defects, cup, taints, moisture and any miss beyond tolerance still reject, including when other misses on the same lot are inside it.

### Where it runs

Both commodity decision points, at the moment each would otherwise reject:

- `POST /api/cupping/finalize` (`src/app/api/cupping/finalize/route.ts`, the compliance evaluation near line 314), when cupping is finalized last.
- `certifyAfterGrading` (`src/lib/cupping/certify-after-grading.ts`), when grading is finalized last.

The CVA finalize route is not touched.

### What it does

Exactly what `POST /api/samples/[id]/approve-with-comments` does today after its checks: record the `sample_tolerance_approvals` row, apply the approved decision to the group, mint with no violations, stamp the grading finalized, set `samples.approved_with_comments` last, then email the seller at once. Move that sequence into one shared function so the paths cannot drift.

**If it fails partway:** the lot ends undecided, in Review, with a visible error, and finalizing again retries it. *(Claude's call.)* Neither alternative is acceptable with nobody watching: falling back to rejection sends a seller a false rejection over a database error, and today's manual-route end state (approved, flag off) would certify a failing lot and print its out-of-spec numbers to the buyer. So the shared function must never leave a lot approved without `approved_with_comments` set, and both callers need a working retry: `certifyAfterGrading` already swallows errors and returns null, while `cupping/finalize` has none yet and has already frozen the scores by this point, so repeating it must be safe. Doing the writes in one Postgres function is acceptable, since this work already ships SQL for Daniel to apply. A failed seller email is not a failure of the decision: that seller stays unsent for the batch, as today.

Comments are the prefilled Portuguese lines from `src/lib/tolerance/comments.ts`, and the additional-sample request is on, both as the confirm dialog defaults them today.

Timing does not change (Daniel, 2026-09-29): the seller hears at once, and the client gets its certificate with the end-of-day batch.

### What goes away

The grading-page banner and confirm dialog (`tolerance-banner.tsx`, `tolerance-confirm-dialog.tsx`, the fetch at `src/app/grading/page.tsx:224`). Whether the two API routes are deleted or kept unused is left to the builder.

Undoing an automatic approval is Override Status on the certificate, which already clears the flag and restores the measured values.

## Part 2: send to all parties

### Parties

| Party | Company | Version of the email | PDF by default |
|---|---|---|---|
| Client (the existing `buyer` side) | existing buyer resolution in `resolveCertificateParties` | client's version | yes |
| Importer | `samples.importer_id` | client's version | only if shared with everyone |
| Roaster | `samples.roaster_id` | client's version | only if shared with everyone |
| Seller | existing seller resolution | seller's version | only if shared with everyone |

"Client's version" means the current buyer table: adjusted numbers, status Approved, no comments. The seller's version is the current seller table: real numbers, the requirement, the gap and the action. Rejections show real values to everyone.

A company holding more than one buyer-side role on a certificate gets one email, in the first of client, importer, roaster. Blaser is client and importer, so it gets one email. A company that is both seller and buyer-side gets both emails, because the content differs.

Keep `'buyer'` as the stored side for the client, so existing send history still reads correctly. Add `'importer'` and `'roaster'`.

### One email per what

- Client, importer, roaster: one email per (company, party), as buyers work today. A company that is the client on some certificates and the importer or roaster on others gets one email for each role, so every email keeps a single party. *(Claude's call.)* That keeps the "only the client's send files on the contract" rule per email rather than per line.
- Seller: one email per (seller, QC client). `samples.client_id` is the split key, and a lot with no client is its own bucket. Grouping and subject already name the client.

Order: clients, importers, roasters, sellers. The composer's "Buyer 1 of N" header and the "Now sending to SELLERS" divider follow the parties. Send, Skip and "Send all remaining" stay.

### Choosing the parties

Importer, roaster and seller checkboxes, plus "All parties", all ticked by default. The client is always included. *(Claude's calls.)*

- **Send unsent:** the checkboxes join the QC client step (`qc-client-step.tsx`).
- **Actions menu:** one "Send" item replaces "Send to buyer" and "Send to seller", with no single-buyer or single-seller restriction, and opens the same picker.

Actions sends skip certificate-and-party pairs already sent, unless an "Include already sent" box is ticked. Today's explicit mode resends everything, which would re-mail the client on every "All parties" press. *(Claude's call.)*

### Certificate attachment

Default per certificate: attach for the client, or for any party when that certificate's client has "share certificates with everyone" on. An importer or roaster's email can mix clients, so the default can differ within one email. The composer's "Attach certificates" checkbox remains an override for the whole email.

A Dunkin' seller on a 5% lot gets the PDF with the adjusted numbers and the email with the real ones. Daniel has seen this and did not object.

### Things that must change with it

- `sendCertificateUnit` annexes and writes back on `!isSeller && attachment && contractId`. It must become `side === 'buyer'`, or an importer send files documents and re-stamps sys.
- Audience follows the party, not the PDF. Importer and roaster render as `'buyer'`, including `sellerComment: false`.
- `toSendStatusRows` drops anything but buyer and seller. `computeSendStatus`, `SampleSendStatus`, the certificates list enrichment and the Sent column need all four parties.
- `sendSellerNoticeNow` must handle several units for one seller, which the split now produces.
- Check any other reader of `email_messages.metadata.side`.

### Send history for importers and roasters

They have never been emailed. Treating old certificates as owed would queue four weeks of mail on day one. "Send unsent" and the `(partial)` marker therefore count importer and roaster only for certificates issued on or after a go-live date set in code. Older certificates can still be sent to them from Actions. *(Claude's call.)*

### Recipients

Unchanged: contacts tagged `qc_certificates`, no fallback, house CC locked. A company with none is flagged in the composer and does not stop the others.

## Client settings

Two switches on the client's QC config panel (`qc-config-panel.tsx`, using its `SwitchRow`), saved through the existing client route:

- **Automatic 5% approval**: off for every client at launch; switched on one by one. Daniel's decision, because it changes a buyer's certificate with nobody reviewing it.
- **Share certificates with everyone**: off by default; switched on for Dunkin'.

Consequence to expect: from go-live until a client is ticked, its near-misses are rejected with no button to rescue them.

SQL, pasted for Daniel to apply before the code is pushed:

```sql
ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS tolerance_auto_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificates_to_all_parties boolean NOT NULL DEFAULT false;
```

## Conventions

Company labels use `companyDisplayName()`. No emojis. Show the certificate number, never the internal sample number. Files stay under about 2,000 lines. Daniel applies all migrations. Work starts from current `main`; this checkout is 32 commits behind, and `resolve-panels.ts` differs there.

## Acceptance

- A client with the rule on, Screen 18 at 28% against a minimum of 30%: finalize approves, the client's PDF and QR page show 30%, and the seller email shows 28% against 30%, gap 2, with the improvement request and additional sample.
- The same lot, rule off: rejected, no button anywhere.
- Same result whether cupping or grading is finalized last.
- Defects 17 against a maximum of 12: approved. Defects 18: rejected.
- Screen inside tolerance plus a failed cup: rejected.
- A lot covering two clients, one on and one off: rejected.
- Blaser as client and importer: one email, with PDF.
- Seller with lots for two clients: two emails, each naming its client.
- Non-Dunkin' lot: importer, roaster and seller get no PDF. Dunkin' lot: all get it.
- An importer send creates no `documents` row and writes nothing to `shipment_samples`.
- Pressing "All parties" twice does not re-mail anyone unless "Include already sent" is ticked.
- 17 mixed-seller Blaser certificates can be sent from Actions.
- A certificate issued before go-live does not queue for its importer or roaster under "Send unsent".

## Left to the builder

File layout, the name and home of the shared decision function, the picker's exact layout, the form of the go-live constant, and whether the old tolerance routes are removed.
