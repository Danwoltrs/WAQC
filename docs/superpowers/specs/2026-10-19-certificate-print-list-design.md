# Certificates page: print list, multi-number search, pagination

Date: 2026-10-19. Asked by Daniel; proposal approved in chat ("that sounds great").

## Why

Lab staff print tin labels (and sometimes bag sleeves) for a hand-picked set of
certificates: a reprint, a buyer's list of lots, a few lots spread over several
days. Today they search, tick a row, search again, tick another, and print. The
print then leaves out everything ticked before the last search.

Cause: the ticked ids do survive a new search (`selectedCertificates`, a
`Set<string>` in `src/app/certificates/page.tsx`), but the Actions menu builds
its print list with `filteredCertificates.filter(c => selectedCertificates.has(c.id))`,
and `filteredCertificates` holds only the rows on screen. Earlier ticks drop out
without any warning.

Two more problems on the same page:

- It shows the newest 100 certificates and nothing older. `GET /api/certificates`
  defaults to `limit=100` and the page never asks for more.
- The status chips, the Client / Quality / date filters and the column sort run
  in the browser over those 100 rows. A date range from last month, or a client
  with no certificate among the newest 100, silently shows little or nothing.

Daniel also wants every row at most two lines tall.

## Goals

1. Ticked certificates stay ticked across searches, filters and pages, and every
   bulk action uses all of them.
2. One Print button, opened by hovering (or a tap), that offers big tins, small
   tins, bag sleeves and today's batch for that list, and shows the list itself.
3. Search several numbers at once by pasting a list into the search box.
4. Real pagination: every certificate reachable, filters and sort correct across
   all of them, a true total.
5. No row taller than two lines.
6. Fix the internal sample number (SAN) that two print/display paths touched by
   this work still render (see "SAN fixes").

## Non-goals

- A separate sleeve-printing page or tab. Considered; it would duplicate the
  certificates page's search, filters and table. Everything lives on the
  certificates page.
- Changing what tin labels or bag sleeves print, apart from the SAN fix.
- Changing how "today's batch" is computed or how a print is stamped
  (`TinLabelSizeDialog` stamps on Print only; keep it).
- Sharing a list between users or devices.
- Printing from `/samples/qc` (it has its own selection; untouched). The one
  exception is the bag-sleeve SAN fix in section 6: both pages print through the
  same bulk route, so `/samples/qc` sleeves change with it.

## Anti-goals (would make this a failure even if it works)

- A list built earlier, forgotten, and swept into an email or a print without the
  user seeing it. Every send and print step must show what it acts on (see 1.4).
- Any new place that shows a SAN number: list rows, the stored list, file names.
- Filters that look complete but cover only part of the data.

## Already done (not part of the build)

The SENT cell is two lines: initials plus "(partial)" on top, the date beneath
(`page.tsx`, Sent column). Uncommitted at the time of writing; ships with this
work.

## The design

### 1. The ticked set becomes a list that stays

1.1 **One concept.** The ticked set is the print list. There is no separate
"add to print list" action; ticking a row adds it, unticking removes it. The
header checkbox ticks or unticks the rows on the current page only.

1.2 **Kept as snapshots, not ids filtered through the screen.** Each ticked
certificate is kept as a small snapshot so the list works when its rows are not
on screen: certificate id, certificate number, `sample_id`,
`sample.lab_source_sample_id` (tin dedupe, see `src/lib/print-selection.ts`),
the client display name, the contract ref shown in the row, `buyer_id`,
`seller_id`, and the decision (approved / rejected). Never `tracking_number`.

1.3 **Survives a reload, per user.** The list is saved in `localStorage` under a
key that includes the signed-in user's id (lab PCs are shared). Every read and
write is wrapped in try/catch and the page works without storage. When the page
restores a saved list it refreshes the snapshots from the server by id (new
`ids` parameter on `GET /api/certificates`, chunked to stay under the URI limit,
see `selectInChunks`), drops any certificate that no longer exists or whose
sample was deleted, and says how many it dropped.

1.4 **Every bulk action uses the whole list.** Download ZIP, Send to buyer,
Send to seller, tin labels and bag sleeves all act on the list, not on the rows
on screen. The single-buyer / single-seller gating for sends is computed over
the whole list. The send views already show what they will send
(`BatchApprovalSendView` lists the samples per unit; the email dialog states the
count), so a restored list cannot go out unseen.

