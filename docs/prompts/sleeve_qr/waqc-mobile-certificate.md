# WAQC — Public certificate page, mobile rebuild

## Context

`qc.wolthers.com` serves a public certificate page reached by scanning the QR code
printed on sample label tins. The scanner is standing in a warehouse or an office
holding the physical sample. They need one thing fast: **is this lot approved, and
if not, why not.**

The current page buries that. It leads with a large wordmark, shows a status badge
with no reason attached, renders a radar chart that clips off-screen on a phone,
colours every cupping score the same olive regardless of whether it passed, omits
the lot identity that the printed label already carries, and repeats the cup
integrity block twice.

Rebuild the page around the verdict. Reference mockup: `docs/mockups/waqc-cert-mobile.html`
— match its structure and hierarchy; it is not a pixel spec.

## Scope

- `app/certificate/[sampleId]/page.tsx` (or the existing public cert route)
- Server component, data from Supabase, no client JS beyond native `<details>`
- Mobile-first. Desktop is a centred column capped at ~420px; do not build a
  separate wide layout.
- Do not touch the internal QC app, the certificate PDF generator, or the cupping
  entry screens.

## Page structure, top to bottom

### 1. Header bar

Slim. Wordmark left at ~15px, `Verified certificate` right with a small green dot.
Sticky. The current header eats roughly 15% of the viewport before any content —
the target is under 44px total.

### 2. Verdict block

- **Sample reference** at ~26px, weight 700 — see *Which reference to show* below
- Small eyebrow above it naming the sample type: `PSS · Exporter sample` or
  `SS · Container`
- Status pill right-aligned: `REJECTED` red, `APPROVED` green
- **Failure lines** below, one per failed criterion, each a flex row:
  - left: metric name (`Total defects`)
  - right: `16.9 > 12.0 max` — actual value red and bold, operator and limit muted,
    tabular numerals so multiple lines align into a column
- Red 3px left border on the group
- One muted sub-line: `Everything else within {quality} spec.`
- On approval: omit failure lines entirely, no green equivalent, just the badge.
  Do not invent a "0 issues found" row.

### 3. Lot identity

Two-column grid, full-bleed with hairline rules top and bottom:
exporter · quality · quantity (`334 bags · 20.0 MT`) · origin, then a full-width
row for certification date and bag type.

This mirrors what is printed on the label. It exists so the scanner can confirm the
certificate belongs to the tin in their hand.

### 4. Spec checklist — `Against {quality} spec`

The decision surface. One row per criterion, each with a pass/fail circle icon,
label, sub-line showing the inputs and the threshold, and the resulting value
right-aligned. Failing values red, passing values muted (not green — green on every
row makes a rejected certificate read as fine).

Rows:
| Criterion | Sub-line | Value |
|---|---|---|
| Total defects | `{primary} primary + {secondary} secondary · max {limit}` | `16.9` |
| Screen 15 and above | `min {limit}%` | `96.0%` |
| Cupping attributes | `{n} of {total} inside target range` | `Pass` / `Fail` |
| Cup integrity | `Clean and uniform · {taints} taints, {faults} faults` | `Pass` / `Fail` |

Criteria are driven by the quality template, not hardcoded. If a template omits a
criterion, omit the row.

### 5. Detail — collapsible

Native `<details>`. Screen distribution collapsed by default, cupping profile open.

**Screen distribution** — horizontal bars, label / track / percentage. Screens below
the spec floor use the dim olive. Close with a spec note stating the requirement and
this lot's rolled-up figure.

**Cupping profile** — replace the radar chart entirely. One rail per attribute:

```
Fragrance   target 4 ±1                    3.25
────────────────[══════════════]────────────
                        ▌
```

- Rail spans 0–5
- Olive band marks the target window (target ± tolerance)
- Tick marks the score
- Score and tick neutral when comfortably inside, amber near the edge (within 0.25
  of a bound), red when outside
- Scale labels `0 / 2.5 / 5` under the last attribute only

Seven attributes must be readable in one downward glance. That is the whole point of
dropping the radar.

### 6. Fixed footer

Two tiers:

- **Cup integrity strip** — four cells, full bleed, hairline dividers between them:
  taints, faults, clean cup, uniform cup. Yes green, No red, counts neutral unless
  non-zero, then red.
- **Actions** — `Download certificate` primary olive, plus a square ghost Share
  button that fires the Web Share API with a fallback to copy link.

Reserve scroll padding equal to footer height so the last rail is never trapped
behind it.

## Which reference to show

**Never display the internal `SAN-XXXXX/YY` reference on this page.** It is our own
sequence and means nothing to an exporter or a buyer — worse, it invites them to
quote it back to us in correspondence, which we do not want.

Display instead, by sample type:

| Sample type | Display | Eyebrow |
|---|---|---|
| PSS (pre-shipment sample) | Exporter's own sample number | `PSS · Exporter sample` |
| SS (shipment sample) | Container number | `SS · Container` |

Rules:

- The route may still key on the internal ID or an opaque token — this is about what
  renders, not how the record is fetched.
- The internal reference must not appear anywhere in visible text, `alt` text, the
  page `<title>`, or the share-link preview.
- Fall back to the contract reference if the expected identifier is missing. If that
  is also missing, render `Reference pending` and log it — do not silently reveal the
  internal ref.
- The download filename should follow the displayed reference, not the internal one.

**Confirm before building:** whether any other sample types reach this page (type
samples, arrival samples, offer samples) and what each should display. The mockup
assumes only PSS and SS.

## Data

Everything comes from the existing sample and cupping records plus the quality
template. The exporter sample number and container number both need to be available
on the certificate query — check they are populated for historical samples before
rolling out, since older records may only carry the internal reference. Thresholds must resolve from the template, never literals:

- `max_total_defects`
- `min_screen_15_plus`
- per-attribute `target` and `tolerance`

**Open item:** confirm the correct Dunkin thresholds with Gabriel before shipping.
The mockup uses placeholders (12.0 defects, 90% screen 15+) that are almost certainly
wrong. Also confirm whether the spec is written against the total defect count or the
secondary-equivalent count — the mockup labels 16.9 as `Total defects` to match the
current UI.

If a template has no threshold for a criterion, render the value without a pass/fail
icon rather than guessing a limit.

## Visual language

Keep the existing dark theme. Tokens as used in the mockup:

```
bg #262625   card #333331   line #3f3f3c
ink #f2efe6  muted #a8a69d  dim #7c7a73
olive #6d7f37  olive-dim #4e5a2b
red #d9534f   amber #c98a2e   green #5fae63
```

Content blocks are full-bleed with hairline rules, not floating rounded cards.
Section labels stay inset at 16px so the eye has a hook. Numeric values use tabular
numerals throughout.

## Quality floor

- Responsive to 320px without horizontal scroll
- Visible keyboard focus on the two buttons and both `<summary>` elements
- `prefers-reduced-motion` respected
- Status conveyed by text and icon, never colour alone
- Page must render usefully with cupping data absent (some lots are graded on
  physicals only) — hide the cupping rows and rail section rather than showing zeros

## Audience question — decide before building

The same QR is scanned by exporters, buyers, and our own lab. The rejection reason is
appropriate for all three, but cupper identity and sample history are not. Either:

- add a `?d=` token on the QR that unlocks internal detail, or
- keep this page buyer-safe and link internal users through to the app

Default to buyer-safe if undecided.

## Out of scope

PDF layout, the internal cupping flow, label printing, any change to how QR codes are
generated.
