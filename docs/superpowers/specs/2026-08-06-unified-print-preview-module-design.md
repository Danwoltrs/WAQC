# Unified fullscreen print module + sleeve printing from /certificates — design

Date: 2026-08-06
Status: approved design, ready for planning

Follows on from `2026-08-06-tin-label-print-workflow-design.md`, which is live in
production. That work got tin labels off the screen and onto tins; this work
makes every other print surface behave the same way, and lets the certificates
page print sleeves from a certificate selection.

## Problem

Two separate complaints, one root cause.

1. **Sleeves can only be printed from /samples.** Certificates are the natural
   place to reach for a tin or bag sleeve — the number on the sleeve *is* the
   certificate number — but `/certificates` has no print action beyond
   `Today · N`. Printing a sleeve for a certified lot means switching pages and
   re-finding the row.
2. **Every print surface behaves differently.** Six printers exist and no two
   agree:

   | Surface | Where | Behaviour today |
   |---|---|---|
   | Tin Label (`TinLabelSizeDialog`) | samples bulk menu, `Today · N` on both pages | size step → `sm:max-w-3xl` iframe → print. No download |
   | Bag Sleeves | samples bulk menu | silent auto-download. No dialog, no preview |
   | Sample Labels (`PrintLabelsDialog`) | samples bulk menu | download PDF, or `window.open` + print |
   | Cupping Cards | samples bulk menu | config → `sm:max-w-[920px]` iframe → print, `window.open` fallback |
   | Certificate preview (eye icon) | certificates row | `sm:max-w-4xl` iframe, Download + Close. No print |
   | Print label (cert-editor) | cert-editor sample actions | `window.open` + print. No preview |

   Three different widths, two that never preview, two that leave a stray tab
   open, one that cannot print at all. Nothing here is broken, but nothing is
   predictable either.

`Print QR Table (Thermal)` is out of scope — it is still an `alert()` stub at
`src/app/samples/qc/page.tsx:579` with no thermal-printer integration behind it.

## Decisions taken

| Question | Decision |
|---|---|
| Scope | **All six** surfaces above route through one shell |
| Shape | **Small config dialog first, then fullscreen preview** — not a fullscreen config step, not an options rail |
| Close | X in the header **and** Esc, on every surface |
| Footer | **`Save PDF` + `Print`**, uniform — including tin labels |
| Bag sleeve QR from /certificates | **Toggle in the config dialog, default ON** |
| Bag sleeve QR from /samples | **Unchanged** — the per-row checkbox column stays authoritative |
| Tin labels from a cert selection | **Deduped to the mother sample** |
| Bag sleeves from a cert selection | **One sleeve per selected certificate** |

The uniform footer reverses an earlier call. `src/components/samples/tin-label-size-dialog.tsx:29`
argues labels should never be downloaded, because "a Downloads folder of
near-identical PDFs helps nobody". That reasoning still holds for the common
case, but consistency across six surfaces is worth more than suppressing one
button, and the safeguard below means a saved copy costs nothing.

## Part A — The shared shell

New file `src/components/print/print-preview-dialog.tsx`.

A Radix `Dialog` whose content is fullscreen, following the class pattern
already established by `INTAKE_DIALOG_CONTENT_CLASS`
(`src/components/samples/sample-intake-dialog.tsx:29`):

```
'!flex flex-col gap-0 p-0 w-screen h-[100dvh] max-w-none rounded-none border-0 overflow-hidden'
```

Radix supplies Esc-to-close, the focus trap, and the X — `src/components/ui/dialog.tsx:47`
already renders a close button at `right-4 top-4`. No bespoke keyboard handling
is needed; the requirement is met by using `Dialog` rather than the
`fixed inset-0` div that `certificate-edit-overlay.tsx:110` uses.

Layout, top to bottom:

- **Header** — title, subtitle (the batch count), and optional `headerExtra` for
  the cupping-card document switcher. `flex-shrink-0`.
- **Body** — `flex-1` iframe holding the blob URL, with explicit loading and
  error states. A blank grey rectangle and a failed render must not look alike.
- **Footer** — `Save PDF` (outline) then `Print` (primary). `flex-shrink-0`.

Props:

```ts
interface PrintPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  pdfUrl: string | null
  loading?: boolean
  error?: string | null
  saveFileName: string
  headerExtra?: React.ReactNode
  /** Overrides the default anchor download. Used by the eye-icon preview. */
  onSave?: () => void
  /** Fired after the browser print dialog has been opened. Never fired by Save. */
  onPrinted?: () => void
}
```

The shell owns the iframe ref and the `contentWindow.focus(); print()` call,
falling back to `window.open(pdfUrl)` when the iframe refuses — the fallback
`print-cupping-cards-dialog.tsx:576` already relies on. `Save PDF` downloads the
previewed blob via an anchor using `saveFileName`, unless `onSave` is supplied.
Only the eye-icon preview supplies it: its existing `handleDownload`
(`src/app/certificates/page.tsx:474`) goes through the certificate download
endpoint, which names the file from the certificate number, and that is a better
name than anything the shell could construct.

**`onPrinted` fires only from Print.** This is the safeguard that makes a
uniform Save button safe: tin labels stamp `mark-printed` and cupping cards
commit the stage advance inside `onPrinted`, so saving a copy to check something
never consumes a batch or advances a workflow stage. It preserves the existing
tin-label guarantee that "opening a preview to check something does not consume
the batch", extended to cover Save.