1.5 **After an action.** A completed send clears the list, as today. A completed
print also clears it (today's behaviour, and it stops yesterday's list from being
reprinted by accident), but the confirmation toast carries a "Restore list"
action for a few seconds, so bag sleeves can follow tins from the same list.

### 2. The Print button

2.1 The toolbar gets one **Print** button. When the list is not empty it shows
the count ("Print · 7"). It replaces the separate "Today · N" button
(`PrintTodayTinLabelsButton`), and the Tin Label / Bag Sleeves entries leave the
Actions menu. Actions keeps Download ZIP, Send to buyer and Send to seller.

2.2 The menu opens when a mouse rests on the button and on click or tap (the
labs use iPads, where there is no hover). It stays open while the pointer is
inside it.

2.3 Menu contents, top to bottom:

- A header line with the count and the tin dedupe:
  "7 certificates → 5 tins" (siblings share one tin; same rule as
  `tinLabelCountNote`).
- **Tin labels 4 cm** and **Tin labels 2.5 cm**. Picking one opens the existing
  `TinLabelSizeDialog` straight at the preview step with that size (the size
  step is skipped because the size was already chosen; the dialog needs an
  initial-size prop for this).
- **Bag sleeves (6 per A4)**: opens the existing `PrintBagSleevesDialog`.
- A separator, then **Today's batch · N**: the current "Today" flow, unchanged
  (its own size step, its own stamping, its count refetched after any print).
- A separator, then the list itself: certificate number, client, contract ref,
  and an × to remove each one. It scrolls after about eight rows.
- **Clear list**.

With an empty list, the three list actions are disabled and the list area says
"Tick certificates to add them". Today's batch works regardless.

### 3. Several numbers in one search

3.1 The search box accepts a list. It splits on commas, semicolons and new lines
(a column pasted from Excel). It splits on spaces only when every space-separated
piece contains a digit, so "S-1548 S-1547 520/26" is three terms while
"Comexim EU", "Wolthers 43020" and "TEMU 565.799-2" each stay one term.

3.2 Up to 50 terms. Beyond that, the first 50 are searched and the page says so.

3.3 The server resolves each term the way it resolves one term today
(`resolveCertificateSearchIds` per term, in parallel; per term the
`certificate_number` / `issued_to` ilike parts), and returns the union. The
existing caps (`MAX_SEARCH_SAMPLE_IDS`) and the truncated / incomplete flags
apply to the union. The splitting rule is one pure helper, used by the route and
unit-tested.

