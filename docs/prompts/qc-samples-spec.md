# WAQC — Sample Tracking Page Redesign

**Repo:** qc.wolthers.com · route `/samples/qc` · **Stack:** Next.js 14 · TypeScript · Supabase · Tailwind · shadcn/ui
**Reference mockup:** `qc-samples-redesign.html`

## Goal

Refactor the visual layer of the Sample Tracking table. Current problems: the cert number wraps mid-string (`BR-` / `025807/26`), long legal shipper names wrap to three lines, every name competes at the same weight, and rows are tall and uneven. Keep the green/black/white shadcn language — refinement only, no data-logic changes.

Core principle: **the reference numbers are the anchor.** A QC user scans by cert and container/ICO/sample number — those must never wrap, and they get the most visual weight.

---

## 1 — The Reference cell (the emphasis)

Replace the current Cert Nr column with a two-line reference cell, both lines **single-line, never wrapping**:

- **Line 1 — cert nr** (e.g. `BR-025807/26`): monospace, bold, ink color, `white-space:nowrap` + ellipsis. This is the primary anchor.
- **Line 2 — the other identifier**: monospace, muted, nowrap + ellipsis. Whichever applies — container / ICO / sample number — prefixed with a tiny faint tag so the type is obvious at a glance:
  - **CTR** → container nr (e.g. `HLXU 125.470-0`)
  - **ICO** → ICO nr (e.g. `COEXP335`)
  - **SMP** → sample nr (e.g. `26/0352`)

**Secondary-number priority** (when a sample has more than one): confirm the rule with Daniel. Default assumption — show **container** once shipped/received, otherwise **ICO**, otherwise **sample nr**. Only one secondary line is ever shown.

The micro-tag (CTR/ICO/SMP) is optional — easy to drop to one line of just the number if it reads noisy.

---

## 2 — Fantasy names, no wrapping

Every party/text column is **single-line with ellipsis** and pulls the **fantasy name**, not the legal name:

- **Quality · Shipper · Importer · End client** — fantasy name, one line, ellipsis on overflow.
- Kills the 3-line coop names (`Cooperativa dos Cafeicultores da Zona de Três Pontas Ltda` → its fantasy name on one line).
- Importer keeps its ref number as a muted monospace second line when present (e.g. `Blaser` / `106274`) — name still single-line.

---

## 3 — Small rows

- Row height ~54px, content vertically centered, max two lines.
- Empty cells: show a faint `—` only where a value is genuinely expected (e.g. Wolthers contract nr); elsewhere leave blank. No dash-graveyard.

---

## 4 — Columns

`checkbox · Reference · Type · Quality · Shipper · Wolthers · Importer · End client · Status · Created · ⋯`

- **Type** — small monospace pill (`SS` / `PSS`), gray.
- **Wolthers** — WA contract nr, monospace; blank when absent (it usually is).
- **Status** — **merged Status + Stage** into one column: status pill on top (In progress = amber, Received = blue, Certified = green, Rejected = red) with the stage as a muted caption below (Analysis, Roasting, etc.). They overlapped, and merging buys back the width that keeps every name on its line. *Flag to Daniel:* keep merged or split back out?
- **Created** — short date with a small calendar icon, nowrap.
- **Actions** — `View` button always visible; delete icon appears on row hover (red on hover).

---

## 5 — Filters (cleanup, not redesign)

Keep the existing controls, tidied to match the system: single full-width search; the row of selects (status, type, origin, quality, two dates); stage chips (`All stages · Received · Analysis · Roasting · Review · Certified · Rejected`) with the active chip in ink; `Clear all` as a quiet link; `Columns` button right-aligned.

---

## Design tokens (match the other surfaces)

```
--green:#15663f  --ink:#0d0f12  --muted:#6b7280  --faint:#9aa1ab
--border:#ececee  --border-strong:#e2e3e6  --row-hover:#fafbfb
mono: ui-monospace, SFMono-Regular, Menlo, monospace   /* all reference numbers */
status pills: prog #fdf3d7/#9a6b08 · recv #e1edfb/#1d5fb0 · cert #e7f2ec/#15663f · reject red
row height ~54px, vertically centered, 2 lines max
```

---

## Open decisions (confirm before building)

1. **Secondary-number priority** — when a sample has both a container and an ICO, which wins, and does it change by stage? (default in §1).
2. **CTR/ICO/SMP tag** — keep the micro-label or just show the bare number?
3. **Status + Stage** — keep merged into one column or split back into two?

---

## Checkpoints (ralph-loop)

1. Reference cell: cert + tagged secondary, both nowrap monospace, priority rule wired — typecheck + lint, commit.
2. Party columns pull fantasy names, single-line ellipsis everywhere; importer ref as muted second line — typecheck + lint, commit.
3. Rows to ~54px, empty-cell handling, Type pill, Wolthers blank-when-absent — typecheck + lint, commit.
4. Status+Stage merged column + status pill colors; actions hover; Created formatting — typecheck + lint, commit.
5. Filter bar tidy pass — typecheck + lint, commit.

## Out of scope

No changes to sample data model, grading/cupping logic, or the sample detail view. Presentation only.
