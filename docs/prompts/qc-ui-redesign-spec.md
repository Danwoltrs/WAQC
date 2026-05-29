# WAQC — Clients & QC Config UI Redesign

**Repo:** qc.wolthers.com · **Stack:** Next.js 14 · TypeScript · Supabase · Tailwind · shadcn/ui
**Reference mockups:** `qc-clients-redesign.html`, `qc-detail-config-redesign.html`

## Goal

Refactor the visual layer of the Clients surfaces (list, detail header, QC Services config modal). Keep the existing green/black/white shadcn language — this is **refinement, not reinvention**. No backend logic changes except adding one client flag. **Do not remove any existing QC config option.**

The work is built around one idea: a client is either a **QC client** (gets certificates, pricing, quality specs) or **trading-only**. A single `is_qc_client` flag drives conditional display across all three surfaces.

---

## Phase 0 — Data: the QC flag

- Add boolean `is_qc_client` to the clients table (default `false`).
- Backfill: set `true` where the client has any of — assigned quality specs, QC pricing config, or issued certificates.
- Expose it on the client type / API responses already used by the list and detail pages.

**Checkpoint:** migration applied, backfill verified against a count of known QC vs trading clients, typecheck + lint clean, commit.

---

## Phase 1 — Clients list page

Replace the current table. Columns (CSS grid, not `<table>`): **Client · Type · Contact · QC pricing · Status · actions**.

**Row rules (max 2 lines tall, ~56px, vertically centered):**

- **Client cell** — line 1: fantasy/company name (semibold). Line 2 (single line, never wraps): a specs signal only:
  - has specs → muted `{n} specs` with a small doc icon
  - `is_qc_client` && no specs → amber dot + `No specs — assign` (ghost link, hover green) — this is a setup gap worth surfacing
  - trading-only → render nothing (no second line)
  - **Do not show country or contact-person name here** — that lives on the detail page.
- **Type** — pill(s): Roaster / Exporter / Trader. Plus a green **`QC`** pill **only when `is_qc_client`**. Remove the old per-row "QC Client" badge entirely.
- **Contact** — email, single line, ellipsis on overflow. Copy icon appears on row hover. Empty → soft `No email on file` (not a dash).
- **QC pricing** — `is_qc_client` only. Show rate (`$50.00 / per sample`, `1.00¢ / lb / approved only`). QC client with no pricing set → quiet `+ Set pricing` link. Trading-only → blank.
- **Status** — black toggle (on = active). Inactive rows dimmed to ~62% opacity.
- **Actions** — view / edit / delete icons, hidden until row hover. Delete icon goes red on hover.

**Empty fields render as nothing — kill the "dash graveyard."** No cell should show `–`.

**Above the table:**
- Page heading + `Import / Export` and `Add client` (black) buttons.
- Search input (single, full-width).
- Filter chips: `All {n}` · `QC clients {n}` · `Trading only {n}` · `Inactive {n}`. Active chip = black. These replace the redundant per-row QC badge.

**Checkpoint:** list renders for QC + trading + inactive clients, hover states work, no layout shift between 1- and 2-line rows, typecheck + lint clean, commit.

---

## Phase 2 — Client detail header

- **Header card:** name (large), fantasy name + country as a muted subline. Right side: `QC client` pill (only if flagged) + `Active` pill + `Edit` button.
- **Meta row:** email · type · joined date (icon + text each). This is the correct home for contact detail removed from the list.
- **Stat strip:** 4 cards — Samples / Approved (green label) / Quality specs / Certificates.
- **Tabs:** segmented control (pill-style, light gray track) — Quality Specs · Samples · Metrics.
- **QC services entry card** (only if `is_qc_client`): title + description + `Configure` button that opens the modal in Phase 3. Hide entirely for trading-only clients.

**Checkpoint:** header renders, QC entry card hidden for trading-only, typecheck + lint clean, commit.

---

## Phase 3 — QC Services Configuration modal

Two-column layout. **Preserve every existing option.** Section headers are small uppercase faint labels.

**Left — Pricing & billing:**
- Pricing model (select: Per sample / Per pound (¢/lb) / Flat fee / Complimentary)
- Billing basis (select: Approved only / All samples)
- Price/sample + Currency (USD/EUR/BRL)
- Payment terms + Who pays the fee (Client / Supplier / Split)
- Billing notes (textarea)
- Multi-origin pricing (switch)
- Company logo (dropzone, PNG ≤2MB)

**Right — Certificate pattern:**
- Include codes as **toggle chips** (not radios — both can be on): **Quality code** (e.g. AD), **Origin code** (e.g. BR).
- Starting number + Padding (digits).
- **Live preview** — recomposes as chips/inputs change. Format: `[AD-]000001[-BR]/26`, segments color-coded (quality amber, number ink, origin green). Caption describes the active pattern.
- Certificate validity period (switch).
- **Lab sequences** — editable list of `{lab name → starting number}` rows with `+ Add lab sequence`. Replaces the old "available in full edit mode" placeholder.

Footer: `Cancel` (ghost) + `Save configuration` (black).

**Two intended functional changes (improvements, keep them):**
1. Include Quality/Origin are toggles, not single-select radios.
2. Lab sequences are editable inline, not a placeholder.

**Open decision (flag to Daniel, don't guess):** the preview currently uses static example codes `AD`/`BR`. Option to instead pull a real quality + origin from the client's assigned specs so the trader sees their actual format. Leave static unless told otherwise.

**Checkpoint:** all fields present and wired to existing save logic, preview updates live, lab rows add/edit, typecheck + lint clean, commit.

---

## Design tokens (match mockups)

```
--green:        #15663f   /* QC pill, accents, focus ring */
--ink:          #0d0f12   /* primary buttons, active toggle, text */
--muted:        #6b7280
--faint:        #9aa1ab   /* secondary lines, placeholders */
--border:       #ececee
--border-strong:#e2e3e6
--qc-bg:        #e7f2ec   /* QC pill background */
--gap-amber:    #e0a83a   /* "no specs" setup-gap dot */
--radius:       12px
field height:   38px      /* inputs/selects */
row height:     ~56px, content vertically centered, max 2 lines
```

Focus state on inputs: green border + `0 0 0 3px rgba(21,102,63,.10)` ring.

---

## Out of scope

No changes to grading, cupping, certificates generation logic, or Supabase schema beyond `is_qc_client`. Pricing/cert save endpoints stay as-is — this is presentation only.