3.4 Terms that matched nothing are listed under the search bar ("No match:
S-1549, 42001"), so the operator knows which tins are missing.

3.5 While a search is active, an **Add all to list** button adds every match,
on every page, not just the page shown. If the matches exceed 300 the button is
disabled and says to narrow the search.

### 4. Pagination

4.1 100 rows per page. Under the table: Previous / "Page 2 of 14" / Next. The
count in the toolbar shows the real total ("1,346 certificates").

4.2 Every filter and the sort run on the server, so pages and the total are
right: status chip, Client (the sample's QC client, as today), Quality, date
from / to, search, and the sort columns (certificate #, client, origin, issued,
status).

What the API does today and what changes:

- Already server-side: `status`, `date_from`, `date_to`, `sort_by`,
  `sort_order`, `limit`, `offset`.
- Applied after `.range()` today, so a page comes back short and `total` is the
  page's length: the deleted-sample filter and `client_id`. Both move into the
  query.
- New: a quality filter (the sample's `quality_spec_id`), an exact total, and
  sorting by the sample's origin.
- Deleted samples stay out. Certificates without a sample stay in (today's
  filter keeps them). If PostgREST cannot express "no sample, or a live sample"
  together with an exact count, a view or an RPC is fine; any SQL goes to Daniel
  as paste-ready SQL (he applies migrations himself).
- Dates are Santos calendar days, not UTC days (see `santosDayRangeUtc` in
  `src/lib/tin-label-batch.ts`).

4.3 The Client and Quality dropdowns are built today from the 100 loaded rows,
so a client with nothing among them cannot be picked. They must list every
client and quality that has a certificate, from a separate lookup.

4.4 Changing the search, a filter or the sort goes back to page 1. Paging never
touches the list.

4.5 The "newest 100 only — narrow the search" notice goes; the pager replaces
it. The search-incomplete and search-too-broad notices stay.

4.6 The certificate editor's previous / next (`editorNavigation`) walks the
current page. That is enough.

### 5. Rows at most two lines

- SENT: done (above).
- Certificate # cell: the quality line and the "Wolthers" / "No Wolthers
  contract" text are removed (Daniel, 2026-10-19). The cell is the certificate
  number plus the bare Wolthers contract number when there is one. Done.
- SS sample cell: the container number wraps at its hyphen onto a third line
  ("TEMU 565.799-" then "2"). Keep the ICO on line 1 and the container on line 2,
  never broken inside the number; if the column is too narrow, cut it with an
  ellipsis and show the full value on hover.
- Any other cell that can wrap past two lines gets the same treatment.

### 6. SAN fixes (on paths this work touches)

The house rule (CLAUDE.md): `samples.tracking_number` is never rendered.

- Bag sleeves print the SAN as their headline:
  `src/components/pdf/sample-bag-sleeve-label.tsx:241` renders
  `label.tracking_number`, filled from `tracking_number` in
  `src/app/api/samples/bulk/print-bag-sleeves/route.tsx` and
  `src/app/api/samples/[id]/print-bag-sleeve/route.tsx`. The single route also
  names the file `bag-sleeve-<SAN>.pdf`. Their QR carries it too:
  `buildCertificateQRText` puts the plain `tracking_number` on the first line of
  a text QR (phones show it on scan), and its URL is built from the SAN.
- The fix follows the tin label, which already solved all of this
  (`src/lib/sleeve-label-data.ts`, `print-tin-sleeves/route.tsx`):
  - The headline is the lot's own identifier: the container number for an SS,
    the exporter's sample number for a PSS, otherwise ICO / container / sample
    number (`sampleLabel` in `src/lib/sample-reference.ts`).
  - The sleeve's own certificate number prints in its own line. A sibling's
    sleeve shows that sibling's certificate. The right-hand column of contract
    refs is unchanged.
  - The QR is URL-only, built from the certificate number with
    `getCertificatePageUrl(certNumber, clientName)`. A sleeve with no
    certificate yet prints no QR.
  - The single-sleeve file is named after the certificate number, or the lot
    identifier when there is none.
  - This changes sleeves printed from `/samples/qc` too (same bulk route), on
    purpose: the rule is house-wide.
- The certificates list's sample cell falls back to
  `parseTrackingNumber(cert.sample.tracking_number)` for a PSS with no exporter
  sample number and for other sample types. Use `sampleLabelText` from
  `src/lib/sample-reference.ts` instead.
- The row link `href` still uses `trackingNumberToSlug`. That is the app's URL
  scheme across many pages; out of scope here.

## Constraints

- `page.tsx` is about 1,600 lines. The list (state, persistence, refresh), the
  Print menu, the pager and the search-term splitter go in their own files so the
  page stays under about 2,000 lines.
- shadcn/ui only. There is no HoverCard in `src/components/ui`; use Popover or
  DropdownMenu with hover handlers, or add the shadcn HoverCard.
- Inter, the toolbar's existing button styles, no emojis, no mock data.
- Tests (vitest): the splitter; list persistence and refresh; the route's
  filters, paging, exact total and `ids`; a page test that pins the original bug
  (tick, search again, tick, print: both are in the print). Existing page tests
  stay green.
- Trunk-based on `main`; Vercel deploys Production on push.
- Limits the list can now exceed: the ZIP route refuses more than 50
  certificates, and the send queue receives `sampleIds` in a GET query string
  (URI limit, see the `.in()` memory note). Download ZIP says so and is disabled
  above 50; the send path must survive a 300-entry list (chunk or POST).
- A single-line `<input>` drops line breaks on paste: the search box handles
  `onPaste` itself so a pasted Excel column becomes separate terms.
- "Add all to list" uses the search plus the active filters, i.e. exactly the
  rows the pager would walk.

## Left to the builder

Component and hook structure; the stored snapshot's exact shape; how per-term
"no match" is computed; view vs RPC vs plain PostgREST for the paged query; hover
open/close timing; pager styling within the existing look.

## Calls made without Daniel (check these)

1. Everything stays on the certificates page; no separate tab.
2. The ticked set and the print list are one thing, and Download / Send act on
   it too.
3. The list survives a reload, per user and per browser, refreshed from the
   server on restore.
4. A print clears the list, with "Restore list" in the toast.
5. "Today · N" moves into the Print menu as "Today's batch · N".
6. Spaces split a search only when every piece contains a digit.
7. Caps: 50 search terms; 300 for Add all.
8. Bag sleeves follow the tin label: lot identifier as headline, certificate
   number on its own line, URL-only QR from the certificate number, no QR before
   certification. This also changes sleeves printed from `/samples/qc`.