## Part B — Selection mapping

New file `src/lib/print-selection.ts`, holding two pure functions with unit
tests. They are pure and tested because the dedupe rule below is invisible in
the UI and would regress silently.

```ts
certificatesToTinSampleIds(certs): string[]
certificatesToBagSleeveEntries(certs, includeQrCode): Array<{ id, contractId?, includeQrCode }>
```

**Tin labels dedupe to the lot.** `src/app/api/samples/bulk/print-tin-sleeves/route.tsx:140`
emits one label per mother sample and comma-joins every certificate belonging to
it — mother first, then each sub-contract by `sort_order` — into the `Cert.`
field. One tin covers the whole lot. So a selection of a mother plus its ten
splits yields **one** label, not eleven. Certificates with a null `sample_id`
are dropped.

**Bag sleeves do not dedupe.** `src/app/api/samples/bulk/print-bag-sleeves/route.tsx:122`
emits one sleeve per config entry and takes an optional `contractId`, overriding
tracking number, contract refs, ICO and container from `sample_contracts`. So
each selected certificate maps to its own sleeve: a mother cert to
`{ id: sample_id }`, a split cert to `{ id: sample_id, contractId: sample_contract_id }`.

## Part C — The certificates bulk menu

Two items appended to `Bulk Actions` at `src/app/certificates/page.tsx:796`,
after `Send to seller` and behind a `DropdownMenuSeparator`:

- **Tin Label** — `Printer` icon. Disabled when no selected certificate has a
  `sample_id`, with the same explanatory line the existing send items use.
- **Print Bag Sleeves (6 per A4)** — `Printer` icon.

Both open their config dialog, matching the samples-page wording exactly so the
two menus read as the same actions rather than parallel ones.

When the tin dedupe collapses rows, the config step says so before anything is
generated:

> 12 certificates → 7 tin labels (splits share their lot's label)

Without this the operator counts seven sheets against twelve selected rows and
reasonably concludes the print failed.

## Part D — Surface-by-surface conversion

| Surface | Config step | Preview |
|---|---|---|
| Tin Label | size radio, unchanged size; adds the dedupe line when called from /certificates | shell; `Save PDF` added; `onPrinted` → `mark-printed` |
| Bag Sleeves | **new** small dialog — count, plus QR toggle on /certificates only | shell; replaces the silent download |
| Sample Labels | existing info panel gains a `Continue` | shell; replaces `window.open` |
| Cupping Cards | existing config, `sm:max-w-[600px]`, unchanged | shell; doc switcher moves to `headerExtra`; `onPrinted` → stage commit |
| Certificate preview (eye) | none — opens straight to the shell | shell; gains `Print`; `onSave` keeps its existing download |
| cert-editor Print label | none — opens straight to the shell | shell; replaces `window.open` |

New file `src/components/samples/print-bag-sleeves-dialog.tsx` holds the bag
sleeve config step and preview. It takes fully-resolved entries from its caller,
so the two pages keep their own QR rules without the dialog knowing which page
it is on:

- **/samples** passes entries built from the existing `selectedQrCodes` and
  `selectedSubContractQrCodes` sets. The dialog renders `QR codes: 3 of 12 rows`
  as static text — the row checkboxes remain the only way to change it.
- **/certificates** passes entries from `certificatesToBagSleeveEntries` and
  sets `qrToggle`, which renders the checkbox (default ON, since every selected
  row is by definition certified) and rewrites `includeQrCode` across the batch.

The blob-download plumbing currently inline in `handleBulkPrintBagSleeves`
(`src/app/samples/qc/page.tsx:588`) moves into the dialog, along with its two
`alert()` error paths, which become `toast.error` to match every other printer.

## Error handling

Generation failures surface as `toast.error` with the route's `error` field, as
`TinLabelSizeDialog` already does; the config step stays open so the batch can
be retried without re-selecting. Render failures inside the shell show an
in-body error with the message, never an empty frame. The tin route's
`X-Skipped-Samples` warning toast is preserved. `mark-printed` and stage-commit
failures stay non-blocking warnings — paper has already come out, and blocking
on a lab connection would be worse than a stale flag.

## Testing

- **Unit (vitest)** — `src/lib/print-selection.test.ts`: mother-only selection,
  splits-only, mother + its own splits collapsing to one id, splits across two
  lots, null `sample_id` dropped, `contractId` set only for split certs, QR flag
  applied across the batch.
- **Unit** — the shell's `onPrinted` contract: fired by Print, not fired by
  Save. This is the safeguard the uniform footer depends on.
- **Manual QA** — one tin and one bag sleeve printed from /certificates against
  a real lot with splits, checking the sheet count matches the config line, and
  that a split's sleeve carries its own tracking number and refs.

## Size impact

Two new components, ~180 and ~140 lines. `src/app/certificates/page.tsx` goes
1431 → ~1470. `src/app/samples/qc/page.tsx` shrinks slightly as the bag-sleeve
blob plumbing leaves it. All files stay under the 2000-line guidance.

## Out of scope

- `Print QR Table (Thermal)` — unimplemented stub, no behaviour to unify.
- Any change to label or sleeve *content*, page geometry, or the PDF routes
  themselves. This work changes how printing is reached and previewed, not what
  is printed. The one exception is the bag sleeve request body, which already
  supports `contractId` and needs no route change.
